import { expect, test } from "bun:test"
import path from "node:path"

test("the grey audit recognizes exceptions and checks ordinary stylesheets", () => {
  const result = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "../../../script/check-greys.ts"), "--json"])
  expect(result.exitCode).toBe(0)
  const audit = JSON.parse(result.stdout.toString()) as {
    entries: { file: string; property: string; hex: string; outcome: string }[]
  }
  expect(
    audit.entries.find(
      (entry) => entry.file.endsWith("/style/token/color.css") && entry.property === "--color-bg-surface",
    )?.outcome,
  ).toStartWith("exception:")
  expect(
    audit.entries.find(
      (entry) => entry.file.endsWith("/routes/font/index.css") && entry.property === "--on-link",
    )?.outcome,
  ).toBe("token")
})
