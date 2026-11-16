import { describe, expect, test } from "bun:test"
import { parse } from "jsonc-parser"
import { keychainRefs, patchText, serverKeychainRefs } from "../../src/config"

describe("patchText", () => {
  test("adds and removes MCP servers by name and keeps comments", () => {
    const text =
      '{\n  // my servers\n  "mcp": { "servers": { "old": { "type": "remote", "url": "https://old.example" } } }\n}\n'
    const added = patchText(text, {
      mcp: { github: { type: "remote", url: "https://api.githubcopilot.com/mcp/" }, old: null },
    })

    expect(added).toContain("// my servers")
    expect(parse(added).mcp.servers).toEqual({ github: { type: "remote", url: "https://api.githubcopilot.com/mcp/" } })
  })

  test("adds plugins once and keeps the others with their options", () => {
    const text = '{ "plugins": ["first", { "package": "second", "options": { "a": 1 } }] }'
    const updated = patchText(text, { plugins: { add: ["third", "first"] } })

    expect(parse(updated).plugins).toEqual(["first", { package: "second", options: { a: 1 } }, "third"])
  })

  test("removes plugins from both the plugins and the older plugin keys", () => {
    const text = '{ "plugin": ["legacy", ["tuple", { "b": 2 }]], "plugins": ["keep", "drop"] }'
    const updated = patchText(text, { plugins: { remove: ["legacy", "tuple", "drop"] } })

    expect(parse(updated).plugin).toEqual([])
    expect(parse(updated).plugins).toEqual(["keep"])
  })

  test("leaves the file alone when nothing changes", () => {
    const text = '{ "plugins": ["first"] }\n'

    expect(patchText(text, { plugins: { add: ["first"] } })).toBe(text)
  })

  test("still sets and clears the shell", () => {
    expect(parse(patchText("{}", { shell: "/bin/zsh" })).shell).toBe("/bin/zsh")
    expect(parse(patchText('{ "shell": "/bin/zsh" }', { shell: null })).shell).toBeUndefined()
  })

  test("removes a server listed the older way, directly under mcp", () => {
    const text = '{ "mcp": { "old": { "type": "remote", "url": "https://old.example" }, "servers": {} } }'
    const result = parse(patchText(text, { mcp: { old: null } }))
    expect(result.mcp.old).toBeUndefined()
    expect(result.mcp.servers).toEqual({})
  })

  test("adds and removes plugins one at a time, keeping comments inside the list", () => {
    const text = '{\n  "plugins": [\n    // keep me\n    "a",\n    "b", // about b\n    ["c", { "x": 1 }]\n  ]\n}\n'
    const added = patchText(text, { plugins: { add: ["d"] } })
    expect(added).toContain("// keep me")
    expect(added).toContain("// about b")
    expect(parse(added).plugins).toEqual(["a", "b", ["c", { x: 1 }], "d"])
    const removed = patchText(added, { plugins: { remove: ["c", "a"] } })
    expect(removed).toContain("// about b")
    expect(parse(removed).plugins).toEqual(["b", "d"])
  })

  test("removes plugins from the older plugin list too", () => {
    const text = '{ "plugin": ["a", "b"], "plugins": ["c"] }'
    const result = parse(patchText(text, { plugins: { remove: ["a", "c"] } }))
    expect(result.plugin).toEqual(["b"])
    expect(result.plugins).toEqual([])
  })

  test("finds the Keychain items a removed server refers to, in either place", () => {
    const text =
      '{ "mcp": { "servers": { "brave": { "environment": { "KEY": "{keychain:mcp-brave-KEY}" } } }, "old": { "headers": { "A": "Bearer {keychain:old-token}" } } } }'
    expect(serverKeychainRefs(text, ["brave"])).toEqual(["mcp-brave-KEY"])
    expect(serverKeychainRefs(text, ["old"])).toEqual(["old-token"])
    expect(keychainRefs(text)).toEqual(["mcp-brave-KEY", "old-token"])
  })
})
