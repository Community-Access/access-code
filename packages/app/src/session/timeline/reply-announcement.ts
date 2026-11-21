import type { SessionMessageAssistant } from "@opencode/client/promise"
import { createEffect, type Accessor } from "solid-js"

export function watchReplyAnnouncement(input: {
  sessionID: Accessor<string | undefined>
  active: Accessor<boolean>
  idle: Accessor<boolean>
  turn: Accessor<string | undefined>
  replies: (turn: string) => readonly SessionMessageAssistant[]
  /** Plain text for a screen reader, and the reply's markdown for Voice Mode, which drops code before speaking. */
  announce: (text: string, markdown: string) => void
}) {
  let sessionID: string | undefined
  let pending: string | undefined
  let last: string | undefined

  createEffect(() => {
    const id = input.sessionID()
    if (sessionID !== id) {
      sessionID = id
      pending = undefined
      last = undefined
    }
    if (!id || !input.active()) {
      pending = undefined
      return
    }
    if (!input.idle()) {
      pending = input.turn()
      return
    }
    if (!pending) return

    // Idle and the final message can arrive separately. Keep tracking this turn until the reply is ready.
    const reply = input.replies(pending).at(-1)
    if (!reply || reply.time.completed === undefined || reply.finish === "tool-calls") return
    if (reply.error || reply.id === last) {
      pending = undefined
      return
    }
    const markdown = reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
    const text = plainText(markdown)
    if (!text) return
    pending = undefined
    last = reply.id
    input.announce(text, markdown)
  })
}

export function plainText(text: string) {
  return text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*{1,3}|`+|~~/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
