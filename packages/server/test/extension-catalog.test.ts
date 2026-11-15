import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { ExtensionCatalog } from "@opencode/schema/extension-catalog"
import { Schema } from "effect"
import {
  commandOutput,
  dockerServers,
  filterSkills,
  insideFolder,
  installArgs,
  mergeSkills,
  removeArgs,
  searchDocker,
  skillsFromResponse,
} from "../src/extension-catalog"

const catalog = {
  registry: {
    brave: {
      title: "Brave Search",
      description: "Search the Web",
      type: "server",
      image: "mcp/brave-search@sha256:abc",
      upstream: "https://github.com/brave/brave-search-mcp-server",
      source: "https://github.com/brave/brave-search-mcp-server/tree/123",
      secrets: [{ name: "brave.api_key", env: "BRAVE_API_KEY", description: "Your key" }],
      env: [{ name: "BRAVE_MCP_TRANSPORT", value: "stdio" }],
      metadata: { pulls: 300, githubStars: 10, category: "search", tags: ["brave", "web"] },
    },
    context7: {
      title: "Context7",
      description: "Docs",
      type: "remote",
      remote: {
        transport_type: "streamable-http",
        url: "https://mcp.context7.com/mcp",
        headers: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}", Accept: "application/json" },
      },
      secrets: [{ env: "CONTEXT7_API_KEY" }],
      metadata: { tags: ["documentation"] },
    },
    couchbase: {
      title: "Couchbase",
      type: "server",
      image: "mcp/couchbase",
      env: [{ name: "CB_USERNAME", value: "{{couchbase.cb_username}}" }],
      config: [{ properties: { cb_username: { description: "Username" } }, required: ["cb_username"] }],
      metadata: { pulls: 300, githubStars: 50 },
    },
    notion: {
      title: "Notion",
      type: "server",
      image: "mcp/notion",
      env: [{ name: "HEADERS", value: '{"Notion-Version": "2022-06-28"}' }],
      metadata: { pulls: 5 },
    },
    commander: {
      title: "Desktop Commander",
      type: "server",
      image: "mcp/desktop-commander",
      volumes: ["{{desktop-commander.paths|volume|into}}"],
      metadata: { pulls: 1000 },
    },
    broken: "not an entry",
  },
}

describe("Docker MCP Catalog", () => {
  const servers = dockerServers(catalog)
  const byName = (name: string) => searchDocker(servers, undefined).find((server) => server.name === name)

  test("sorts by pulls, then GitHub stars, and skips entries it cannot read", () => {
    expect(searchDocker(servers, undefined).map((server) => server.name)).toEqual([
      "commander",
      "couchbase",
      "brave",
      "notion",
      "context7",
    ])
  })

  test("runs an image over stdio with its secrets and fixed env", () => {
    expect(byName("brave")).toMatchObject({
      title: "Brave Search",
      repository: { url: "https://github.com/brave/brave-search-mcp-server" },
      packages: [
        {
          registryType: "oci",
          identifier: "mcp/brave-search@sha256:abc",
          transport: { type: "stdio" },
          environmentVariables: [
            { name: "BRAVE_API_KEY", description: "Your key", isSecret: true, isRequired: true },
            { name: "BRAVE_MCP_TRANSPORT", value: "stdio" },
          ],
        },
      ],
    })
  })

  test("turns ${VAR} headers into registry placeholders, secret when a secret names them", () => {
    expect(byName("context7")?.remotes).toMatchObject([
      {
        type: "streamable-http",
        url: "https://mcp.context7.com/mcp",
        headers: [
          { name: "CONTEXT7_API_KEY", value: "{CONTEXT7_API_KEY}", isSecret: true, isRequired: true },
          { name: "Accept", value: "application/json" },
        ],
      },
    ])
  })

  test("turns {{server.setting}} env into a placeholder described by the config", () => {
    expect(byName("couchbase")?.packages?.[0]?.environmentVariables).toMatchObject([
      { name: "CB_USERNAME", value: "{cb_username}", description: "Username", isRequired: true },
    ])
  })

  test("keeps a value with its own braces as an editable default", () => {
    expect(byName("notion")?.packages?.[0]?.environmentVariables).toMatchObject([
      { name: "HEADERS", default: '{"Notion-Version": "2022-06-28"}' },
    ])
  })

  test("leaves a server that needs a mounted folder without a way to run it", () => {
    expect(byName("commander")?.packages).toBeUndefined()
    expect(byName("commander")?.remotes).toBeUndefined()
  })

  test("search matches every word across name, title, description and tags", () => {
    expect(searchDocker(servers, "brave web").map((server) => server.name)).toEqual(["brave"])
    expect(searchDocker(servers, "documentation").map((server) => server.name)).toEqual(["context7"])
    expect(searchDocker(servers, "brave docs")).toEqual([])
  })
})

describe("skills.sh", () => {
  const skill = (id: string, installs?: number) => ({
    id,
    source: id.split("/").slice(0, 2).join("/"),
    skillId: id.split("/")[2],
    name: id.split("/")[2],
    ...(installs === undefined ? {} : { installs }),
  })

  test("maps results and merges searches by id, most installed first", () => {
    const react = skillsFromResponse({ query: "react", skills: [skill("a/b/react", 10), skill("a/b/web", 50)] })
    const design = skillsFromResponse({ skills: [skill("a/b/web", 50), skill("c/d/design")] })

    expect(design[1]).toEqual(
      new ExtensionCatalog.Skill({ id: "c/d/design", source: "c/d", skillId: "design", name: "design", installs: 0 }),
    )
    expect(mergeSkills([react, design]).map((item) => item.id)).toEqual(["a/b/web", "a/b/react", "c/d/design"])
    expect(filterSkills(mergeSkills([react, design]), "C/D").map((item) => item.id)).toEqual(["c/d/design"])
  })

  test("rejects a response without skills", () => {
    expect(() => skillsFromResponse({ results: [] })).toThrow()
  })
})

describe("skills CLI input", () => {
  const install = Schema.decodeUnknownOption(ExtensionCatalog.SkillInstallInput)
  const remove = Schema.decodeUnknownOption(ExtensionCatalog.SkillRemoveInput)

  test.each([
    ["vercel-labs/agent-skills", "vercel-react-best-practices", true],
    ["owner/repo.js", "plugin:skill_1.2", true],
    ["owner", "skill", false],
    ["owner/repo/extra", "skill", false],
    ["-g/repo", "skill", false],
    ["owner/.hidden", "skill", false],
    ["owner/repo", "--all", false],
    ["owner/repo", "skill name", false],
    ["owner/repo", "a;rm -rf ~", false],
    ["owner/repo", "x".repeat(101), false],
  ])("install %s %s is %p", (source, skill, valid) => {
    expect(install({ source, skill })._tag).toBe(valid ? "Some" : "None")
  })

  test.each([
    ["web-design", true],
    ["..", false],
    ["../other", false],
    ["a/b", false],
    ["-y", false],
    ["", false],
  ])("remove %s is %p", (skill, valid) => {
    expect(remove({ skill })._tag).toBe(valid ? "Some" : "None")
  })

  test("installs one skill globally for OpenCode only, as a copy", () => {
    expect(installArgs({ source: "o/r", skill: "s" })).toEqual([
      "add",
      "o/r",
      "--skill",
      "s",
      "-g",
      "-a",
      "opencode",
      "-y",
      "--copy",
    ])
    expect(removeArgs({ skill: "s" })).toEqual(["remove", "s", "-g", "-a", "opencode", "-y"])
  })

  test("removes color codes from output", () => {
    expect(commandOutput("\u001b[32mInstalled\u001b[0m skill\n")).toBe("Installed skill")
  })
})

test("a skill folder counts only when it is an entry directly inside the skills folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-skills-"))
  const skills = path.join(root, "skills")
  await fs.mkdir(path.join(skills, "mine"), { recursive: true })
  await fs.mkdir(path.join(root, "elsewhere"))
  await fs.symlink(path.join(root, "elsewhere"), path.join(skills, "linked"))

  expect(await insideFolder(skills, path.join(skills, "mine"))).toBe(true)
  expect(await insideFolder(skills, path.join(skills, "linked"))).toBe(true)
  expect(await insideFolder(skills, path.join(skills, "mine", "..", "..", "elsewhere"))).toBe(false)
  expect(await insideFolder(skills, path.join(skills, "missing"))).toBe(false)
  expect(await insideFolder(skills, skills)).toBe(false)
  await fs.rm(root, { recursive: true, force: true })
})
