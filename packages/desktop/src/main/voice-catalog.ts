import type { VoicePack } from "./voice-packs"

const whisper = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/d026532c022fa99fd789d6b32446a1df7b6bfc43"
const moonshine = "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/bf2b762c076d8ea61e2af0b3851c9564fb77552e"

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
  {
    id: "moonshine-tiny-en",
    name: "Moonshine Tiny English",
    kind: "recognition",
    description: "On-device English speech recognition with automatic punctuation.",
    license: "MIT",
    source: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/tree/bf2b762c076d8ea61e2af0b3851c9564fb77552e",
    files: [
      {
        path: "preprocess.onnx",
        url: `${moonshine}/preprocess.onnx`,
        size: 6800738,
        sha256: "f33addce61a143460fe753b5ee5b7db255e5140b5b779c065b94f6c83ff0bf4e",
      },
      {
        path: "encode.int8.onnx",
        url: `${moonshine}/encode.int8.onnx`,
        size: 18249187,
        sha256: "8774dfba578de027ec6595c2c654a0836434489bc963a0db124a7f181f571acb",
      },
      {
        path: "uncached_decode.int8.onnx",
        url: `${moonshine}/uncached_decode.int8.onnx`,
        size: 53216096,
        sha256: "216737000dd5881a17aa043f6bbd286add33e4c3b0ae257153e2ec15438bdc41",
      },
      {
        path: "cached_decode.int8.onnx",
        url: `${moonshine}/cached_decode.int8.onnx`,
        size: 45264830,
        sha256: "2aff28bba6a03d8dcf5c9feac45462629bae37317442299f28115ad09da773f6",
      },
      {
        path: "tokens.txt",
        url: `${moonshine}/tokens.txt`,
        size: 436688,
        sha256: "1165c2aeb9f72f457a83be2d459a09054f27490acd9b41bd43794dfd25e296ea",
      },
      {
        path: "LICENSE",
        url: `${moonshine}/LICENSE`,
        size: 1071,
        sha256: "29f60769d1779eb7e196d96b8d2dd471d0263cf8200c79e55c0c00183971ee1b",
      },
    ],
  },
]
