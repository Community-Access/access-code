import { expect, test } from "bun:test"
import { withMenuMnemonics } from "./menu-mnemonics"

test("English top-level labels expose the standard menu access keys", () => {
  const items = ["File", "Edit", "View", "Go", "Window", "Help"].map((label) => ({ label }))
  expect(withMenuMnemonics(items, true).map(({ label }) => label)).toEqual([
    "&File", "&Edit", "&View", "&Go", "&Window", "&Help",
  ])
})

test("sibling commands have distinct access keys without changing direct shortcuts", () => {
  const items = [
    { label: "Copy", accelerator: "Ctrl+C" },
    { label: "Copy Link" },
    { label: "Cut & Paste" },
    { label: "设置" },
  ]
  const labels = withMenuMnemonics(items, true)
  expect(labels).toEqual([
    { label: "&Copy", accelerator: "Ctrl+C" },
    { label: "Copy &Link" },
    { label: "Cut && &Paste" },
    { label: "设置 (&A)" },
  ])
  expect(withMenuMnemonics(items, false)).toEqual(items)
})
