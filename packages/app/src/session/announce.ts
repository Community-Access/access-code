type Politeness = "polite" | "assertive"

const regions = new Map<Politeness, HTMLElement>()

/**
 * Reads a message to screen readers once, through a live region kept at the end of the page. Screen readers only
 * read a live region that was already in the page before its text changed, so each region is created once and kept,
 * and a new one waits a moment before its first message.
 */
export function announce(message: string, politeness: Politeness = "polite") {
  if (typeof document === "undefined" || !message.trim()) return
  const existing = regions.get(politeness)
  const region = existing?.isConnected ? existing : createRegion(politeness)

  // Clearing first lets the same message be read again.
  region.textContent = ""
  setTimeout(() => (region.textContent = message), existing?.isConnected ? 50 : 150)
}

function createRegion(politeness: Politeness) {
  const region = document.createElement("div")
  region.className = "sr-only"
  region.setAttribute("data-component", "announcer")
  region.setAttribute("role", politeness === "assertive" ? "alert" : "status")
  region.setAttribute("aria-live", politeness)
  region.setAttribute("aria-atomic", "true")
  document.body.appendChild(region)
  regions.set(politeness, region)

  return region
}

const announced = new Set<string>()

/** Announces a message once for each key, so a request whose dock mounts again is not read again. */
export function announceOnce(key: string, message: string, politeness: Politeness = "polite") {
  if (announced.has(key)) return
  announced.add(key)
  announce(message, politeness)
}
