export * as McpRegistry from "./mcp-registry.js"

import { Schema } from "effect"
import { optional } from "./schema.js"

// AccessCode: the parts of the public MCP Registry (registry.modelcontextprotocol.io) that the Extensions page needs
// to show a server and add it to opencode.json. Fields the page does not use are dropped when decoding.

export class Input extends Schema.Class<Input>("McpRegistry.Input")({
  name: Schema.String,
  description: Schema.String.pipe(optional),
  isRequired: Schema.Boolean.pipe(optional),
  isSecret: Schema.Boolean.pipe(optional),
  default: Schema.String.pipe(optional),
  value: Schema.String.pipe(optional),
}) {}

// A command-line argument the package's server needs, such as the `mcp serve` subcommand of a CLI that also does other
// things. `positional` arguments are values; `named` ones are flags such as `--port`, followed by their value if any.
export class Argument extends Schema.Class<Argument>("McpRegistry.Argument")({
  type: Schema.String,
  name: Schema.String.pipe(optional),
  value: Schema.String.pipe(optional),
  default: Schema.String.pipe(optional),
  valueHint: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  isRequired: Schema.Boolean.pipe(optional),
  isSecret: Schema.Boolean.pipe(optional),
}) {}

export class Package extends Schema.Class<Package>("McpRegistry.Package")({
  registryType: Schema.String,
  identifier: Schema.String,
  version: Schema.String.pipe(optional),
  runtimeHint: Schema.String.pipe(optional),
  transport: Schema.Struct({ type: Schema.String }).pipe(optional),
  environmentVariables: Input.pipe(Schema.Array, optional),
  packageArguments: Argument.pipe(Schema.Array, optional),
}) {}

export class Remote extends Schema.Class<Remote>("McpRegistry.Remote")({
  type: Schema.String,
  url: Schema.String,
  headers: Input.pipe(Schema.Array, optional),
}) {}

export class Server extends Schema.Class<Server>("McpRegistry.Server")({
  name: Schema.String,
  title: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  version: Schema.String.pipe(optional),
  websiteUrl: Schema.String.pipe(optional),
  repository: Schema.Struct({ url: Schema.String.pipe(optional) }).pipe(optional),
  packages: Package.pipe(Schema.Array, optional),
  remotes: Remote.pipe(Schema.Array, optional),
}) {}

export class SearchResult extends Schema.Class<SearchResult>("McpRegistry.SearchResult")({
  servers: Server.pipe(Schema.Array),
  nextCursor: Schema.String.pipe(optional),
  /** AccessCode: each listed server's category, by server name, for the Popular list and the Docker MCP Catalog. */
  categories: Schema.Record(Schema.String, Schema.String).pipe(optional),
}) {}

/** The registry's own response shape, decoded at the boundary where the server fetches it. */
export const Response = Schema.Struct({
  servers: Schema.Struct({ server: Server }).pipe(Schema.Array),
  metadata: Schema.Struct({ nextCursor: Schema.String.pipe(optional) }).pipe(optional),
})
