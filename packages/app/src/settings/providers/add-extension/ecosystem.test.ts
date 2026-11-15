import { expect, test } from "bun:test"
import { githubRepo, parseEcosystem, sameRepo, validPluginSpec } from "./ecosystem"

const markdown = `---
title: Ecosystem
---

## Plugins

| Name                                                      | Description                        |
| --------------------------------------------------------- | ---------------------------------- |
| [opencode-daytona](https://github.com/daytona/integrations/tree/main/packages/opencode-plugin) | Run sessions in sandboxes |
| [opencode-pty](https://github.com/shekohex/opencode-pty.git) | Run a PTY \\| with pipes |
| not a link | skipped |

## Projects

| [some-project](https://github.com/a/b) | Not a plugin |
`

test("parseEcosystem reads only the Plugins table rows with a link", () => {
  expect(parseEcosystem(markdown)).toEqual([
    {
      name: "opencode-daytona",
      url: "https://github.com/daytona/integrations/tree/main/packages/opencode-plugin",
      description: "Run sessions in sandboxes",
    },
    {
      name: "opencode-pty",
      url: "https://github.com/shekohex/opencode-pty.git",
      description: "Run a PTY | with pipes",
    },
  ])
  expect(parseEcosystem("# Nothing here")).toEqual([])
})

test("githubRepo normalizes links and npm repository forms", () => {
  expect(githubRepo("https://github.com/daytona/integrations/tree/main/packages/opencode-plugin")).toBe(
    "daytona/integrations",
  )
  expect(githubRepo("git+https://github.com/Shekohex/opencode-pty.git")).toBe("shekohex/opencode-pty")
  expect(githubRepo("git@github.com:owner/repo.git")).toBe("owner/repo")
  expect(githubRepo("github:owner/repo")).toBe("owner/repo")
  expect(githubRepo("https://gitlab.com/owner/repo")).toBeUndefined()
})

test("sameRepo accepts the package only when its repository is the linked repo", () => {
  const link = "https://github.com/shekohex/opencode-pty.git"

  expect(sameRepo(link, { type: "git", url: "git+https://github.com/shekohex/opencode-pty.git" })).toBe(true)
  expect(sameRepo(link, "shekohex/opencode-pty")).toBe(true)
  expect(sameRepo(link, { url: "git+https://github.com/someone-else/opencode-pty.git" })).toBe(false)
  expect(sameRepo(link, undefined)).toBe(false)
})

test("validPluginSpec allows a scope and a version", () => {
  expect(validPluginSpec("opencode-pty")).toBe(true)
  expect(validPluginSpec("@scope/name@1.2.0")).toBe(true)
  expect(validPluginSpec("Bad Name")).toBe(false)
  expect(validPluginSpec("name@")).toBe(false)
})
