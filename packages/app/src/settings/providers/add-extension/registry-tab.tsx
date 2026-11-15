import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useServerSDK } from "@/runtime/server/client"
import { ExtensionLoadFailed } from "@/settings/extension-load"
import { createSearchState, transitionSearch, type SearchEffect, type SearchEvent } from "./machine"
import { planServer, type McpPlan, type RegistryServer } from "./mcp-plan"
import { ResultRow } from "./result-row"

const DEBOUNCE_MS = 400

/** The MCP project's reference servers, which the server lists after the popular registry servers. */
const REFERENCE_PREFIX = "io.github.modelcontextprotocol/"

type Source = "registry" | "docker"

/**
 * MCP servers from the MCP Registry, Popular until the person searches, or from the Docker MCP Catalog. The server
 * fetches both, because neither allows browser requests.
 */
export function RegistryTab(props: {
  onSetup: (server: RegistryServer, plan: McpPlan) => void
  onAskAi: (text: string) => void
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [input, setInput] = createSignal("")
  const [source, setSource] = createSignal<Source>("registry")
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

  // Effects run as they are dispatched, so the source read here is the one the request was made for.
  const fetchPage = (effect: SearchEffect) => {
    const config = serverSdk.api.experimental.config

    if (untrack(source) === "docker") return config.mcpDocker({ search: effect.query || undefined })

    if (!effect.query) return config.mcpPopular()

    return config.mcpRegistry({ search: effect.query, cursor: effect.cursor })
  }

  const run = (effect: SearchEffect) => {
    void fetchPage(effect).then(
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

  const onSource = (value: Source) => {
    clearTimeout(timers.debounce)
    setSource(value)
    dispatch({ type: "query.committed", query: untrack(input).trim() })
  }

  dispatch({ type: "query.committed", query: "" })

  const mode = () => {
    if (source() === "docker") return "docker"

    return search().query ? "search" : "popular"
  }

  const loadingMore = () => {
    const current = search()

    return current.status === "loading" && current.page === "more"
  }

  const rows = createMemo(() => search().servers.map((server) => ({ server, plan: planServer(server) })))

  const status = () => {
    const current = search()

    if (current.status === "loading" && current.page === "first") {
      if (mode() === "popular") return language.t("settings.extensions.add.registry.popular.loading")
      if (mode() === "docker") return language.t("settings.extensions.add.registry.docker.loading")

      return language.t("settings.extensions.add.registry.searching")
    }

    if (current.status === "failed") return ""

    if (current.servers.length === 0)
      return current.query
        ? language.t("settings.extensions.add.registry.empty", { query: current.query })
        : language.t("settings.extensions.add.registry.emptyAll")

    if (mode() === "popular")
      return language.plural("settings.extensions.add.registry.popular.count", current.servers.length)

    if (mode() === "docker")
      return language.plural("settings.extensions.add.registry.docker.count", current.servers.length)

    return language.plural("settings.extensions.add.registry.count", current.servers.length)
  }

  const failure = () => {
    if (mode() === "popular") return language.t("settings.extensions.add.registry.popular.loadFailed")
    if (mode() === "docker") return language.t("settings.extensions.add.registry.docker.loadFailed")

    return language.t("settings.extensions.add.registry.loadFailed")
  }

  const from = (server: RegistryServer) => {
    if (source() === "docker") return language.t("settings.extensions.from.docker")
    if (server.name.startsWith(REFERENCE_PREFIX)) return language.t("settings.extensions.from.reference")

    return language.t("settings.extensions.from.registry")
  }

  const where = (plan: McpPlan | undefined) => {
    if (!plan) return language.t("settings.extensions.add.registry.manual")

    if (plan.type === "remote") return language.t("settings.extensions.runs.remote")

    return language.t(plan.runtime === "docker" ? "settings.extensions.runs.docker" : "settings.extensions.runs.local")
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <RadioGroup
        label={language.t("settings.extensions.add.registry.source")}
        value={source()}
        onChange={(value) => {
          if (value === "registry" || value === "docker") onSource(value)
        }}
      >
        <RadioItem value="registry" label={language.t("settings.extensions.add.registry.source.registry")} />
        <RadioItem value="docker" label={language.t("settings.extensions.add.registry.source.docker")} />
      </RadioGroup>
      <Field>
        <Field.Label>
          {language.t(
            source() === "docker"
              ? "settings.extensions.add.registry.docker.search"
              : "settings.extensions.add.registry.search",
          )}
        </Field.Label>
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
      <Show when={source() === "docker"}>
        <p class="text-13-regular text-v2-text-text-muted">
          {language.t("settings.extensions.add.registry.docker.note")}
        </p>
      </Show>
      <p role="status" class="text-13-regular text-v2-text-text-muted">
        {status()}
      </p>
      <Switch>
        <Match when={search().status === "failed"}>
          <ExtensionLoadFailed
            message={failure()}
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
        aria-label={language.t(
          mode() === "popular"
            ? "settings.extensions.add.registry.popular.list"
            : mode() === "docker"
              ? "settings.extensions.add.registry.docker.list"
              : "settings.extensions.add.registry.list",
        )}
        aria-busy={search().status === "loading"}
        data-scrollable
      >
        <For each={rows()}>
          {(row) => {
            const name = () => row.server.title ?? row.server.name
            const repository = () => row.server.repository?.url ?? row.server.websiteUrl

            return (
              <ResultRow
                name={name()}
                detail={row.server.title ? row.server.name : undefined}
                description={row.server.description}
                lines={[from(row.server), where(row.plan)]}
                actions={
                  <>
                    <Show when={repository()}>
                      {(href) => (
                        <ExternalLink
                          class="text-13-regular"
                          href={href()}
                          aria-label={language.t("settings.extensions.add.source.label", { name: name() })}
                        >
                          {language.t("settings.extensions.add.source")}
                        </ExternalLink>
                      )}
                    </Show>
                    <Show
                      when={row.plan}
                      fallback={
                        <Button
                          size="small"
                          variant="ghost-muted"
                          aria-label={language.t("settings.extensions.add.askAi.label", { name: name() })}
                          onClick={() => props.onAskAi([row.server.name, repository()].filter(Boolean).join(" "))}
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
                  </>
                }
              />
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
