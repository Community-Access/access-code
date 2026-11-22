const fs = require("node:fs")
const path = require("node:path")

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Sherpa voice is supported only on Windows x64")
  if (!process.argv[2] || !path.isAbsolute(process.argv[2]))
    throw new Error("An absolute sherpa-onnx-node module path is required")
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!request || typeof request !== "object" || !["transcribe", "speak"].includes(request.type))
    throw new Error("Invalid sherpa voice request")
  if (typeof request.model !== "string" || !path.isAbsolute(request.model))
    throw new Error("An absolute model directory is required")
  const file = (name) => {
    const filename = path.join(request.model, name)
    const info = fs.statSync(filename, { throwIfNoEntry: false })
    if (!info?.isFile() || info.size === 0) throw new Error(`Missing model file: ${filename}`)
    return filename
  }

  if (request.type === "transcribe") {
    if (typeof request.input !== "string" || !path.isAbsolute(request.input))
      throw new Error("An absolute input WAV path is required")
    if (request.recognizer !== "whisper-tiny-en" && request.recognizer !== "moonshine-tiny-en")
      throw new Error(`Unsupported recognition pack: ${request.recognizer}`)
    const tokens = file("tokens.txt")
    const audio = readRecorderWave(request.input)
    const sherpa = require(process.argv[2])
    const recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        ...(request.recognizer === "whisper-tiny-en"
          ? {
              whisper: {
                encoder: file("encoder.int8.onnx"),
                decoder: file("decoder.int8.onnx"),
                language: "en",
                task: "transcribe",
              },
            }
          : {
              moonshine: {
                preprocessor: file("preprocess.onnx"),
                encoder: file("encode.int8.onnx"),
                uncachedDecoder: file("uncached_decode.int8.onnx"),
                cachedDecoder: file("cached_decode.int8.onnx"),
              },
            }),
        tokens,
        numThreads: 2,
        provider: "cpu",
        debug: false,
      },
      decodingMethod: "greedy_search",
    })
    const stream = recognizer.createStream()
    stream.acceptWaveform(audio)
    recognizer.decode(stream)
    process.stdout.write(JSON.stringify(recognizer.getResult(stream).text.trim()))
    return
  }

  if (typeof request.output !== "string" || !path.isAbsolute(request.output) || typeof request.text !== "string")
    throw new Error("An absolute output WAV path and synthesis text are required")
  if (!/[\p{L}\p{N}]/u.test(request.text)) throw new Error("Kokoro synthesis requires words")
  if (!Number.isSafeInteger(request.speaker) || request.speaker < 0) throw new Error("Invalid Kokoro speaker index")
  const model = file("model.int8.onnx")
  const voices = file("voices.bin")
  const tokens = file("tokens.txt")
  // Since sherpa-onnx 2.0, archived espeak-ng-data is ignored. Do not call native
  // generation without a lexicon: it can crash instead of returning an error.
  const lexicon = path.join(request.model, "lexicon.txt")
  if (!fs.statSync(lexicon, { throwIfNoEntry: false })?.size)
    throw new Error(
      "Kokoro requires lexicon.txt with sherpa-onnx 2.0.1; archived espeak-ng-data is no longer supported",
    )
  const words = new Set(
    fs
      .readFileSync(lexicon, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0]),
  )
  const missing = request.text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
    ?.find((word) => !words.has(word))
  if (missing) throw new Error(`Kokoro lexicon has no pronunciation for: ${missing}`)
  const sherpa = require(process.argv[2])
  const tts = new sherpa.OfflineTts({
    model: { kokoro: { model, voices, tokens, lexicon, lengthScale: 1 }, numThreads: 2, provider: "cpu" },
    maxNumSentences: 1,
  })
  if (request.speaker >= tts.numSpeakers) throw new Error(`Kokoro speaker index must be below ${tts.numSpeakers}`)
  // Electron disables V8 external buffers; the addon must return copied samples.
  const audio = tts.generate({ text: request.text, sid: request.speaker, speed: 1, enableExternalBuffer: false })
  if (!audio.samples.length) throw new Error("Kokoro produced no audio")
  if (!sherpa.writeWave(request.output, audio)) throw new Error("Could not write Kokoro WAV")
}

function readRecorderWave(filename) {
  const wav = fs.readFileSync(filename)
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Invalid recorder WAV")
  let format
  let data
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > wav.length) throw new Error("Truncated recorder WAV")
    const id = wav.toString("ascii", offset, offset + 4)
    if (id === "fmt ") {
      if (size < 16) throw new Error("Invalid recorder WAV format")
      format = {
        encoding: wav.readUInt16LE(start),
        channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4),
        bits: wav.readUInt16LE(start + 14),
      }
    }
    if (id === "data") data = wav.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.sampleRate !== 16000 || format.bits !== 16)
    throw new Error("Recorder WAV must be mono 16 kHz PCM16")
  if (!data?.length || data.length % 2) throw new Error("Recorder WAV contains no complete samples")
  return {
    sampleRate: 16000,
    samples: Float32Array.from({ length: data.length / 2 }, (_, i) => data.readInt16LE(i * 2) / 32768),
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
