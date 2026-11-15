import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { createExtensionLoad, ExtensionLoadFailed } from "@/settings/extension-load"
import type { PluginTarget } from "./machine"
import {
  filterPlugins,
  loadPluginCatalog,
  searchNpm,
  type CatalogPlugin,
  type PluginSource,
  withSearchResults,
} from "./plugin-catalog"
import { ResultRow } from "./result-row"

const DEBOUNCE_MS = 400

const NPM_RESULTS = 50

const FROM = {
  docs: "settings.extensions.from.docs",
  awesome: "settings.extensions.from.awesome",
  npm: "settings.extensions.from.npm",
} as const

const FAILED = {
  docs: "settings.extensions.add.plugins.failed.docs",
  awesome: "settings.extensions.add.plugins.failed.awesome",
  npm: "settings.extensions.add.plugins.failed.npm",
} as const

/**
 * Community plugins from the OpenCode docs, awesome-opencode and npm, one row per package, most downloaded first. A
 * search also asks npm, so packages beyond the first 250 still turn up.
 */
export function PluginsTab(props: { onInstall: (plugin: PluginTarget) => void; onAskAi: (text: string) => void }) {
  const language = useLanguage()
  const [query, setQuery] = createSignal("")
  const [committed, setCommitted] = createSignal("")
  const timers: { debounce?: ReturnType<typeof setTimeout> } = {}

  onCleanup(() => clearTimeout(timers.debounce))

  const catalog = createExtensionLoad({
    key: () => "plugins",
    task: () => loadPluginCatalog(),
  })

  const npm = createExtensionLoad({
    key: committed,
    task: (text, signal) => (text ? searchNpm(text, NPM_RESULTS, signal) : Promise.resolve([])),
  })

  const onInput = (value: string) => {
    setQuery(value)
    clearTimeout(timers.debounce)
    timers.debounce = setTimeout(() => setCommitted(value.trim()), DEBOUNCE_MS)
  }

  const ready = createMemo(() => {
    const current = catalog.view()

    return current.status === "ready" ? current.value : undefined
  })

  const results = createMemo(() => {
    const text = query().trim()
    const local = filterPlugins(ready()?.plugins ?? [], text)
    const found = npm.view()

    if (!text || found.status !== "ready") return local

    return withSearchResults(local, found.value)
  })

  const status = () => {
    const current = catalog.view().status

    if (current === "loading") return language.t("settings.extensions.add.plugins.loading")

    if (current !== "ready") return ""

    if (results().length === 0 && query().trim())
      return language.t("settings.extensions.add.plugins.empty", { query: query().trim() })

    return language.plural("settings.extensions.add.plugins.count", results().length)
  }

  const failed = () => ready()?.failed ?? []

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <Field>
        <Field.Label>{language.t("settings.extensions.add.plugins.search")}</Field.Label>
        <TextInput
          type="search"
          appearance="large"
          class="!w-full"
          placeholder={language.t("settings.extensions.add.plugins.search.placeholder")}
          value={query()}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => onInput(event.currentTarget.value)}
        />
      </Field>
      {/* The count and the empty result are read as the person types. */}
      <p role="status" class="text-13-regular text-v2-text-text-muted">
        {status()}
      </p>
      <Show when={failed().length > 0}>
        <ExtensionLoadFailed
          message={failed()
            .map((source: PluginSource) => language.t(FAILED[source]))
            .join(" ")}
          retry={language.t("common.retry")}
          onRetry={catalog.retry}
        />
      </Show>
      <Switch>
        <Match when={catalog.view().status === "error"}>
          <ExtensionLoadFailed
            message={language.t("settings.extensions.add.plugins.loadFailed")}
            retry={language.t("common.retry")}
            onRetry={catalog.retry}
          />
        </Match>
        <Match when={catalog.view().status === "ready" && results().length === 0 && query().trim()}>
          <div>
            <Button
              variant="neutral"
              aria-label={language.t("settings.extensions.add.askAi.label", { name: query().trim() })}
              onClick={() => props.onAskAi(query().trim())}
            >
              {language.t("settings.extensions.add.askAi")}
            </Button>
          </div>
        </Match>
      </Switch>
      <ul
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-label={language.t("settings.extensions.add.plugins.list")}
        aria-busy={catalog.view().status === "loading"}
        data-scrollable
      >
        <For each={results()}>{(plugin) => <PluginRow plugin={plugin} {...props} />}</For>
      </ul>
    </div>
  )
}

function PluginRow(props: {
  plugin: CatalogPlugin
  onInstall: (plugin: PluginTarget) => void
  onAskAi: (text: string) => void
}) {
  const language = useLanguage()
  const source = () => props.plugin.sources[0] ?? "npm"

  return (
    <ResultRow
      name={props.plugin.name}
      detail={
        props.plugin.pkg && props.plugin.pkg !== props.plugin.name
          ? language.t("settings.extensions.add.confirm.package", { pkg: props.plugin.pkg })
          : undefined
      }
      description={props.plugin.description}
      lines={[
        language.t(FROM[source()]),
        props.plugin.downloads !== undefined
          ? language.plural("settings.extensions.add.plugins.downloads", props.plugin.downloads)
          : undefined,
        props.plugin.pkg ? undefined : language.t("settings.extensions.add.plugins.noPackage"),
      ]}
      actions={
        <>
          <ExternalLink
            class="text-13-regular"
            href={props.plugin.url}
            aria-label={language.t("settings.extensions.add.source.label", { name: props.plugin.name })}
          >
            {language.t("settings.extensions.add.source")}
          </ExternalLink>
          <Show
            when={props.plugin.pkg}
            fallback={
              <Button
                size="small"
                variant="ghost-muted"
                aria-label={language.t("settings.extensions.add.askAi.label", { name: props.plugin.name })}
                onClick={() => props.onAskAi(`${props.plugin.name} ${props.plugin.url}`)}
              >
                {language.t("settings.extensions.add.askAi")}
              </Button>
            }
          >
            {(pkg) => (
              <Button
                size="small"
                variant="neutral"
                aria-label={language.t("settings.extensions.add.plugins.install.label", { name: props.plugin.name })}
                onClick={() => props.onInstall({ name: props.plugin.name, pkg: pkg(), url: props.plugin.url })}
              >
                {language.t("settings.extensions.add.plugins.install")}
              </Button>
            )}
          </Show>
        </>
      }
    />
  )
}
