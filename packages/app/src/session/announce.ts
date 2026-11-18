import type { ReplyAnnouncementMode } from "@/settings/model"

type Politeness = "polite" | "assertive"

type Region = { element: HTMLElement; pending?: ReturnType<typeof setTimeout> }

const regions = new Map<Politeness, Region>()
let lastAnnouncement: { message: string; politeness: Politeness } | undefined

export function mountAnnouncers() {
  if (typeof document === "undefined") return
  for (const politeness of ["polite", "assertive"] as const) {
    if (!regions.get(politeness)?.element.isConnected) createRegion(politeness)
  }
}

export function announce(message: string, politeness: Politeness = "polite") {
  publish(message, politeness, true)
}

export function announceCompletedReply(mode: ReplyAnnouncementMode, text: { ready: () => string; full: () => string }) {
  if (mode === "ready") announce(text.ready())
  if (mode === "full") announce(text.full(), "assertive")
}

export function repeatLastAnnouncement(empty: string) {
  if (!lastAnnouncement) return publish(empty, "polite", false)
  publish(lastAnnouncement.message, lastAnnouncement.politeness, false)
}

export function testAnnouncements(phrase: string, politeness: Politeness = "assertive") {
  publish(phrase, politeness, false)
}

function publish(message: string, politeness: Politeness, remember: boolean) {
  if (typeof document === "undefined" || !message.trim()) return
  const existing = regions.get(politeness)
  const ready = existing?.element.isConnected
  const region = ready ? existing : createRegion(politeness)

  // Clear before publishing so assistive technology detects repeated text.
  clearTimeout(region.pending)
  region.element.textContent = ""
  region.pending = setTimeout(() => {
    region.pending = undefined
    if (!region.element.isConnected) return
    region.element.textContent = message
    if (remember) lastAnnouncement = { message, politeness }
  }, ready ? 50 : 150)
}

function createRegion(politeness: Politeness): Region {
  const region = document.createElement("div")
  region.className = "sr-only"
  region.setAttribute("data-component", "announcer")
  // A modal dialog hides the rest of the page from screen readers; Kobalte leaves elements with this attribute out,
  // so announcements made while a dialog is open are still read.
  region.setAttribute("data-live-announcer", "true")
  region.setAttribute("role", politeness === "assertive" ? "alert" : "status")
  if (politeness === "polite") region.setAttribute("aria-live", "polite")
  region.setAttribute("aria-atomic", "true")
  document.body.appendChild(region)

  const entry = { element: region }
  regions.set(politeness, entry)
  return entry
}

const announced = new Set<string>()

/** Announces a message once for each key, so a request whose dock mounts again is not read again. */
export function announceOnce(key: string, message: string, politeness: Politeness = "polite") {
  if (announced.has(key)) return
  announced.add(key)
  announce(message, politeness)
}
