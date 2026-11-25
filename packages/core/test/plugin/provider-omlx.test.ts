import { Config } from "@opencode/core/config"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { make, OMLXPlugin } from "@opencode/core/plugin/provider/omlx"
import { Provider } from "@opencode/core/provider"
import { Document, Info } from "@opencode/schema/config"
import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { eventually } from "../lib/eventually"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(Layer.merge(PluginTestLayer, Config.testLayer()))

it.live("discovers oMLX chat models using the configured bearer key", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const requests: Array<{ path: string; authorization: string | null }> = []
      const server = Bun.serve({
        port: 0,
        fetch: (request) => {
          requests.push({ path: new URL(request.url).pathname, authorization: request.headers.get("authorization") })
          if (request.headers.get("authorization") !== "Bearer secret") return new Response(null, { status: 401 })
          return Response.json({
            data: [
              { id: "chat-model", model_type: "llm", max_model_len: 32_768 },
              { id: "vision-model", model_type: "vlm", max_model_len: 16_384 },
              { id: "embed-model", model_type: "embedding", max_model_len: 8192 },
            ],
          })
        },
      })
      return { requests, server }
    }),
    ({ requests, server }) =>
      Effect.gen(function* () {
        const config = yield* Config.Test
        const plugin = yield* Plugin.Service
        const models = yield* Model.Service
        const providerID = Provider.ID.make("omlx")
        yield* config.setEntries([
          new Document({
            type: "document",
            info: Schema.decodeUnknownSync(Info)({
              providers: { omlx: { settings: { baseURL: `${server.url.origin}/v1`, apiKey: "secret" } } },
            }),
          }),
        ])
        expect(OMLXPlugin.id).toBe("opencode.provider.omlx")
        expect(ProviderPlugins.map((item) => item.id)).toContain(OMLXPlugin.id)
        yield* make().effect(yield* PluginHost.make(plugin, "test"))
        expect(
          yield* eventually(models.get(providerID, Model.ID.make("chat-model")), (model) => model !== undefined),
        ).toMatchObject({ limit: { context: 32_768 } })
        expect(yield* models.get(providerID, Model.ID.make("vision-model"))).toMatchObject({
          capabilities: { input: ["text", "image"] },
        })
        expect(yield* models.get(providerID, Model.ID.make("embed-model"))).toBeUndefined()
        expect(requests).toContainEqual({ path: "/v1/models", authorization: "Bearer secret" })
      }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  ),
)
