const fs = require("node:fs")
const path = require("node:path")
const { normalize } = require("./english-text.cjs")

const letters = {
  A: "ˈeɪ",
  B: "bˈiː",
  C: "sˈiː",
  D: "dˈiː",
  E: "ˈiː",
  F: "ˈɛf",
  G: "dʒˈiː",
  H: "ˈeɪtʃ",
  I: "ˈaɪ",
  J: "dʒˈeɪ",
  K: "kˈeɪ",
  L: "ˈɛl",
  M: "ˈɛm",
  N: "ˈɛn",
  O: "ˈoʊ",
  P: "pˈiː",
  Q: "kjˈuː",
  R: "ˈɑːɹ",
  S: "ˈɛs",
  T: "tˈiː",
  U: "jˈuː",
  V: "vˈiː",
  W: "dˈʌbəl jˈuː",
  X: "ˈɛks",
  Y: "wˈaɪ",
  Z: "zˈiː",
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("The Piper phonemizer is supported only on Windows x64")
  if (!process.argv[2] || !path.isAbsolute(process.argv[2]))
    throw new Error("An absolute ONNX Runtime module path is required")
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (
    !request ||
    typeof request.text !== "string" ||
    typeof request.model !== "string" ||
    !path.isAbsolute(request.model)
  )
    throw new Error("A model directory and speech text are required")

  const meta = JSON.parse(fs.readFileSync(path.join(request.model, "openphonemizer.json"), "utf8"))
  const vocabulary = new Set(
    fs
      .readFileSync(path.join(request.model, "tokens.txt"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.slice(0, line.lastIndexOf(" "))),
  )
  const words = normalize(request.text).split(/\s+/).filter(Boolean)
  if (!words.some((word) => /[a-z]/i.test(word))) throw new Error("Speech text contains no pronounceable words")
  const ort = require(process.argv[2])
  const session = await ort.InferenceSession.create(path.join(request.model, "openphonemizer.onnx"), {
    executionProviders: ["cpu"],
    intraOpNumThreads: 2,
  })

  async function pronounce(word) {
    if (/^[A-Z]{2,}$/.test(word) || /^[B-HJ-Z]$/.test(word)) return [...word].map((letter) => letters[letter]).join(" ")
    const lower = word.toLowerCase()
    const irregular = { "can't": "cannot", "won't": "will not", "shan't": "shall not" }
    if (Object.hasOwn(irregular, lower))
      return (await Promise.all(irregular[lower].split(" ").map(pronounce))).join(" ")
    if (lower === "ain't") return "ˈeɪnt"
    if (lower.endsWith("n't")) return `${await pronounce(word.slice(0, -3))} ${await pronounce("not")}`
    const contraction = /^([a-z]+)'(s|d|ll|re|ve|m)$/i.exec(word)
    if (contraction) {
      const base = await pronounce(contraction[1])
      const suffix = contraction[2].toLowerCase()
      if (suffix === "re") return `${base} ${await pronounce("are")}`
      if (suffix === "ve") return `${base} ${await pronounce("have")}`
      if (suffix === "ll") return `${base}əl`
      if (suffix === "m") return `${base}m`
      if (suffix === "d") return `${base}d`
      if (/[szʃʒ]$/.test(base)) return `${base}ɪz`
      return `${base}${/[ptkfθ]$/.test(base) ? "s" : "z"}`
    }
    if (word.includes("'")) {
      const parts = word.split("'")
      const apostrophe = await pronounce("apostrophe")
      return (await Promise.all(parts.map(pronounce))).join(` ${apostrophe} `)
    }
    const lexical = meta.dictionary[word] ?? meta.dictionary[lower]
    if (typeof lexical === "string" && lexical) return lexical
    const spelling = [...lower].flatMap((char) => {
      const id = meta.text_tokens[char]
      if (!Number.isInteger(id) || id < 3) throw new Error(`Cannot phonemize word: ${word}`)
      return Array(meta.char_repeats).fill(id)
    })
    const input = [meta.start_index, ...spelling, meta.end_index]
    const result = await session.run({
      text: new ort.Tensor("int64", BigInt64Array.from(input.map(BigInt)), [1, input.length]),
    })
    const logits = Object.values(result)[0]
    const size = logits.dims.at(-1)
    const output = []
    let previous = -1
    let ended = false
    for (let offset = 0; offset < logits.data.length; offset += size) {
      let best = 0
      for (let index = 1; index < size; index++)
        if (logits.data[offset + index] > logits.data[offset + best]) best = index
      if (best === meta.end_index) {
        ended = true
        break
      }
      if (best !== previous && best !== 0 && best !== meta.start_index) {
        const phoneme = meta.phoneme_tokens[best]
        if (typeof phoneme !== "string" || !phoneme) throw new Error(`Invalid pronunciation for: ${word}`)
        output.push(phoneme)
      }
      previous = best
    }
    if (!output.length || !ended) throw new Error(`Incomplete pronunciation for: ${word}`)
    return output.join("")
  }

  const sentences = []
  let sentence = ""
  for (const word of words) {
    const pronunciation = /^[.,!?]$/.test(word)
      ? word
      : await pronounce(word === '"' ? "quote" : word === "'" ? "apostrophe" : word)
    // Piper lacks the syllabic-n combining mark; an explicit schwa preserves the syllable.
    const value = pronunciation.replaceAll("n̩", "ən")
    const unsupported = [...value].find((char) => !vocabulary.has(char))
    if (unsupported) throw new Error(`Unsupported Piper phoneme in "${word}": ${unsupported}`)
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
