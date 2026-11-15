import { Config } from "@opencode/schema/config"
import { ConfigShell } from "@opencode/schema/config/shell"
import { McpRegistry } from "@opencode/schema/mcp-registry"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const ConfigGroup = HttpApiGroup.make("server.config")
  .add(
    HttpApiEndpoint.get("config.get", "/api/config", {
      query: LocationQuery,
      success: Schema.Array(Config.Entry),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "config.get",
          summary: "Get configuration",
          description:
            "Return configuration documents and discovery sources for the requested location, from lowest to highest priority.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("config.shells", "/api/config/shell", {
      success: Schema.Array(ConfigShell.Option),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "config.shells",
        summary: "List available shells",
        description: "Return shells available to terminal and agent execution.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.patch("config.update", "/api/experimental/config", {
      payload: Config.Patch,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.update",
        summary: "Update global configuration",
        description: "Patch supported fields in the highest-precedence global configuration document.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.mcpRegistry", "/api/experimental/config/mcp-registry", {
      query: Schema.Struct({
        search: Schema.String.pipe(Schema.optionalKey),
        cursor: Schema.String.pipe(Schema.optionalKey),
      }),
      success: McpRegistry.SearchResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.mcpRegistry",
        summary: "Search the MCP Registry",
        description:
          "Experimental: may change without compatibility guarantees. Search the public MCP Registry for servers to add.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "config", description: "Location-scoped configuration routes." }))
