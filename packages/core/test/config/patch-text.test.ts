import { describe, expect, test } from "bun:test"
import { parse } from "jsonc-parser"
import { patchText } from "../../src/config"

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
})
