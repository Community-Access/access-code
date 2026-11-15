import { describe, expect, test } from "bun:test"
import { filterPlugins, mergePlugins, npmPlugins, parseAwesome } from "./plugin-catalog"

const README = `
<details open>
<summary><strong>🧩 PLUGINS</strong></summary>
<br>

<details>
  <summary><b>@scope/memory</b> <img src="https://badgen.net/github/stars/scope/memory" height="14"/> - <i>Short memory</i></summary>
  <blockquote>
    Durable memory &amp; notes, kept across sessions.
    <br><br>
    <a href="https://github.com/scope/memory">🔗 <b>View Repository</b></a>
  </blockquote>
</details>

<details>
  <summary><b>Agent Notes</b> - <i>Only a short description</i></summary>
  <blockquote>
    Published to npm as notes-opencode (https://www.npmjs.com/package/notes-opencode). Also see <a href="https://example.com/guide">the guide</a>.
    <br><br>
    <a href="https://gitee.com/owner/notes">🔗 <b>View Repository</b></a>
  </blockquote>
</details>
</details>

<details>
<summary><strong>🎨 THEMES</strong></summary>
<details>
  <summary><b>Not a plugin</b></summary>
  <blockquote>Theme <a href="https://github.com/a/theme">🔗 <b>View Repository</b></a></blockquote>
</details>
`

describe("parseAwesome", () => {
  test("reads each plugin block of the plugins section only", () => {
    expect(parseAwesome(README)).toEqual([
      {
        name: "@scope/memory",
        url: "https://github.com/scope/memory",
        description: "Durable memory & notes, kept across sessions.",
        npm: undefined,
      },
      {
        name: "Agent Notes",
        url: "https://gitee.com/owner/notes",
        description:
          "Published to npm as notes-opencode (https://www.npmjs.com/package/notes-opencode). Also see the guide.",
        npm: "notes-opencode",
      },
    ])
  })

  test("returns nothing without a plugins section", () => {
    expect(parseAwesome("# Awesome\n\n- [x](https://github.com/a/b)")).toEqual([])
  })
})

const search = (objects: unknown[]) => ({ objects, total: objects.length })

describe("npmPlugins", () => {
  test("maps packages, most downloaded first, and drops invalid names", () => {
    const plugins = npmPlugins(
      search([
        {
          package: { name: "quiet", links: { npm: "https://www.npmjs.com/package/quiet" } },
          downloads: { weekly: 3, monthly: 9 },
        },
        {
          package: {
            name: "@a/loud",
            description: "Loud",
            links: { npm: "https://www.npmjs.com/package/@a/loud", repository: "https://github.com/a/loud" },
          },
          downloads: { weekly: 900 },
        },
        { package: { name: "Bad Name" }, downloads: { weekly: 10_000 } },
      ]),
    )

    expect(plugins).toEqual([
      {
        name: "@a/loud",
        pkg: "@a/loud",
        description: "Loud",
        url: "https://github.com/a/loud",
        downloads: 900,
        source: "npm",
      },
      {
        name: "quiet",
        pkg: "quiet",
        description: "",
        url: "https://www.npmjs.com/package/quiet",
        downloads: 3,
        source: "npm",
      },
    ])
  })

  test("rejects a response without objects", () => {
    expect(() => npmPlugins({ results: [] })).toThrow()
  })
})

describe("mergePlugins", () => {
  test("joins a docs entry to the npm package of the same repository and keeps both sources", () => {
    const merged = mergePlugins([
      [{ name: "Memory", url: "https://github.com/scope/memory", description: "From docs", source: "docs" }],
      [
        {
          name: "@scope/memory",
          pkg: "@scope/memory",
          url: "git+https://github.com/scope/memory.git",
          description: "From npm",
          downloads: 5,
          source: "npm",
        },
      ],
    ])

    expect(merged).toEqual([
      {
        name: "Memory",
        description: "From docs",
        url: "https://github.com/scope/memory",
        pkg: "@scope/memory",
        sources: ["docs", "npm"],
        downloads: 5,
      },
    ])
  })

  test("keeps two packages from one repository apart and sorts by downloads, then list order", () => {
    const merged = mergePlugins([
      [{ name: "Unknown", url: "https://github.com/x/unknown", description: "", source: "awesome" }],
      [
        { name: "a-one", pkg: "a-one", url: "https://github.com/a/mono", description: "", downloads: 1, source: "npm" },
        { name: "a-two", pkg: "a-two", url: "https://github.com/a/mono", description: "", downloads: 7, source: "npm" },
      ],
    ])

    expect(merged.map((plugin) => plugin.name)).toEqual(["a-two", "a-one", "Unknown"])
  })

  test("de-duplicates the same package listed twice", () => {
    const item = { name: "p", pkg: "p", url: "https://github.com/o/p", description: "", source: "npm" as const }

    expect(mergePlugins([[item], [{ ...item, source: "awesome" }]])).toHaveLength(1)
  })
})

test("filterPlugins matches every word in the name, package or description", () => {
  const plugins = mergePlugins([
    [
      {
        name: "Notes",
        pkg: "notes-opencode",
        url: "https://github.com/o/n",
        description: "Keeps notes",
        source: "npm",
      },
      { name: "Pty", pkg: "opencode-pty", url: "https://github.com/o/p", description: "Terminals", source: "npm" },
    ],
  ])

  expect(filterPlugins(plugins, "opencode keeps").map((plugin) => plugin.name)).toEqual(["Notes"])
  expect(filterPlugins(plugins, "")).toHaveLength(2)
})
