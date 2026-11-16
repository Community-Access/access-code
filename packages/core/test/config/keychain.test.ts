import { describe, expect, test } from "bun:test"
import { ConfigKeychain } from "../../src/config/keychain"

describe("ConfigKeychain.safeValue", () => {
  test("accepts ordinary keys, including quotes and spaces", () => {
    expect(ConfigKeychain.safeValue("sk-abc123")).toBe(true)
    expect(ConfigKeychain.safeValue('Bearer a"b\\c d')).toBe(true)
  })

  test("refuses line breaks and other control characters that would start a second security command", () => {
    expect(ConfigKeychain.safeValue("abc\ndelete-generic-password -s AccessCode -a x")).toBe(false)
    expect(ConfigKeychain.safeValue("abc\rdef")).toBe(false)
    expect(ConfigKeychain.safeValue("abc\u0000def")).toBe(false)
  })
})
