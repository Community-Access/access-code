import { Effect } from "effect"
import { VoiceRpcs } from "../../shared/ipc-rpc"
import { cancel, cancelDownload, download, remove, speak, status, transcribe, voices } from "../voice"

export const voiceHandlers = VoiceRpcs.toLayer(
  Effect.succeed(
    VoiceRpcs.of({
      VoiceStatus: () => Effect.sync(status),
      VoiceVoices: () => Effect.promise(voices),
      VoiceDownload: () => Effect.sync(download),
      VoiceCancelDownload: () => Effect.sync(cancelDownload),
      VoiceRemove: () => Effect.promise(remove),
      VoiceTranscribe: ({ audio }) => Effect.promise(() => transcribe(audio)),
      VoiceSpeak: ({ id, text, voice }) => Effect.promise(() => speak(id, text, voice)),
      VoiceCancel: ({ id }) => Effect.sync(() => cancel(id)),
    }),
  ),
)
