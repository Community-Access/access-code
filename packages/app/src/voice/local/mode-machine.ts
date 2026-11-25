export type ModeState<Options, Recorder> =
  | { type: "idle" }
  | { type: "starting"; id: string; options: Options }
  | { type: "active"; id: string; options: Options; recorder: Recorder }

export type ModeEvent<Options, Recorder> =
  | { type: "start"; id: string; options: Options }
  | { type: "started"; id: string; recorder: Recorder }
  | { type: "failed"; id: string }
  | { type: "end" }

export function transition<Options, Recorder>(
  state: ModeState<Options, Recorder>,
  event: ModeEvent<Options, Recorder>,
): ModeState<Options, Recorder> {
  if (event.type === "start") {
    if (state.type !== "idle") return state
    return { type: "starting", id: event.id, options: event.options }
  }
  if (event.type === "end") {
    if (state.type === "idle") return state
    return { type: "idle" }
  }
  if (state.type !== "starting" || state.id !== event.id) return state
  if (event.type === "failed") return { type: "idle" }
  return { type: "active", id: state.id, options: state.options, recorder: event.recorder }
}
