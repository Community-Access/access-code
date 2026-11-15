import { Config } from "@opencode/schema/config"
import { ConfigShell } from "@opencode/schema/config/shell"
import { ExtensionCatalog } from "@opencode/schema/extension-catalog"
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
  .add(
    HttpApiEndpoint.get("config.mcpPopular", "/api/experimental/config/mcp-popular", {
      success: McpRegistry.SearchResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.mcpPopular",
        summary: "List popular MCP servers",
        description:
          "Experimental: may change without compatibility guarantees. Popular servers from the public MCP Registry, followed by the MCP project's reference servers.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.mcpDocker", "/api/experimental/config/mcp-docker", {
      query: Schema.Struct({ search: Schema.String.pipe(Schema.optionalKey) }),
      success: McpRegistry.SearchResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.mcpDocker",
        summary: "Search the Docker MCP Catalog",
        description:
          "Experimental: may change without compatibility guarantees. Servers from the Docker MCP Catalog, most pulled first, filtered by the search text.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.skillSearch", "/api/experimental/config/skills", {
      query: Schema.Struct({ search: Schema.String.pipe(Schema.optionalKey) }),
      success: ExtensionCatalog.SkillSearchResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.skillSearch",
        summary: "Search skills.sh",
        description:
          "Experimental: may change without compatibility guarantees. Search the skills.sh directory; without a search, list popular skills.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("config.skillInstall", "/api/experimental/config/skills", {
      payload: ExtensionCatalog.SkillInstallInput,
      success: ExtensionCatalog.CommandResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.skillInstall",
        summary: "Install a skill",
        description:
          "Experimental: may change without compatibility guarantees. Install one skill from a GitHub repository into the global OpenCode skills folder with the skills CLI.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("config.skillRemove", "/api/experimental/config/skills/remove", {
      payload: ExtensionCatalog.SkillRemoveInput,
      success: ExtensionCatalog.CommandResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.skillRemove",
        summary: "Remove a skill",
        description:
          "Experimental: may change without compatibility guarantees. Remove one skill from the global OpenCode skills folder with the skills CLI.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.extensionPaths", "/api/experimental/config/extension-paths", {
      success: ExtensionCatalog.Paths,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.extensionPaths",
        summary: "Get extension folders",
        description:
          "Experimental: may change without compatibility guarantees. The global config folder that config updates edit, and the global OpenCode skills folder.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.mcpSignIn", "/api/experimental/config/mcp-sign-in", {
      query: Schema.Struct({ url: Schema.String }),
      success: ExtensionCatalog.SignIn,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.mcpSignIn",
        summary: "Check remote MCP sign-in",
        description:
          "Experimental: may change without compatibility guarantees. Whether a remote MCP server at an https URL supports browser sign-in that OpenCode can complete.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("config.tools", "/api/experimental/config/tools", {
      success: ExtensionCatalog.Tools,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.config.tools",
        summary: "List extension tools",
        description:
          "Experimental: may change without compatibility guarantees. Whether Node.js (npx), uv (uvx) and Docker are installed, which local MCP servers and skills need.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "config", description: "Location-scoped configuration routes." }))
