import { describe, expect, test } from "bun:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { normalize } = require("../../voice-windows/english-text.cjs") as { normalize: (text: string) => string }

describe("English voice text normalization", () => {
  test("preserves numbers, signs, paths and code symbols", () => {
    expect(normalize("C:\\src\\file.ts: -12.50 + 0.25%")).toBe(
      "C colon backslash src backslash file dot ts colon minus twelve point five zero plus zero point two five percent",
    )
    expect(normalize("issue #1024 and 007")).toBe("issue hash one thousand twenty four and zero zero seven")
    expect(normalize("“Hello”—£2 × 3…")).toBe("\" Hello \" dash pound two times three .")
  })

  test("reports unsupported characters instead of silently omitting them", () => {
    expect(() => normalize("hello 🌍")).toThrow("Unsupported character in English speech: 🌍")
    expect(() => normalize("café")).toThrow("Unsupported character in English speech: é")
  })
})
