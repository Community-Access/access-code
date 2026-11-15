import { Config } from "@opencode/core/config"
import { ShellSelect } from "@opencode/core/shell/select"
import { McpRegistry } from "@opencode/schema/mcp-registry"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>
  handlers
    .handle("config.get", () => Config.Service.use((config) => config.entries()))
    .handle(
      "config.update",
      Effect.fn(function* (ctx) {
        const config = yield* Config.Service
        if (!config.update) return yield* Effect.die(new Error("Config updates are unavailable"))
        return yield* config.update(ctx.payload).pipe(Effect.orDie)
      }),
    )
    .handle(
      "config.mcpRegistry",
      Effect.fn(function* (ctx) {
        const url = new URL("https://registry.modelcontextprotocol.io/v0/servers")
        url.searchParams.set("version", "latest")
        url.searchParams.set("limit", "30")
        if (ctx.query.search) url.searchParams.set("search", ctx.query.search)
        if (ctx.query.cursor) url.searchParams.set("cursor", ctx.query.cursor)
        // The registry does not allow browser requests, so the server fetches it for the Extensions page.
        const body = yield* Effect.tryPromise(() =>
          fetch(url, { signal: AbortSignal.timeout(15_000) }).then((res) => res.json()),
        ).pipe(Effect.orDie)
        const decoded = yield* Schema.decodeUnknownEffect(McpRegistry.Response)(body).pipe(Effect.orDie)
        return new McpRegistry.SearchResult({
          servers: decoded.servers.map((item) => item.server),
          nextCursor: decoded.metadata?.nextCursor,
        })
      }),
    )
    .handle(
      "config.shells",
      Effect.fn(function* () {
        const shell = yield* ShellSelect.Service
        if (!shell.list) return yield* Effect.die(new Error("Shell discovery is unavailable"))
        return yield* shell.list()
      }),
    ),
)
