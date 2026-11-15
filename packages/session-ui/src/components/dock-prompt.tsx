import type { JSX } from "solid-js"

export function DockPrompt(props: {
  kind: "question" | "permission"
  variant?: "experimental"
  header: JSX.Element
  children: JSX.Element
  footer: JSX.Element
  /** The id of the dock's title, which names it as a region so screen readers can find it. */
  titleID?: string
  ref?: (el: HTMLDivElement) => void
  onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>
}) {
  const slot = (name: string) => `${props.kind}-${name}`

  return (
    <div
      data-component="dock-prompt"
      data-kind={props.kind}
      data-variant={props.variant}
      role={props.titleID ? "region" : undefined}
      aria-labelledby={props.titleID}
      ref={props.ref}
      onKeyDown={props.onKeyDown}
    >
      <div data-slot={slot("body")}>
        <div data-slot={slot("header")}>{props.header}</div>
        <div data-slot={slot("content")}>{props.children}</div>
      </div>
      <div data-slot={slot("footer")}>{props.footer}</div>
    </div>
  )
}
