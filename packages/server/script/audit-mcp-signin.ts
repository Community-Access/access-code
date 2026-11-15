#!/usr/bin/env bun
// AccessCode: checks how each popular MCP server signs in, the same way the Add extension dialog does at setup time,
// and prints one plain text line per server as it is checked. Run it from packages/server:
//   bun script/audit-mcp-signin.ts
// Kinds: browser (signs in with the browser, no key), open (needs nothing), app (needs a registered OAuth app, such as
// GitHub), key (needs a key or token), local (runs on the Mac), error (could not be reached).
import os from "node:os"
import { McpOAuth } from "@opencode/core/mcp/oauth"
import { loadDocker, loadPopular } from "../src/extension-catalog"

const popular = await loadPopular(os.homedir(), loadDocker)
const servers = popular.servers
const width = Math.max(...servers.map((server) => (server.title ?? server.name).length)) + 2

console.log(`${servers.length} servers`)
console.log(`${"Server".padEnd(width)}${"Category".padEnd(14)}${"Kind".padEnd(9)}Address or package`)
for (const server of servers) {
  const name = (server.title ?? server.name).padEnd(width) + (popular.categories?.[server.name] ?? "").padEnd(14)
  const remote = server.remotes?.find((item) => !item.url.includes("{"))

  if (!remote) {
    const item = server.packages?.[0]
    console.log(`${name}${"local".padEnd(9)}${item ? `${item.registryType} ${item.identifier}` : "none"}`)
    continue
  }
  const kind = await McpOAuth.probeSignIn(remote.url).catch(() => "error")
  console.log(`${name}${kind.padEnd(9)}${remote.url}`)
}
