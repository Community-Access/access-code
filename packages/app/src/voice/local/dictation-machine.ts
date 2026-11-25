import type { Recorder } from "./recorder"

export type DictationState =
  | { type: "idle" }
  | { type: "starting"; id: string }
  | { type: "recording"; id: string; recorder: Recorder }
  | { type: "stopping"; id: string }
  | { type: "disposed" }

export type DictationEvent =
  | { type: "start"; id: string }
  | { type: "started"; id: string; recorder: Recorder }
  | { type: "stop" }
  | { type: "finished"; id: string }
  | { type: "failed"; id: string }
  | { type: "dispose" }

export function transition(state: DictationState, event: DictationEvent): DictationState {
  if (event.type === "dispose") return state.type === "disposed" ? state : { type: "disposed" }
  if (event.type === "start") return state.type === "idle" ? { type: "starting", id: event.id } : state
  if (event.type === "stop") return state.type === "recording" ? { type: "stopping", id: state.id } : state
  if (state.type === "idle" || state.type === "disposed" || state.id !== event.id) return state
  if (event.type === "failed") return { type: "idle" }
  if (event.type === "started" && state.type === "starting")
    return { type: "recording", id: state.id, recorder: event.recorder }
  if (event.type === "finished" && state.type === "stopping") return { type: "idle" }
  return state
}
