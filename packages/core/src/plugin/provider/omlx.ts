import { Effect, Schema } from "effect"
import { createLocalProviderPlugin } from "./local.js"

const RemoteModel = Schema.Struct({
  id: Schema.String,
  model_type: Schema.optional(Schema.NullOr(Schema.String)),
  max_model_len: Schema.NullOr(Schema.Int).pipe(Schema.optional),
})

const Response = Schema.Struct({ data: Schema.Array(RemoteModel) })

export const make = createLocalProviderPlugin({
  id: "opencode.provider.omlx",
  providerID: "omlx",
  name: "oMLX",
  origin: "http://127.0.0.1:8000",
  discover: (client) =>
    Effect.gen(function* () {
      const response = yield* client.getJson("/v1/models", Response)
      return response.data
        .filter((model) => model.id.length > 0 && (model.model_type === "llm" || model.model_type === "vlm"))
        .toSorted((a, b) => a.id.localeCompare(b.id))
    }),
  model: (item) => ({ id: item.id, context: item.max_model_len, vision: item.model_type === "vlm" }),
})

export const OMLXPlugin = make()
