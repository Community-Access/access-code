import { Effect } from "effect"
import { VoiceRpcs } from "../../shared/ipc-rpc"
import {
  cancel,
  cancelDownload,
  cancelPack,
  download,
  installPack,
  packs,
  remove,
  removePack,
  speak,
  status,
  transcribe,
  voices,
} from "../voice"

export const voiceHandlers = VoiceRpcs.toLayer(
  Effect.succeed(
    VoiceRpcs.of({
      VoiceStatus: () => Effect.sync(status),
      VoiceVoices: () => Effect.promise(voices),
      VoicePacks: () => Effect.promise(packs),
      VoiceInstallPack: ({ id }) => Effect.promise(() => installPack(id)),
      VoiceCancelPack: ({ id }) => Effect.promise(() => cancelPack(id)),
      VoiceRemovePack: ({ id }) => Effect.promise(() => removePack(id)),
      VoiceDownload: () => Effect.sync(download),
      VoiceCancelDownload: () => Effect.sync(cancelDownload),
      VoiceRemove: () => Effect.promise(remove),
      VoiceTranscribe: ({ audio, recognizer }) => Effect.promise(() => transcribe(audio, recognizer)),
      VoiceSpeak: ({ id, text, voice }) => Effect.promise(() => speak(id, text, voice)),
      VoiceCancel: ({ id }) => Effect.sync(() => cancel(id)),
    }),
  ),
)
