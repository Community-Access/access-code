import { expect, jest, test } from "bun:test"
import { announce, mountAnnouncers, repeatLastAnnouncement, testAnnouncements } from "./announce"

test("mounts live regions before the first reply and repeats it without moving focus", () => {
  jest.useFakeTimers()
  const input = document.createElement("input")
  document.body.append(input)
  input.focus()

  try {
    mountAnnouncers()
    const region = document.body.querySelector('[data-live-announcer][role="status"]')
    expect(region?.textContent).toBe("")
    repeatLastAnnouncement("Nothing to repeat")
    jest.runAllTimers()
    expect(region?.textContent).toBe("Nothing to repeat")

    announce("Assistant: First reply")
    jest.runAllTimers()
    expect(region?.textContent).toBe("Assistant: First reply")

    testAnnouncements("Test phrase")
    jest.runAllTimers()
    expect(document.body.querySelector('[data-live-announcer][role="alert"]')?.textContent).toBe("Test phrase")
    repeatLastAnnouncement("Nothing to repeat")
    jest.runAllTimers()
    expect(region?.textContent).toBe("Assistant: First reply")

    repeatLastAnnouncement("Nothing to repeat")
    expect(region?.textContent).toBe("")
    jest.runAllTimers()
    expect(region?.textContent).toBe("Assistant: First reply")
    expect(document.activeElement).toBe(input)
  } finally {
    input.remove()
    jest.useRealTimers()
  }
})

test("coalesces stale pending text without cancelling a different priority", () => {
  jest.useFakeTimers()
  try {
    mountAnnouncers()
    const region = document.body.querySelector('[data-live-announcer][role="status"]')
    const alert = document.body.querySelector('[data-live-announcer][role="alert"]')
    announce("Old status")
    jest.advanceTimersByTime(25)
    announce("New status")
    announce("Approval needed", "assertive")
    jest.advanceTimersByTime(25)
    expect(region?.textContent).toBe("")
    jest.runAllTimers()
    expect(region?.textContent).toBe("New status")
    expect(alert?.textContent).toBe("Approval needed")
  } finally {
    jest.useRealTimers()
  }
})
