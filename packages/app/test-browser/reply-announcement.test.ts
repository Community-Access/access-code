import { expect, jest, test } from "bun:test"
import type { SessionMessageAssistant } from "@opencode/client/promise"
import { createCopyFeedback } from "@opencode/session-ui/copy"
import { createRoot, createSignal } from "solid-js"
import { announceCompletedReply, mountAnnouncers, repeatLastAnnouncement, testAnnouncements } from "../src/session/announce"
import { watchReplyAnnouncement } from "../src/session/timeline/reply-announcement"

const reply = (id: string, text: string, completed?: number): SessionMessageAssistant => ({
  id,
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  time: { created: 1, completed },
  content: [{ type: "text", text }],
})

test("copy feedback waits for clipboard success and never confirms a failed write", async () => {
  const outcomes: string[] = []
  const writes: string[] = []
  const pending = Promise.withResolvers<boolean>()
  const { dispose, copy } = createRoot((dispose) => ({
    dispose,
    copy: createCopyFeedback({
      write: async (text) => {
        writes.push(text)
        return text === "First reply" ? pending.promise : false
      },
      onSuccess: () => outcomes.push("copied"),
      onError: () => outcomes.push("failed"),
    }),
  }))

  try {
    copy.copy("First reply")
    expect(outcomes).toEqual([])
    pending.resolve(true)
    await Bun.sleep(0)
    expect(outcomes).toEqual(["copied"])

    copy.copy("Second reply")
    await Bun.sleep(0)
    expect(writes).toEqual(["First reply", "Second reply"])
    expect(outcomes).toEqual(["copied", "failed"])
    expect(copy.copied()).toBe(false)
  } finally {
    dispose()
  }
})

test("publishes a late completed reply as an ARIA alert without replaying on history updates", () => {
  jest.useFakeTimers()
  const [idle, setIdle] = createSignal(true)
  const [turn, setTurn] = createSignal("old")
  const [messages, setMessages] = createSignal<Record<string, SessionMessageAssistant[]>>({
    old: [reply("old-reply", "Old answer", 2)],
  })
  mountAnnouncers()
  const alert = document.body.querySelector('[data-live-announcer][role="alert"]')
  const dispose = createRoot((dispose) => {
    watchReplyAnnouncement({
      sessionID: () => "session",
      active: () => true,
      idle,
      turn,
      replies: (id) => messages()[id] ?? [],
      announce: (text) =>
        announceCompletedReply("full", { ready: () => "Response ready", full: () => `Assistant: ${text}` }),
    })

    return dispose
  })

  try {
    jest.runAllTimers()
    expect(alert?.textContent).toBe("")
    setTurn("new")
    setIdle(false)
    setMessages({ new: [reply("new-reply", "Partial")] })
    setIdle(true)
    jest.runAllTimers()
    expect(alert?.textContent).toBe("")

    setMessages({ new: [reply("new-reply", "**Final answer**", 3)] })
    jest.runAllTimers()
    expect(alert?.textContent).toBe("Assistant: Final answer")

    setMessages({ new: [reply("new-reply", "Final answer", 3)] })
    expect(alert?.textContent).toBe("Assistant: Final answer")
    repeatLastAnnouncement("Nothing to repeat")
    expect(alert?.textContent).toBe("")
    jest.runAllTimers()
    expect(alert?.textContent).toBe("Assistant: Final answer")
  } finally {
    dispose()
    jest.useRealTimers()
  }
})

test("ready announces only the short status and off leaves automatic announcements silent", () => {
  jest.useFakeTimers()
  mountAnnouncers()
  const alert = document.body.querySelector('[data-live-announcer][role="alert"]')
  const status = document.body.querySelector('[data-live-announcer][role="status"]')
  const full = jest.fn(() => "Private reply text")
  const messages = { ready: () => "Response ready", full }

  try {
    const previousAlert = alert?.textContent
    announceCompletedReply("ready", messages)
    jest.runAllTimers()
    expect(status?.textContent).toBe("Response ready")
    expect(alert?.textContent).toBe(previousAlert)
    announceCompletedReply("off", { ...messages, ready: () => "Should not be spoken" })
    jest.runAllTimers()
    expect(status?.textContent).toBe("Response ready")
    expect(alert?.textContent).toBe(previousAlert)
    expect(full).not.toHaveBeenCalled()

    testAnnouncements("Access Code announcement test", "polite")
    jest.runAllTimers()
    expect(status?.textContent).toBe("Access Code announcement test")
    repeatLastAnnouncement("Nothing to repeat")
    jest.runAllTimers()
    expect(status?.textContent).toBe("Response ready")
  } finally {
    jest.useRealTimers()
  }
})
