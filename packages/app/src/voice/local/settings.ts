import { Schema } from "effect"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"

// The four Liquid Audio voices, named the way the model's TTS prompt expects ("Use the US female voice.").
export const voices = [
  { id: "US female", label: "voice.local.voice.usFemale" },
  { id: "US male", label: "voice.local.voice.usMale" },
  { id: "UK female", label: "voice.local.voice.ukFemale" },
  { id: "UK male", label: "voice.local.voice.ukMale" },
] as const

export type VoiceName = (typeof voices)[number]["id"]

const LocalVoiceSettings = Persistence.struct({
  voice: Schema.Literals(voices.map((voice) => voice.id)),
  speed: Schema.Number,
})

export function useLocalVoiceSettings() {
  const [settings, setSettings] = persisted(Persist.global("voice.local"), LocalVoiceSettings, {
    voice: "US female",
    speed: 1,
  })

  return { settings, setSettings }
}
