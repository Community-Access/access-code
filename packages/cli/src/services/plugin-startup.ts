import type { OpenCodeClient } from "@opencode/client"
import { Effect, Schedule } from "effect"

const poll = Schedule.spaced("25 millis").pipe(Schedule.upTo({ duration: "5 seconds" }))

// Catalog reads return whatever is loaded, so one-shot commands, which read once and exit, wait until the Location
// reports its plugins have finished loading, npm installs included. A server without the readiness route is waited on
// until it lists any plugin, as before it had one.
export const waitForPlugins = (client: OpenCodeClient, directory: string) =>
  Effect.tryPromise((signal) => client.experimental.plugin.ready({ location: { directory } }, { signal })).pipe(
    Effect.repeat({ until: (result) => result.data.ready, schedule: poll }),
    Effect.catch(() =>
      Effect.tryPromise((signal) => client.plugin.list({ location: { directory } }, { signal })).pipe(
        Effect.repeat({ until: (plugins) => plugins.data.length > 0, schedule: poll }),
      ),
    ),
    Effect.ignore,
  )
