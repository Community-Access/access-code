import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Transferable } from "effect/workers"

export const VoiceStatus = Rpc.make("VoiceStatus", {
  success: Schema.Struct({
    supported: Schema.Boolean,
    installed: Schema.Boolean,
    download: Schema.NullOr(Schema.Struct({ received: Schema.Number, total: Schema.Number })),
    error: Schema.NullOr(Schema.String),
  }),
})

export const VoiceDownload = Rpc.make("VoiceDownload")

export const VoiceCancelDownload = Rpc.make("VoiceCancelDownload")

export const VoiceRemove = Rpc.make("VoiceRemove")

export const VoiceTranscribe = Rpc.make("VoiceTranscribe", {
  payload: { audio: Transferable.Uint8Array },
  success: Schema.String,
})

export const VoiceSpeak = Rpc.make("VoiceSpeak", {
  payload: { id: Schema.String, text: Schema.String, voice: Schema.String },
  success: Schema.NullOr(Transferable.Uint8Array),
})

export const VoiceCancel = Rpc.make("VoiceCancel", { payload: { id: Schema.String } })

export const VoiceRpcs = RpcGroup.make(
  VoiceStatus,
  VoiceDownload,
  VoiceCancelDownload,
  VoiceRemove,
  VoiceTranscribe,
  VoiceSpeak,
  VoiceCancel,
)
