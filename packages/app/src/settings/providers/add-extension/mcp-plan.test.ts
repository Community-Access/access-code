import { describe, expect, test } from "bun:test"
import {
  buildCustomMcp,
  buildPlan,
  customMcpIssue,
  keychainName,
  missingInputs,
  planServer,
  serverSlug,
  splitCommand,
  type RegistryServer,
} from "./mcp-plan"

const smithery: RegistryServer = {
  name: "ai.smithery/smithery-ai-github",
  remotes: [
    {
      type: "streamable-http",
      url: "https://server.smithery.ai/@smithery-ai/github/mcp",
      headers: [{ name: "Authorization", isRequired: true, isSecret: true, value: "Bearer {smithery_api_key}" }],
    },
  ],
}

const npmServer: RegistryServer = {
  name: "io.github.example/Weather Server",
  packages: [
    {
      registryType: "npm",
      identifier: "@example/weather",
      version: "1.2.3",
      transport: { type: "stdio" },
      packageArguments: [{ type: "positional", value: "mcp" }],
      environmentVariables: [
        { name: "UNITS", default: "metric" },
        { name: "WEATHER_TOKEN", isRequired: true, isSecret: true, description: "API token" },
      ],
    },
  ],
  remotes: [
    {
      type: "streamable-http",
      url: "https://weather.example/mcp",
      headers: [{ name: "Authorization", isRequired: true, isSecret: true }],
    },
  ],
}

describe("planServer", () => {
  test("prefers a remote that needs no inputs", () => {
    const plan = planServer({
      ...npmServer,
      remotes: [...(npmServer.remotes ?? []), { type: "sse", url: "https://open.example/sse" }],
    })

    expect(plan).toMatchObject({ type: "remote", url: "https://open.example/sse", inputs: [] })
  })

  test("uses a stdio package before a remote that asks for keys", () => {
    expect(planServer(npmServer)).toMatchObject({ type: "local", runtime: "npx" })
  })

  test("falls back to a remote with inputs, and gives up on unsupported packages", () => {
    expect(planServer(smithery)?.type).toBe("remote")
    expect(
      planServer({
        name: "x/y",
        packages: [{ registryType: "mcpb", identifier: "https://example.com/x.mcpb" }],
        remotes: [{ type: "streamable-http", url: "https://{tenant}.example/mcp" }],
      }),
    ).toBeUndefined()
    expect(
      planServer({
        name: "x/y",
        packages: [{ registryType: "npm", identifier: "z", transport: { type: "streamable-http" } }],
      }),
    ).toBeUndefined()
  })
})

describe("buildPlan", () => {
  test("npm package: npx command, plain values inline, secrets as Keychain references", () => {
    const plan = planServer(npmServer)

    if (!plan) throw new Error("no plan")
    expect(plan.inputs.map((input) => [input.key, input.required, input.secret, input.initial])).toEqual([
      ["env:UNITS", false, false, "metric"],
      ["env:WEATHER_TOKEN", true, true, ""],
    ])
    expect(missingInputs(plan.inputs, { "env:UNITS": "metric" }).map((input) => input.key)).toEqual([
      "env:WEATHER_TOKEN",
    ])

    expect(buildPlan(plan, "weather", { "env:UNITS": "imperial", "env:WEATHER_TOKEN": " secret \n" })).toEqual({
      config: {
        type: "local",
        command: ["npx", "-y", "@example/weather@1.2.3", "mcp"],
        environment: { UNITS: "imperial", WEATHER_TOKEN: "{keychain:mcp-weather-WEATHER_TOKEN}" },
      },
      keychain: { "mcp-weather-WEATHER_TOKEN": "secret" },
    })
  })

  test("leaves out an optional value left empty", () => {
    const plan = planServer(npmServer)

    if (!plan) throw new Error("no plan")
    expect(buildPlan(plan, "weather", { "env:UNITS": "", "env:WEATHER_TOKEN": "t" }).config).toEqual({
      type: "local",
      command: ["npx", "-y", "@example/weather@1.2.3", "mcp"],
      environment: { WEATHER_TOKEN: "{keychain:mcp-weather-WEATHER_TOKEN}" },
    })
  })

  test("remote header template keeps its fixed text around the Keychain reference", () => {
    const plan = planServer(smithery)

    if (!plan) throw new Error("no plan")
    expect(plan.inputs).toMatchObject([{ key: "header:Authorization:smithery_api_key", label: "smithery_api_key" }])
    expect(buildPlan(plan, "github", { "header:Authorization:smithery_api_key": "abc" })).toEqual({
      config: {
        type: "remote",
        url: "https://server.smithery.ai/@smithery-ai/github/mcp",
        headers: { Authorization: "Bearer {keychain:mcp-github-smithery_api_key}" },
      },
      keychain: { "mcp-github-smithery_api_key": "abc" },
    })
  })

  test("a value named like a key goes to the Keychain even when the registry does not mark it secret", () => {
    const plan = planServer({
      name: "x/unmarked",
      remotes: [
        {
          type: "streamable-http",
          url: "https://x.example/mcp",
          headers: [{ name: "Authorization", value: "Bearer {api_key}" }],
        },
      ],
    })

    if (!plan) throw new Error("no plan")
    expect(buildPlan(plan, "unmarked", { "header:Authorization:api_key": "k" }).keychain).toEqual({
      "mcp-unmarked-api_key": "k",
    })
  })

  test("pypi uses uvx and oci passes variables to docker by name", () => {
    const pypi = planServer({
      name: "x/py",
      packages: [
        {
          registryType: "pypi",
          identifier: "medium-ops",
          version: "0.1.2",
          packageArguments: [{ type: "positional", value: "serve" }],
        },
      ],
    })
    const oci = planServer({
      name: "x/oci",
      packages: [
        {
          registryType: "oci",
          identifier: "ghcr.io/example/server",
          version: "2.0.0",
          environmentVariables: [{ name: "REGION", isRequired: true }],
        },
      ],
    })

    if (!pypi || !oci) throw new Error("no plan")
    expect(buildPlan(pypi, "py", {}).config).toEqual({ type: "local", command: ["uvx", "medium-ops==0.1.2", "serve"] })
    expect(buildPlan(oci, "oci", { "env:REGION": "eu" }).config).toEqual({
      type: "local",
      command: ["docker", "run", "-i", "--rm", "-e", "REGION", "ghcr.io/example/server:2.0.0"],
      environment: { REGION: "eu" },
    })
  })

  test("a required argument without a value becomes an input", () => {
    const plan = planServer({
      name: "x/args",
      packages: [
        {
          registryType: "npm",
          identifier: "kit",
          packageArguments: [
            { type: "positional", value: "mcp" },
            { type: "named", name: "--bundle", valueHint: "bundle_path", isRequired: true },
            { type: "named", name: "--verbose" },
          ],
        },
      ],
    })

    if (!plan) throw new Error("no plan")
    expect(plan.inputs.map((input) => input.label)).toEqual(["bundle_path"])
    expect(buildPlan(plan, "kit", { "arg:1": "/tmp/b" }).config).toEqual({
      type: "local",
      command: ["npx", "-y", "kit", "mcp", "--bundle", "/tmp/b"],
    })
  })

  test("a required argument with a default is a field filled with it", () => {
    const plan = planServer({
      name: "io.github.modelcontextprotocol/filesystem",
      packages: [
        {
          registryType: "npm",
          identifier: "@modelcontextprotocol/server-filesystem",
          transport: { type: "stdio" },
          packageArguments: [
            { type: "positional", valueHint: "Allowed folder", default: "/Users/me", isRequired: true },
          ],
        },
      ],
    })

    if (!plan) throw new Error("no plan")
    expect(plan.inputs).toMatchObject([{ key: "arg:0", label: "Allowed folder", required: true, initial: "/Users/me" }])
    expect(buildPlan(plan, "filesystem", { "arg:0": "/Users/me/Code" }).config).toEqual({
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Code"],
    })
  })

  // The shapes the server maps Docker MCP Catalog entries to (packages/server/src/extension-catalog.ts).
  test("a Docker catalog image runs with docker run, secrets in the Keychain and fixed env inline", () => {
    const plan = planServer({
      name: "brave",
      packages: [
        {
          registryType: "oci",
          identifier: "mcp/brave-search@sha256:abc",
          transport: { type: "stdio" },
          environmentVariables: [
            { name: "BRAVE_API_KEY", isSecret: true, isRequired: true },
            { name: "BRAVE_MCP_TRANSPORT", value: "stdio" },
          ],
          packageArguments: [],
        },
      ],
    })

    if (!plan) throw new Error("no plan")
    expect(plan.inputs.map((input) => input.label)).toEqual(["BRAVE_API_KEY"])
    expect(buildPlan(plan, "brave", { "env:BRAVE_API_KEY": "k" })).toEqual({
      config: {
        type: "local",
        command: [
          "docker",
          "run",
          "-i",
          "--rm",
          "-e",
          "BRAVE_API_KEY",
          "-e",
          "BRAVE_MCP_TRANSPORT",
          "mcp/brave-search@sha256:abc",
        ],
        environment: { BRAVE_API_KEY: "{keychain:mcp-brave-BRAVE_API_KEY}", BRAVE_MCP_TRANSPORT: "stdio" },
      },
      keychain: { "mcp-brave-BRAVE_API_KEY": "k" },
    })
  })

  test("a Docker catalog remote asks for the key its header names", () => {
    const plan = planServer({
      name: "context7",
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.context7.com/mcp",
          headers: [{ name: "CONTEXT7_API_KEY", value: "{CONTEXT7_API_KEY}", isSecret: true, isRequired: true }],
        },
      ],
    })

    if (!plan) throw new Error("no plan")
    expect(buildPlan(plan, "context7", { "header:CONTEXT7_API_KEY:CONTEXT7_API_KEY": "k" })).toEqual({
      config: {
        type: "remote",
        url: "https://mcp.context7.com/mcp",
        headers: { CONTEXT7_API_KEY: "{keychain:mcp-context7-CONTEXT7_API_KEY}" },
      },
      keychain: { "mcp-context7-CONTEXT7_API_KEY": "k" },
    })
  })
})

test("keychainName and serverSlug keep only safe characters", () => {
  expect(keychainName("my server", "Authorization: x")).toBe("mcp-my-server-Authorization--x")
  expect(keychainName("a", "b".repeat(200))).toHaveLength(128)
  expect(serverSlug("io.github.example/Weather Server")).toBe("weather-server")
  expect(serverSlug("com.githubcard/mcp")).toBe("githubcard")
  expect(serverSlug("///")).toBe("server")
})

test("splitCommand honors quotes and escapes", () => {
  expect(splitCommand(`npx -y "@scope/pkg" --dir 'My Files' a\\ b ""`)).toEqual([
    "npx",
    "-y",
    "@scope/pkg",
    "--dir",
    "My Files",
    "a b",
    "",
  ])
  expect(splitCommand("   ")).toEqual([])
})

describe("custom MCP", () => {
  const base = { name: "local-db", kind: "local" as const, command: "uvx db-mcp --ro", url: "", rows: [] }

  test("validation names the first field to fix", () => {
    expect(customMcpIssue({ ...base, name: "bad name" })).toBe("name")
    expect(customMcpIssue({ ...base, command: "  " })).toBe("command")
    expect(customMcpIssue({ ...base, kind: "remote", url: "example.com" })).toBe("url")
    expect(customMcpIssue({ ...base, rows: [{ name: " ", value: "x", secret: false }] })).toBe("row")
    expect(customMcpIssue(base)).toBeUndefined()
  })

  test("rows marked as keys go to the Keychain", () => {
    expect(
      buildCustomMcp({
        ...base,
        rows: [
          { name: "DB_URL", value: "postgres://localhost", secret: false },
          { name: "DB_PASSWORD", value: "hunter2", secret: true },
          { name: "", value: "", secret: false },
        ],
      }),
    ).toEqual({
      name: "local-db",
      config: {
        type: "local",
        command: ["uvx", "db-mcp", "--ro"],
        environment: { DB_URL: "postgres://localhost", DB_PASSWORD: "{keychain:mcp-local-db-DB_PASSWORD}" },
      },
      keychain: { "mcp-local-db-DB_PASSWORD": "hunter2" },
    })
    expect(
      buildCustomMcp({
        ...base,
        kind: "remote",
        url: " https://x.example/mcp ",
        rows: [{ name: "X-Key", value: "k", secret: true }],
      }),
    ).toEqual({
      name: "local-db",
      config: { type: "remote", url: "https://x.example/mcp", headers: { "X-Key": "{keychain:mcp-local-db-X-Key}" } },
      keychain: { "mcp-local-db-X-Key": "k" },
    })
  })
})
