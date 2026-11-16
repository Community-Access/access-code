import type { ConfigEntry, PluginInfo } from "@opencode/client/promise"
import { describe, expect, test } from "bun:test"
import { mcpOrigin, mcpRuns, pluginOrigin, skillOrigin } from "./extension-origin"

const GLOBAL = "/Users/me/.config/opencode"

// Built as config.get returns them: documents from lowest to highest priority.
const entries = [
  { type: "directory", path: GLOBAL },
  {
    type: "document",
    path: `${GLOBAL}/opencode.jsonc`,
    info: {
      mcp: {
        servers: {
          brave: {
            type: "local",
            command: ["docker", "run", "-i", "--rm", "-e", "KEY", "mcp/brave"],
            environment: { KEY: "{keychain:mcp-brave-KEY}", OTHER: "{keychain:shared}" },
          },
          context7: {
            type: "remote",
            url: "https://mcp.context7.com/mcp",
            headers: { Authorization: "Bearer {keychain:shared}" },
          },
          docs: { type: "remote", url: "https://docs.example.com/mcp" },
        },
      },
      plugins: ["opencode-pty@1.2.0", { package: "@scope/notes", options: {} }],
    },
  },
  {
    type: "document",
    path: "/Users/me/Code/app/opencode.json",
    info: {
      mcp: { servers: { docs: { type: "remote", url: "https://docs.example.com/project" } } },
      plugins: ["project-only"],
    },
  },
  { type: "document", info: { mcp: { servers: { console: { type: "remote", url: "https://console.example" } } } } },
] as unknown as ConfigEntry[]

const pkg = (target: string) =>
  ({ id: target, source: { type: "package", target }, features: {}, state: { status: "active" } }) as PluginInfo

describe("mcpOrigin", () => {
  test.each([
    ["brave", { type: "global", path: `${GLOBAL}/opencode.jsonc` }],
    // A project file that sets the same name wins, so removing it from the global file would not remove it.
    ["docs", { type: "file", path: "/Users/me/Code/app/opencode.json" }],
    ["console", { type: "other" }],
    ["from-a-plugin", { type: "other" }],
  ])("%s", (name, expected) => {
    expect(mcpOrigin(name, entries, `${GLOBAL}/`)).toEqual(expected as never)
  })
})

describe("pluginOrigin", () => {
  test("matches by package name and returns the spec as written", () => {
    expect(pluginOrigin(pkg("opencode-pty"), entries, GLOBAL)).toEqual({
      origin: { type: "global", path: `${GLOBAL}/opencode.jsonc` },
      spec: "opencode-pty@1.2.0",
    })
    expect(pluginOrigin(pkg("@scope/notes@2.0.0"), entries, GLOBAL).spec).toBe("@scope/notes")
  })

  test("a project plugin or a local file is not the global file's to remove", () => {
    expect(pluginOrigin(pkg("project-only"), entries, GLOBAL).origin).toEqual({
      type: "file",
      path: "/Users/me/Code/app/opencode.json",
    })
    const local = { source: { type: "local", path: "/x/plugin.ts" }, features: {}, state: { status: "active" } }
    expect(pluginOrigin(local as PluginInfo, entries, GLOBAL).origin).toEqual({ type: "other" })
  })
})

describe("skillOrigin", () => {
  const skills = `${GLOBAL}/skills`

  test.each([
    [`${skills}/web-design/SKILL.md`, { type: "global", path: `${skills}/web-design` }, "web-design"],
    [`${skills}/nested/deeper/SKILL.md`, { type: "global", path: `${skills}/nested` }, "nested"],
    ["/Users/me/.claude/skills/x/SKILL.md", { type: "file", path: "/Users/me/.claude/skills/x" }, undefined],
    [`${GLOBAL}/skills-other/x/SKILL.md`, { type: "file", path: `${GLOBAL}/skills-other/x` }, undefined],
    ["skill://console/x/SKILL.md", { type: "other" }, undefined],
    [`${skills}/.hidden/SKILL.md`, { type: "other" }, undefined],
  ])("%s", (path, origin, folder) => {
    expect(skillOrigin({ path }, skills)).toEqual({ origin: origin as never, folder })
  })
})

test("mcpRuns reads where the winning config runs the server", () => {
  expect([mcpRuns("brave", entries), mcpRuns("docs", entries), mcpRuns("missing", entries)]).toEqual([
    "docker",
    "remote",
    undefined,
  ])
})
