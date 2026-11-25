import type { VoicePack } from "./voice-packs"

const whisper = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/d026532c022fa99fd789d6b32446a1df7b6bfc43"
const moonshine = "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/bf2b762c076d8ea61e2af0b3851c9564fb77552e"
const kokoro = "https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/resolve/57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2"
const misaki = "https://huggingface.co/nekwo/misaki-en-us-g2p-onnx/resolve/4b3a605d2f605318ab4f762ab9855c44106528b7"
const piper = "https://huggingface.co/csukuangfj/vits-piper-en_US-libritts-high/resolve/b436d2684d7de5ded1112f173a742f5d47a40e89"
const openphonemizer = "https://huggingface.co/nekwo/openphonemizer-en-us-onnx/resolve/1e8cb072f1c2aa17286f235a7740b596ac7bea31"

// The three hashes also match the MIT-licensed conversion archive at
// https://huggingface.co/runanywhere/sherpa-onnx-whisper-tiny.en/tree/76baba31555a91c0e00b63e4b91f7a01219cd8b4.
// OpenAI's model card declares Apache-2.0:
// https://huggingface.co/openai/whisper-tiny.en/blob/87c7102498dcde7456f24cfd30239ca606ed9063/README.md
export const voiceCatalog: readonly VoicePack[] = [
  {
    id: "piper-libritts-en",
    name: "Piper LibriTTS English",
    kind: "speech",
    description: "On-device US English speech with 904 numbered speakers.",
    license: "CC BY 4.0 dataset; BSD-3-Clause-Clear phonemizer",
    source: "https://huggingface.co/rhasspy/piper-voices/blob/375a0fe641dea077c2a47b4e9a056d6da521eed3/en/en_US/libritts/high/MODEL_CARD",
    files: [
      {
        path: "model.onnx",
        url: `${piper}/en_US-libritts-high.onnx`,
        size: 136673944,
        sha256: "c6c0eeb0bf6aa67875dd1d2b37d014357dee2aba96f5481686da522dc6b0b93a",
      },
      {
        path: "tokens.txt",
        url: `${piper}/tokens.txt`,
        size: 763,
        sha256: "42d1a69ed2b91a51928a711aa228ed9f3dc021c6d359a3e9c4f37eb1d20f80bd",
      },
      {
        path: "openphonemizer.onnx",
        url: `${openphonemizer}/openphonemizer-en_us-fp16.onnx`,
        size: 30977712,
        sha256: "a77b17647a02cb9ac42025cfc60c8e83c70f36785183a4388f17722fb1c7dc9b",
      },
      {
        path: "openphonemizer.json",
        url: `${openphonemizer}/openphonemizer-en_us.json`,
        size: 9223033,
        sha256: "36dda6260c7e560a4d846528387fd07ababcd1012a52b530063fefadd5987db0",
      },
    ],
  },
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
  {
    id: "kokoro-int8-en-v1",
    name: "Kokoro English",
    kind: "speech",
    description: "On-device US English speech with multiple voices.",
    license: "Apache-2.0",
    source: "https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/tree/57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2",
    files: [
      {
        path: "model.int8.onnx",
        url: `${kokoro}/model.int8.onnx`,
        size: 114202993,
        sha256: "75635ea3b85a32d00094dcdd61a258aba87c160f7c264c304a7b3ae9d734195e",
      },
      {
        path: "voices.bin",
        url: `${kokoro}/voices.bin`,
        size: 28200960,
        sha256: "1c5a5b983d3d50d8586d437a51f3faa2da7919ce76a013c081e65671a3447c29",
      },
      {
        path: "tokens.txt",
        url: `${kokoro}/tokens.txt`,
        size: 687,
        sha256: "6ebb6bb288f20f3ae8d004d3c2ca27697da27c037d75e81a60e2a6a663f95425",
      },
      {
        path: "LICENSE",
        url: `${kokoro}/LICENSE`,
        size: 11358,
        sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
      },
      {
        path: "misaki-en_us-g2p.onnx",
        url: `${misaki}/misaki-en_us-g2p.onnx`,
        size: 3438244,
        sha256: "757759c3e3ccb0bf59c379b1671c9834a27543ceaefd6846850823633b9665a1",
      },
      {
        path: "misaki-en_us-g2p.json",
        url: `${misaki}/misaki-en_us-g2p.json`,
        size: 5724857,
        sha256: "8a8e3350713b0a00102425a5d5bd6b58b34854c74a3e8d837589f55212c51658",
      },
    ],
  },
]
