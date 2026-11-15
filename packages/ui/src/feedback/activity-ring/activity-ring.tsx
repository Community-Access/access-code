import { splitProps, type ComponentProps } from "solid-js"
import { Spinner } from "../../components/spinner"
import "./activity-ring.css"

export function ActivityRing(
  props: ComponentProps<typeof Spinner> & {
    /** What the ring means, such as "Working". Given, screen readers announce it; otherwise the ring is decorative. */
    label?: string
  },
) {
  const [local, rest] = splitProps(props, ["label"])

  return (
    <Spinner
      {...rest}
      width={rest.width ?? 14}
      height={rest.height ?? 14}
      data-component="activity-ring"
      role={local.label ? "img" : rest.role}
      aria-label={local.label ?? rest["aria-label"]}
      aria-hidden={local.label ? undefined : (rest["aria-hidden"] ?? "true")}
    />
  )
}
