import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useServerSDK } from "@/runtime/server/client"
import { createExtensionLoad, ExtensionLoadFailed } from "@/settings/extension-load"
import { createSearchState, transitionSearch, type SaveRequest, type SearchEffect, type SearchEvent } from "./machine"
import {
  buildPlan,
  GITHUB_SERVER,
  githubPlan,
  needsSetup,
  signInPlan,
  planServer,
  serverSlug,
  serverTitle,
  type McpPlan,
  type RegistryServer,
} from "./mcp-plan"
import { ResultRow } from "./result-row"
import { SaveError } from "./save-error"

const DEBOUNCE_MS = 400

/** The groups the server puts popular and Docker servers in, in the order they are shown. */
const CATEGORIES = [
  "featured",
  "productivity",
  "design",
  "developer",
  "search",
  "automation",
  "business",
  "data",
  "media",
  "files",
  "other",
] as const

type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS = {
  featured: "settings.extensions.add.category.featured",
  productivity: "settings.extensions.add.category.productivity",
  design: "settings.extensions.add.category.design",
  developer: "settings.extensions.add.category.developer",
  search: "settings.extensions.add.category.search",
  automation: "settings.extensions.add.category.automation",
  business: "settings.extensions.add.category.business",
  data: "settings.extensions.add.category.data",
  media: "settings.extensions.add.category.media",
  files: "settings.extensions.add.category.files",
  other: "settings.extensions.add.category.other",
} as const

/** The helper program each kind of local server runs with, and the tools result that says it is installed. */
const HELPERS = { npx: "node", uvx: "uv", docker: "docker" } as const

type Source = "registry" | "docker"

/**
 * MCP servers from the MCP Registry, Popular until the person searches, or from the Docker MCP Catalog. The server
 * fetches both, because neither allows browser requests. A remote server with nothing to fill in is added in one
 * press; anything that runs on the Mac or needs a key opens the setup step first.
 */
export function RegistryTab(props: {
  existing: string[]
  /** The save in progress, to show Adding on its row. */
  saving?: SaveRequest
  error?: string
  onSetup: (server: RegistryServer, plan: McpPlan) => void
  onAdd: (request: SaveRequest) => void
  onAskAi: (text: string) => void
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [input, setInput] = createSignal("")
  const [source, setSource] = createSignal<Source>("registry")
  const [search, setSearch] = createSignal(createSearchState())
  // The row whose sign-in check runs before a one-press add.
  const [checking, setChecking] = createSignal<string>()
  const timers: { debounce?: ReturnType<typeof setTimeout> } = {}
  const live = { disposed: false, list: undefined as HTMLDivElement | undefined, reveal: -1 }
  // Each listed server's category, from the page that listed it.
  const [categories, setCategories] = createSignal<Record<string, string>>({})

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
        if (untrack(search).attempt === effect.attempt) setCategories(result.categories ?? {})
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

  // Popular and Docker servers are grouped by category, each group a heading; a search is one list of results.
  const groups = createMemo(() => {
    if (mode() === "search")
      return [{ key: "results", label: language.t("settings.extensions.add.registry.results.heading"), rows: rows() }]
    const found = categories()
    const category = (name: string): Category => CATEGORIES.find((item) => item === found[name]) ?? "other"

    return CATEGORIES.map((key) => ({
      key,
      label: language.t(CATEGORY_LABELS[key]),
      rows: rows().filter((row) => category(row.server.name) === key),
    })).filter((group) => group.rows.length > 0)
  })

  // Node.js, uv and Docker, which servers that run on the Mac need.
  const tools = createExtensionLoad({
    key: () => "tools",
    task: (_, signal) => serverSdk.api.experimental.config.tools({ signal }),
  })

  /** The helper a local server needs, and whether it is installed; undefined until known or for a remote. */
  const helper = (plan: McpPlan | undefined) => {
    const found = tools.view()

    if (plan?.type !== "local" || found.status !== "ready") return
    const name = HELPERS[plan.runtime]

    return { name, installed: found.value[name] }
  }

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

  // A remote that needs nothing may still ask for a sign-in once added; checking first lets the announcement say so.
  /**
   * Adds in one press when nothing needs filling in, or when the server signs in with the browser instead of asking
   * for its keys; otherwise opens the setup step. A remote is checked first, so a server that asks for a sign-in once
   * added is announced that way.
   */
  const press = (server: RegistryServer, plan: McpPlan) => {
    const name = serverSlug(server.name)

    if (checking() || props.saving) return

    if (props.existing.includes(name)) return props.onSetup(server, plan)
    const browser = server.name === GITHUB_SERVER ? githubPlan(server) : signInPlan(server)
    const candidate = oneStep(plan) ? plan : plan.inputs.some((input) => input.secret) ? browser : undefined

    if (!candidate) return props.onSetup(server, plan)
    setChecking(name)
    void (
      candidate.type === "remote"
        ? serverSdk.api.experimental.config.mcpSignIn({ url: candidate.url })
        : Promise.resolve({ supported: false })
    )
      .then(
        (result) => result.supported,
        () => false,
      )
      .then((signIn) => {
        if (live.disposed) return
        setChecking(undefined)

        // A server that needs its keys after all gets the setup step, which asks for them.
        if (candidate !== plan && !signIn) return props.onSetup(server, plan)
        props.onAdd({
          type: "mcp",
          label: serverTitle(server),
          name,
          config: buildPlan(candidate, name, {}).config,
          keychain: {},
          signIn,
        })
      })
  }

  const adding = (server: RegistryServer) => {
    const name = serverSlug(server.name)
    const saving = props.saving

    return checking() === name || (saving?.type === "mcp" && saving.name === name)
  }

  const where = (plan: McpPlan | undefined) => {
    if (!plan) return language.t("settings.extensions.add.registry.manual")

    if (plan.type === "remote") return language.t("settings.extensions.runs.remote")

    return language.t(plan.runtime === "docker" ? "settings.extensions.runs.docker" : "settings.extensions.runs.local")
  }

  // Which helper a local server uses, or that it is missing, so nobody adds one that cannot start.
  const uses = (plan: McpPlan | undefined) => {
    const found = helper(plan)

    if (!found) return
    if (!found.installed) return language.t(`settings.extensions.add.needs.${found.name}`)
    if (found.name === "docker") return

    return language.t(`settings.extensions.add.uses.${found.name}`)
  }

  // A press adds at once when nothing needs filling in and, for a local server, its helper is installed.
  const oneStep = (plan: McpPlan) => {
    if (needsSetup(plan)) return false
    if (plan.type === "remote") return true

    return helper(plan)?.installed === true
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <p class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.add.registry.note")}</p>
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
      <SaveError error={props.error} />
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
      <div
        ref={(element) => (live.list = element)}
        class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        aria-busy={search().status === "loading"}
        data-scrollable
      >
        <For each={groups()}>
          {(group) => (
            <section class="flex flex-col" aria-labelledby={`mcp-group-${group.key}`}>
              <h2 id={`mcp-group-${group.key}`} class="text-13-medium text-v2-text-text-base">
                {group.label}
              </h2>
              <ul class="flex flex-col" aria-labelledby={`mcp-group-${group.key}`}>
                <For each={group.rows}>
                  {(row) => {
                    const name = () => serverTitle(row.server)
                    const repository = () => row.server.websiteUrl ?? row.server.repository?.url
                    const added = () => props.existing.includes(serverSlug(row.server.name))

                    return (
                      <ResultRow
                        name={name()}
                        description={row.server.description}
                        lines={[
                          where(row.plan),
                          uses(row.plan),
                          added() ? language.t("settings.extensions.add.registry.added") : undefined,
                        ]}
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
                                  onClick={() =>
                                    props.onAskAi([row.server.name, repository()].filter(Boolean).join(" "))
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
                                  aria-busy={adding(row.server)}
                                  aria-label={
                                    adding(row.server)
                                      ? undefined
                                      : language.t("settings.extensions.add.registry.setup.label", { name: name() })
                                  }
                                  onClick={() => press(row.server, plan())}
                                >
                                  {adding(row.server)
                                    ? language.t("settings.extensions.add.adding")
                                    : language.t("settings.extensions.add.registry.setup")}
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
            </section>
          )}
        </For>
      </div>
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
