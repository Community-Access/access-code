import { describe, expect, test } from "bun:test"
import { initial, transition, type Pack } from "./windows-packs-machine"

const pack: Pack = {
  id: "model",
  name: "Model",
  kind: "recognition",
  description: "",
  license: "",
  source: "",
  size: 1,
  installed: false,
  download: null,
  error: null,
}

describe("Windows voice model settings lifecycle", () => {
  test("cancelling an in-flight install rejects its late result and allows another request", () => {
    const installing = transition(initial(), {
      type: "operate",
      id: "install",
      pack: "model",
      action: "install",
      announcement: "installing",
    })
    expect(
      transition(installing, { type: "operate", id: "remove", pack: "other", action: "remove", announcement: "" }),
    ).toBe(installing)
    const cancelling = transition(installing, {
      type: "operate",
      id: "cancel",
      pack: "model",
      action: "cancel",
      announcement: "cancelling",
    })
    expect(transition(cancelling, { type: "operated", id: "install", announcement: "installed" })).toBe(cancelling)
    const confirming = transition(cancelling, { type: "operated", id: "cancel", announcement: "cancelled" })
    expect(
      transition(confirming, { type: "operate", id: "remove", pack: "model", action: "remove", announcement: "" }),
    ).toBe(confirming)
    const fetching = transition(confirming, { type: "fetch", id: "snapshot" })
    const done = transition(fetching, { type: "fetched", id: "snapshot", packs: [pack], voices: [] })
    expect(done.type === "open" && done.announcement).toBe("cancelled")
    const removing = transition(done, {
      type: "operate",
      id: "remove",
      pack: "model",
      action: "remove",
      announcement: "",
    })
    const failed = transition(removing, { type: "operationFailed", id: "remove", error: "timeout" })
    expect(failed.type === "open" && failed.operation.type).toBe("idle")
    expect(failed.type === "open" && failed.error).toBe("timeout")
  })

  test("ignores stale fetches and all results after disposal", () => {
    const loading = transition(initial(), { type: "fetch", id: "one" })
    expect(transition(loading, { type: "fetch", id: "two" })).toBe(loading)
    const timedOut = transition(loading, { type: "fetchFailed", id: "one", error: "timeout" })
    const retry = transition(timedOut, { type: "fetch", id: "two" })
    expect(transition(retry, { type: "fetched", id: "one", packs: [], voices: [] })).toBe(retry)
    const loaded = transition(retry, {
      type: "fetched",
      id: "two",
      packs: [],
      voices: [{ id: "voice", name: "Voice" }],
    })
    expect(loaded.type === "open" && loaded.voices[0]?.id).toBe("voice")
    const disposed = transition(loaded, { type: "dispose" })
    expect(transition(disposed, { type: "fetch", id: "three" })).toBe(disposed)
    expect(transition(disposed, { type: "operationFailed", id: "remove", error: "late" })).toBe(disposed)
  })

  test("holds an accepted install until a fresh snapshot reports its outcome", () => {
    const installing = transition(initial(), {
      type: "operate",
      id: "install",
      pack: "model",
      action: "install",
      announcement: "",
    })
    const accepted = transition(installing, { type: "operated", id: "install", announcement: "" })
    const fetching = transition(accepted, { type: "fetch", id: "first" })
    const waiting = transition(fetching, { type: "fetched", id: "first", packs: [pack], voices: [] })
    expect(
      transition(waiting, { type: "operate", id: "again", pack: "model", action: "install", announcement: "" }),
    ).toBe(waiting)
    const next = transition(waiting, { type: "fetch", id: "second" })
    const downloading = transition(next, {
      type: "fetched",
      id: "second",
      packs: [{ ...pack, download: { received: 1, total: 10 } }],
      voices: [],
    })
    expect(downloading.type === "open" && downloading.operation.type).toBe("idle")
    expect(transition(downloading, { type: "operationFailed", id: "install", error: "late timeout" })).toBe(downloading)
  })

  test("does not confirm a cancellation using a snapshot requested before cancellation completed", () => {
    const cancelling = transition(initial(), {
      type: "operate",
      id: "cancel",
      pack: "model",
      action: "cancel",
      announcement: "",
    })
    const fetching = transition(cancelling, { type: "fetch", id: "old" })
    const accepted = transition(fetching, { type: "operated", id: "cancel", announcement: "" })
    const stale = transition(accepted, { type: "fetched", id: "old", packs: [pack], voices: [] })
    expect(stale.type === "open" && stale.operation.type).toBe("working")
    const next = transition(stale, { type: "fetch", id: "new" })
    const confirmed = transition(next, { type: "fetched", id: "new", packs: [pack], voices: [] })
    expect(confirmed.type === "open" && confirmed.operation.type).toBe("idle")
  })
})
