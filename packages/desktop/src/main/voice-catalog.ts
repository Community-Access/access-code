import type { VoicePack } from "./voice-packs"

const whisper = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/d026532c022fa99fd789d6b32446a1df7b6bfc43"

// The three hashes also match the MIT-licensed conversion archive at
// https://huggingface.co/runanywhere/sherpa-onnx-whisper-tiny.en/tree/76baba31555a91c0e00b63e4b91f7a01219cd8b4.
// OpenAI's model card declares Apache-2.0:
// https://huggingface.co/openai/whisper-tiny.en/blob/87c7102498dcde7456f24cfd30239ca606ed9063/README.md
export const voiceCatalog: readonly VoicePack[] = [
  {
    id: "whisper-tiny-en",
    name: "Whisper Tiny English",
    kind: "recognition",
    description: "On-device English speech recognition. Smaller and faster than larger Whisper models.",
    license: "MIT conversion; Apache-2.0 upstream model",
    source: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/tree/d026532c022fa99fd789d6b32446a1df7b6bfc43",
    files: [
      {
        path: "encoder.int8.onnx",
        url: `${whisper}/tiny.en-encoder.int8.onnx`,
        size: 12937772,
        sha256: "0ce578b827c94a961aacb8fa14b02f096504b337e5c94be37c36238cbe3e8bc6",
      },
      {
        path: "decoder.int8.onnx",
        url: `${whisper}/tiny.en-decoder.int8.onnx`,
        size: 89853865,
        sha256: "06c0e6ff6348d427e51839219d1c886c18cfdf411e629e33f5e1679bff9c1527",
      },
      {
        path: "tokens.txt",
        url: `${whisper}/tiny.en-tokens.txt`,
        size: 835554,
        sha256: "306cd27f03c1a714eca7108e03d66b7dc042abe8c258b44c199a7ed9838dd930",
      },
    ],
  },
]
