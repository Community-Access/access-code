const fallbackKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

export function withMenuMnemonics<T extends { label?: string }>(items: T[], enabled: boolean): T[] {
  if (!enabled) return items

  const used = new Set<string>()
  return items.map((item) => {
    if (!item.label) return item
    const text = item.label.replaceAll("&", "&&")
    const initials = [...text.matchAll(/\b[a-z0-9]/gi)]
    const letters = [...text.matchAll(/[a-z0-9]/gi)]
    const match = [...initials, ...letters].find(([letter]) => !used.has(letter.toUpperCase()))
    const key = match?.[0].toUpperCase() ?? [...fallbackKeys].find((letter) => !used.has(letter))
    if (!key) return { ...item, label: text }
    used.add(key)

    return {
      ...item,
      label: match ? `${text.slice(0, match.index)}&${text.slice(match.index)}` : `${text} (&${key})`,
    }
  })
}
