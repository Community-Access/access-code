export * as ConfigKeychain from "./keychain.js"

import { Effect } from "effect"

// AccessCode keeps MCP keys in the macOS Keychain, and opencode.json refers to them as {keychain:NAME}, so a key
// never sits in a text file. Both writing and reading go through Apple's own `security` tool, so the items it creates
// are readable by it again without a permission prompt.
const SERVICE = "AccessCode"
const SECURITY = "/usr/bin/security"

/** Names a config may refer to: letters, digits, dots, dashes and underscores. */
export const NAME = /^[A-Za-z0-9._-]{1,128}$/

export const supported = () => process.platform === "darwin"

/** The stored value, or an empty string when the item is missing, like a missing {env:VAR}. */
export const read = Effect.fn("ConfigKeychain.read")(function* (name: string) {
  if (!supported() || !NAME.test(name)) return ""
  const result = yield* Effect.promise(() => run([SECURITY, "find-generic-password", "-s", SERVICE, "-a", name, "-w"]))

  if (result.code !== 0) {
    yield* Effect.logWarning("keychain reference is missing", { reference: name })
    return ""
  }

  return result.out.replace(/\n$/, "")
})

/** Stores a value, or deletes it when the value is null. The value goes in on standard input, not the command line. */
export const write = Effect.fn("ConfigKeychain.write")(function* (name: string, value: string | null) {
  if (!supported()) return yield* Effect.fail(new Error("The Keychain is only available on macOS"))

  if (!NAME.test(name)) return yield* Effect.fail(new Error(`Invalid keychain name: ${name}`))

  if (value === null) {
    yield* Effect.promise(() => run([SECURITY, "delete-generic-password", "-s", SERVICE, "-a", name]))
    return
  }

  // `security -i` reads commands from standard input, so the secret never shows in the process list.
  const command = `add-generic-password -U -s ${quote(SERVICE)} -a ${quote(name)} -w ${quote(value)}\n`
  const result = yield* Effect.promise(() => run([SECURITY, "-i"], command))

  if (result.code !== 0) return yield* Effect.fail(new Error("Could not save the key in the Keychain"))
})

async function run(command: string[], input?: string) {
  const child = Bun.spawn(command, { stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" })

  if (input !== undefined && child.stdin) {
    child.stdin.write(input)
    child.stdin.end()
  }
  const out = await new Response(child.stdout).text()

  return { code: await child.exited, out }
}

// The `security -i` command line splits words like a shell: double quotes group, and a backslash escapes.
function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
