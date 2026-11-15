import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { createExtensionLoad, ExtensionLoadFailed } from "@/settings/extension-load"
import { loadEcosystem, type EcosystemPlugin } from "./ecosystem"
import type { PluginTarget } from "./machine"

/** The community plugins from the OpenCode docs, filtered as the person types. */
export function PluginsTab(props: { onInstall: (plugin: PluginTarget) => void; onAskAi: (text: string) => void }) {
  const language = useLanguage()
  const [query, setQuery] = createSignal("")

  const catalog = createExtensionLoad({
    key: () => "ecosystem",
    task: () => loadEcosystem(),
  })

  const plugins = createMemo(() => {
    const current = catalog.view()

    return current.status === "ready" ? current.value : []
  })

  const results = createMemo(() => {
    const words = query().trim().toLowerCase().split(/\s+/).filter(Boolean)

    return plugins().filter((plugin) => {
      const text = `${plugin.name} ${plugin.description}`.toLowerCase()

      return words.every((word) => text.includes(word))
    })
  })

  const status = () => {
    const current = catalog.view().status

    if (current === "loading") return language.t("settings.extensions.add.plugins.loading")

    if (current !== "ready") return ""

    if (results().length === 0 && query().trim())
      return language.t("settings.extensions.add.plugins.empty", { query: query().trim() })

    return language.plural("settings.extensions.add.plugins.count", results().length)
  }

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
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </Field>
      {/* The count and the empty result are read as the person types. */}
      <p role="status" class="text-13-regular text-v2-text-text-muted">
        {status()}
      </p>
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
        data-scrollable
      >
        <For each={results()}>{(plugin) => <PluginRow plugin={plugin} {...props} />}</For>
      </ul>
    </div>
  )
}

function PluginRow(props: {
  plugin: EcosystemPlugin
  onInstall: (plugin: PluginTarget) => void
  onAskAi: (text: string) => void
}) {
  const language = useLanguage()

  return (
    <li class="flex items-start gap-3 border-b border-v2-border-border-weak py-3 last:border-b-0">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h3 class="text-13-medium text-v2-text-text-base [overflow-wrap:anywhere]">{props.plugin.name}</h3>
        <span class="text-13-regular text-v2-text-text-muted">{props.plugin.description}</span>
        <Show when={!props.plugin.pkg}>
          <span class="text-12-regular text-v2-text-text-muted">
            {language.t("settings.extensions.add.plugins.noPackage")}
          </span>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <ExternalLink
          class="text-13-regular"
          href={props.plugin.url}
          aria-label={language.t("settings.extensions.add.plugins.source.label", { name: props.plugin.name })}
        >
          {language.t("settings.extensions.add.plugins.source")}
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
      </div>
    </li>
  )
}
