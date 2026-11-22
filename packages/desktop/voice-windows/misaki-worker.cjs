const fs = require("node:fs")
const path = require("node:path")
const { normalize } = require("./english-text.cjs")

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("The Misaki phonemizer is supported only on Windows x64")
  if (!process.argv[2] || !path.isAbsolute(process.argv[2]))
    throw new Error("An absolute ONNX Runtime module path is required")
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!request || typeof request.text !== "string" || typeof request.model !== "string" || !path.isAbsolute(request.model))
    throw new Error("A model directory and speech text are required")

  const meta = JSON.parse(fs.readFileSync(path.join(request.model, "misaki-en_us-g2p.json"), "utf8"))
  const words = normalize(request.text).split(/\s+/).filter(Boolean)
  if (!words.some((word) => /[a-z]/i.test(word))) throw new Error("Speech text contains no pronounceable words")
  const ort = require(process.argv[2])
  const session = await ort.InferenceSession.create(path.join(request.model, "misaki-en_us-g2p.onnx"), {
    executionProviders: ["cpu"],
    intraOpNumThreads: 2,
  })

  async function pronounce(word) {
    if (/^[A-Z]{2,}$/.test(word))
      return [...word].map((letter) => {
        const pronunciation = meta.gold[letter]
        if (typeof pronunciation !== "string" || !pronunciation) throw new Error(`Missing letter pronunciation: ${letter}`)
        return pronunciation
      }).join(" ")
    const lexical = meta.gold[word] ?? meta.gold[word.toLowerCase()] ?? meta.silver[word] ?? meta.silver[word.toLowerCase()]
    const entry = typeof lexical === "string" ? lexical : lexical?.DEFAULT
    if (entry) return entry
    const spelling = [...word.toLowerCase()].map((char) => meta.graphemes.indexOf(char))
    if (spelling.some((id) => id < 4)) throw new Error(`Cannot phonemize word: ${word}`)
    const input = [meta.bos_id, ...spelling, meta.eos_id]
    const output = [meta.start_id]
    for (let step = 1; step < meta.max_steps; step++) {
      const result = await session.run({
        input_ids: new ort.Tensor("int64", BigInt64Array.from(input.map(BigInt)), [1, input.length]),
        decoder_input_ids: new ort.Tensor("int64", BigInt64Array.from(output.map(BigInt)), [1, output.length]),
      })
      const logits = result.logits
      const size = logits.dims[2]
      const offset = (output.length - 1) * size
      let best = 0
      for (let index = 1; index < size; index++)
        if (logits.data[offset + index] > logits.data[offset + best]) best = index
      if (step === 1 && best === meta.bos_id) {
        output.push(best)
        continue
      }
      if (best === meta.eos_id) {
        const result = output.slice(output[1] === meta.bos_id ? 2 : 1).map((id) => meta.phonemes[id]).join("")
        if (!result) throw new Error(`No pronunciation for: ${word}`)
        return result
      }
      if (best < 4 || best >= meta.phonemes.length) throw new Error(`Invalid pronunciation for: ${word}`)
      output.push(best)
    }
    throw new Error(`Pronunciation exceeded the model limit: ${word}`)
  }

  const sentences = []
  let sentence = ""
  for (const word of words) {
    const value = /^[.,!?"']$/.test(word) ? (word === "'" ? await pronounce("apostrophe") : word) : await pronounce(word)
    if ([...value].some((char) => !Object.hasOwn(meta.kokoro_vocab, char)))
      throw new Error(`Pronunciation contains an unsupported phoneme: ${word}`)
    if ([...value].length > 450) throw new Error(`Pronunciation is too long: ${word}`)
    const next = sentence ? `${sentence} ${value}` : value
    if ([...next].length > 450) {
      sentences.push([...sentence].map((char) => char.codePointAt(0)))
      sentence = value
      continue
    }
    sentence = next
  }
  if (sentence) sentences.push([...sentence].map((char) => char.codePointAt(0)))
  process.stdout.write(JSON.stringify(sentences))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
