import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ExtensionLoadFailed } from "@/settings/extension-load"
import { createSearchState, transitionSearch, type SearchEffect, type SearchEvent } from "./machine"
import { planServer, type McpPlan, type RegistryServer } from "./mcp-plan"

const DEBOUNCE_MS = 400

/** Searches the MCP Registry through the server, which fetches it because the registry blocks browser requests. */
export function RegistryTab(props: {
  onSetup: (server: RegistryServer, plan: McpPlan) => void
  onAskAi: (text: string) => void
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [input, setInput] = createSignal("")
  const [search, setSearch] = createSignal(createSearchState())
  const timers: { debounce?: ReturnType<typeof setTimeout> } = {}
  const live = { disposed: false, list: undefined as HTMLUListElement | undefined, reveal: -1 }

  onCleanup(() => {
    live.disposed = true
    clearTimeout(timers.debounce)
  })

  const dispatch = (event: SearchEvent) => {
    const previous = untrack(search)
    const result = transitionSearch(previous, event)

    if (result.state !== previous) setSearch(result.state)
    result.effects.forEach(run)
  }

  const run = (effect: SearchEffect) => {
    void serverSdk.api.experimental.config
      .mcpRegistry({ search: effect.query || undefined, cursor: effect.cursor })
      .then(
        (result) => {
          if (live.disposed) return
          dispatch({ type: "page.loaded", attempt: effect.attempt, servers: result.servers, cursor: result.nextCursor })
          revealMore()
        },
        () => {
          if (!live.disposed) dispatch({ type: "page.failed", attempt: effect.attempt })
        },
      )
  }

  // Load more disappears with the last page, so focus moves to the first new server instead of being lost.
  const revealMore = () => {
    const index = live.reveal

    if (index < 0) return
    live.reveal = -1
    requestAnimationFrame(() => live.list?.querySelectorAll<HTMLButtonElement>("li button")[index]?.focus())
  }

  const onInput = (value: string) => {
    setInput(value)
    clearTimeout(timers.debounce)
    timers.debounce = setTimeout(() => dispatch({ type: "query.committed", query: value.trim() }), DEBOUNCE_MS)
  }

  dispatch({ type: "query.committed", query: "" })

  const loadingMore = () => {
    const current = search()

    return current.status === "loading" && current.page === "more"
  }

  const rows = createMemo(() => search().servers.map((server) => ({ server, plan: planServer(server) })))

  const status = () => {
    const current = search()

    if (current.status === "loading" && current.page === "first")
      return language.t("settings.extensions.add.registry.searching")

    if (current.status === "failed") return ""

    if (current.servers.length === 0)
      return current.query
        ? language.t("settings.extensions.add.registry.empty", { query: current.query })
        : language.t("settings.extensions.add.registry.emptyAll")

    return language.plural("settings.extensions.add.registry.count", current.servers.length)
  }

  const where = (plan: McpPlan | undefined) => {
    if (!plan) return language.t("settings.extensions.add.registry.manual")

    return language.t(
      plan.type === "local" ? "settings.extensions.add.registry.local" : "settings.extensions.add.registry.remote",
    )
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <Field>
        <Field.Label>{language.t("settings.extensions.add.registry.search")}</Field.Label>
        <TextInput
          type="search"
          appearance="large"
          class="!w-full"
          placeholder={language.t("settings.extensions.add.registry.search.placeholder")}
          value={input()}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => onInput(event.currentTarget.value)}
        />
      </Field>
      <p role="status" class="text-13-regular text-v2-text-text-muted">
        {status()}
      </p>
      <Switch>
        <Match when={search().status === "failed"}>
          <ExtensionLoadFailed
            message={language.t("settings.extensions.add.registry.loadFailed")}
            retry={language.t("common.retry")}
            onRetry={() => dispatch({ type: "retry.requested" })}
          />
        </Match>
        <Match when={search().status === "ready" && search().servers.length === 0 && search().query}>
          <div>
            <Button
              variant="neutral"
              aria-label={language.t("settings.extensions.add.askAi.label", { name: search().query })}
              onClick={() => props.onAskAi(search().query)}
            >
              {language.t("settings.extensions.add.askAi")}
            </Button>
          </div>
        </Match>
      </Switch>
      <ul
        ref={(element) => (live.list = element)}
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-label={language.t("settings.extensions.add.registry.list")}
        aria-busy={search().status === "loading"}
        data-scrollable
      >
        <For each={rows()}>
          {(row) => {
            const name = () => row.server.title ?? row.server.name

            return (
              <li class="flex items-start gap-3 border-b border-v2-border-border-weak py-3 last:border-b-0">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="text-13-medium text-v2-text-text-base [overflow-wrap:anywhere]">{name()}</span>
                  <Show when={row.server.title}>
                    <span class="text-12-regular text-v2-text-text-muted [overflow-wrap:anywhere]">
                      {row.server.name}
                    </span>
                  </Show>
                  <Show when={row.server.description}>
                    {(description) => <span class="text-13-regular text-v2-text-text-muted">{description()}</span>}
                  </Show>
                  <span class="text-12-regular text-v2-text-text-muted">{where(row.plan)}</span>
                </div>
                <div class="flex shrink-0 items-center">
                  <Show
                    when={row.plan}
                    fallback={
                      <Button
                        size="small"
                        variant="ghost-muted"
                        aria-label={language.t("settings.extensions.add.askAi.label", { name: name() })}
                        onClick={() =>
                          props.onAskAi(
                            [row.server.name, row.server.repository?.url ?? row.server.websiteUrl]
                              .filter(Boolean)
                              .join(" "),
                          )
                        }
                      >
                        {language.t("settings.extensions.add.askAi")}
                      </Button>
                    }
                  >
                    {(plan) => (
                      <Button
                        size="small"
                        variant="neutral"
                        aria-label={language.t("settings.extensions.add.registry.setup.label", { name: name() })}
                        onClick={() => props.onSetup(row.server, plan())}
                      >
                        {language.t("settings.extensions.add.registry.setup")}
                      </Button>
                    )}
                  </Show>
                </div>
              </li>
            )
          }}
        </For>
      </ul>
      <Show when={search().status !== "failed" && search().cursor}>
        <div>
          <Button
            variant="ghost-muted"
            aria-busy={loadingMore()}
            onClick={() => {
              if (loadingMore()) return
              live.reveal = search().servers.length
              dispatch({ type: "more.requested" })
            }}
          >
            {language.t(loadingMore() ? "common.loading" : "settings.extensions.add.registry.loadMore")}
          </Button>
        </div>
      </Show>
    </div>
  )
}
