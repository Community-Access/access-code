import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { ExtensionCatalog } from "@opencode/schema/extension-catalog"
import { Schema } from "effect"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useServerSDK } from "@/runtime/server/client"
import { createExtensionLoad, ExtensionLoadFailed } from "@/settings/extension-load"
import type { SkillTarget } from "./machine"
import { ResultRow } from "./result-row"

const DEBOUNCE_MS = 400

const SKILLS_SITE = "https://skills.sh"

const validSource = Schema.is(ExtensionCatalog.SkillSource)

const validSkill = Schema.is(ExtensionCatalog.SkillName)

/** Skills from skills.sh, through the server: popular ones until the person searches. */
export function SkillsTab(props: { onInstall: (skill: SkillTarget) => void; onAskAi: (text: string) => void }) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [query, setQuery] = createSignal("")
  const [committed, setCommitted] = createSignal("")
  const timers: { debounce?: ReturnType<typeof setTimeout> } = {}

  onCleanup(() => clearTimeout(timers.debounce))

  const skills = createExtensionLoad({
    key: committed,
    task: (search, signal) =>
      serverSdk.api.experimental.config
        .skillSearch({ search: search || undefined }, { signal })
        .then((result) => ({ search, skills: result.skills })),
  })

  const onInput = (value: string) => {
    setQuery(value)
    clearTimeout(timers.debounce)
    timers.debounce = setTimeout(() => setCommitted(value.trim()), DEBOUNCE_MS)
  }

  // The result names its search, so a slow answer for an older search never shows under a newer one.
  const ready = createMemo(() => {
    const current = skills.view()

    return current.status === "ready" && current.value.search === committed() ? current.value : undefined
  })

  const status = () => {
    const current = ready()

    if (!current) {
      if (skills.view().status === "error") return ""

      return language.t(
        committed() ? "settings.extensions.add.skills.searching" : "settings.extensions.add.skills.loading",
      )
    }

    if (current.skills.length === 0)
      return current.search
        ? language.t("settings.extensions.add.skills.empty", { query: current.search })
        : language.t("settings.extensions.add.skills.emptyAll")

    return language.plural(
      current.search ? "settings.extensions.add.skills.count" : "settings.extensions.add.skills.popular.count",
      current.skills.length,
    )
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <Field>
        <Field.Label>{language.t("settings.extensions.add.skills.search")}</Field.Label>
        <TextInput
          type="search"
          appearance="large"
          class="!w-full"
          placeholder={language.t("settings.extensions.add.skills.search.placeholder")}
          value={query()}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => onInput(event.currentTarget.value)}
        />
      </Field>
      <p class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.add.skills.note")}</p>
      <p role="status" class="text-13-regular text-v2-text-text-muted">
        {status()}
      </p>
      <Switch>
        <Match when={skills.view().status === "error"}>
          <ExtensionLoadFailed
            message={language.t("settings.extensions.add.skills.loadFailed")}
            retry={language.t("common.retry")}
            onRetry={skills.retry}
          />
        </Match>
        <Match when={ready()?.search && ready()?.skills.length === 0}>
          <div>
            <Button
              variant="neutral"
              aria-label={language.t("settings.extensions.add.askAi.label", { name: committed() })}
              onClick={() => props.onAskAi(`skill ${committed()}`)}
            >
              {language.t("settings.extensions.add.askAi")}
            </Button>
          </div>
        </Match>
      </Switch>
      <ul
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-label={language.t(
          committed() ? "settings.extensions.add.skills.list" : "settings.extensions.add.skills.popular.list",
        )}
        aria-busy={!ready() && skills.view().status !== "error"}
        data-scrollable
      >
        <For each={ready()?.skills ?? []}>
          {(skill) => (
            <ResultRow
              name={skill.name}
              lines={[language.plural("settings.extensions.add.skills.installs", skill.installs)]}
              actions={
                <>
                  <ExternalLink
                    class="text-13-regular"
                    href={`${SKILLS_SITE}/${skill.id}`}
                    aria-label={language.t("settings.extensions.add.skills.page.label", { name: skill.name })}
                  >
                    {language.t("settings.extensions.add.skills.page")}
                  </ExternalLink>
                  <Show
                    when={validSource(skill.source) && validSkill(skill.skillId)}
                    fallback={
                      <Button
                        size="small"
                        variant="ghost-muted"
                        aria-label={language.t("settings.extensions.add.askAi.label", { name: skill.name })}
                        onClick={() => props.onAskAi(`skill ${SKILLS_SITE}/${skill.id}`)}
                      >
                        {language.t("settings.extensions.add.askAi")}
                      </Button>
                    }
                  >
                    <Button
                      size="small"
                      variant="neutral"
                      aria-label={language.t("settings.extensions.add.plugins.install.label", { name: skill.name })}
                      onClick={() =>
                        props.onInstall({
                          name: skill.name,
                          source: skill.source,
                          skill: skill.skillId,
                          url: `${SKILLS_SITE}/${skill.id}`,
                        })
                      }
                    >
                      {language.t("settings.extensions.add.plugins.install")}
                    </Button>
                  </Show>
                </>
              }
            />
          )}
        </For>
      </ul>
    </div>
  )
}
