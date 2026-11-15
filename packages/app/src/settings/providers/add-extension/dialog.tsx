import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Tabs } from "@opencode/ui/tabs"
import { createMemo, createSignal, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { formatServerError } from "@/runtime/server/errors"
import { ServerConnection } from "@/runtime/server/registry"
import { announce } from "@/session/announce"
import { useTabs } from "@/shell/tabs/tabs"
import { ExternalLink } from "@/runtime/platform/external-link"
import { createExtensionLoad } from "@/settings/extension-load"
import { ConfirmStep } from "./confirm-step"
import { CustomTab } from "./custom-tab"
import {
  createAddState,
  saveView,
  transitionAdd,
  type AddEffect,
  type AddEvent,
  type ConfirmTarget,
  type SaveRequest,
} from "./machine"
import { PluginsTab } from "./plugins-tab"
import { RegistryTab } from "./registry-tab"
import { SetupStep } from "./setup-step"
import { serverTitle } from "./mcp-plan"
import { SkillsTab } from "./skills-tab"

export type AddTab = "registry" | "plugins" | "skills" | "custom"

const TABS: AddTab[] = ["registry", "plugins", "skills", "custom"]

/**
 * Adds a community plugin, an MCP server or a hand-entered one to the global config, or installs a skill into the
 * global OpenCode skills folder. The tabs stay mounted behind the confirm and setup steps, so going back keeps the
 * search and returns focus to the row's button. A remote MCP server that needs nothing is added in one press.
 */
export function DialogAddExtension(props: {
  directory?: string
  existing: string[]
  /** The tab to open on, matching the Extensions page tab it was opened from. */
  tab?: AddTab
  /** Runs after a save succeeds, before the dialog closes, so the page can follow up, such as offering sign-in. */
  onAdded?: (request: SaveRequest) => void
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  const tabs = useTabs()
  const [state, setState] = createSignal(createAddState())
  const [tab, setTab] = createSignal<AddTab>(props.tab ?? "registry")
  // Which tab asked for a save from the browse step, so only that tab shows its error.
  const [origin, setOrigin] = createSignal<"registry" | "custom">("registry")
  const focus: { origin?: HTMLElement; heading?: HTMLHeadingElement; browse?: HTMLDivElement } = {}
  const live = { disposed: false }

  onCleanup(() => (live.disposed = true))

  const dispatch = (event: AddEvent) => {
    const previous = untrack(state)
    const result = transitionAdd(previous, event)

    if (result.state !== previous) setState(result.state)
    result.effects.forEach(run)
  }

  const run = (effect: AddEffect) => {
    if (effect.type === "save") return save(effect.attempt, effect.request)

    if (effect.type === "saved") {
      announce(addedMessage(effect.request))
      props.onAdded?.(effect.request)
      // The dialog layer returns focus to the Add button that opened it.
      dialog.close()

      return
    }

    if (effect.type === "failed") return announce(effect.error, "assertive")

    requestAnimationFrame(() => {
      if (effect.step !== "browse") return focus.heading?.focus()

      if (focus.origin?.isConnected) return focus.origin.focus()
      focus.browse?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    })
  }

  const save = (attempt: number, request: SaveRequest) => {
    const fail = (reason: string) => {
      if (live.disposed) return
      dispatch({
        type: "save.failed",
        attempt,
        error: language.t("settings.extensions.add.failed", { name: request.label, error: reason }),
      })
    }

    const succeed = () => {
      if (!live.disposed) return dispatch({ type: "save.succeeded", attempt })
      // The dialog closed while saving, but the server still added it, so say so.
      announce(addedMessage(request))
      props.onAdded?.(request)
    }

    const unknown = (error: unknown) =>
      fail(formatServerError(error, language.t, language.t("settings.extensions.add.failedUnknown")))

    if (request.type === "skill") {
      void serverSdk.api.experimental.config
        .skillInstall({ source: request.source, skill: request.skill })
        .then((result) => {
          if (!result.ok) return fail(result.output || language.t("settings.extensions.add.failedUnknown"))
          // The skills folder is watched, so the list updates by itself; reading it again covers a missed event.
          data.location.skill.invalidate()
          void data.location.skill.sync().catch(() => undefined)
          succeed()
        }, unknown)

      return
    }

    const update =
      request.type === "plugin"
        ? { plugins: { add: [request.pkg] } }
        : {
            mcp: { [request.name]: request.config },
            ...(Object.keys(request.keychain).length > 0 ? { keychain: request.keychain } : {}),
          }

    void serverSdk.api.experimental.config.update(update).then(succeed, unknown)
  }

  const addedMessage = (request: SaveRequest) => {
    if (request.type === "mcp" && request.signIn)
      return language.t("settings.extensions.add.added.signIn", { name: request.label })

    return language.t("settings.extensions.add.added", { name: request.label })
  }

  // Remembers the button that opened a step, so Back returns to it.
  const remember = () => {
    const active = document.activeElement
    focus.origin = active instanceof HTMLElement ? active : undefined
  }

  const askAi = (text: string) => {
    dialog.close()
    void tabs.newDraft(
      {
        server: ServerConnection.key(serverSdk.server),
        directory: props.directory ?? data.location.default().directory,
      },
      `/add ${text}`,
    )
  }

  const step = () => state().step
  const view = () => saveView(step())

  const confirmStep = createMemo(() => {
    const current = step()

    return current.type === "confirm" ? current : undefined
  })

  const setupStep = createMemo(() => {
    const current = step()

    return current.type === "setup" ? current : undefined
  })

  const heading = () => {
    const confirm = confirmStep()

    if (confirm) return language.t("settings.extensions.add.confirm.title", { name: confirm.target.name })
    const setup = setupStep()

    if (!setup) return ""

    return language.t("settings.extensions.add.setup.title", { name: serverTitle(setup.server) })
  }

  const onStepKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopPropagation()
    dispatch({ type: "back" })
  }

  return (
    <Dialog size="large" label={language.t("settings.extensions.add.title")}>
      <Show when={step().type !== "browse"}>
        <div class="contents" data-owns-escape onKeyDown={onStepKeyDown}>
          <DialogHeader>
            <div class="flex min-w-0 items-center gap-2">
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"
                disabled={view().busy}
                aria-label={language.t("settings.extensions.add.back")}
                onClick={() => dispatch({ type: "back" })}
              >
                <Icon name="arrow-left" size="small" />
              </button>
              <h2
                ref={(element) => (focus.heading = element)}
                tabindex="-1"
                class="min-w-0 text-14-medium text-v2-text-text-base [overflow-wrap:anywhere] focus:outline-none"
              >
                {heading()}
              </h2>
            </div>
          </DialogHeader>
          <DialogBody class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5" data-scrollable>
            <Switch>
              <Match when={confirmStep()}>
                {(current) => (
                  <ConfirmInstall
                    target={current().target}
                    busy={view().busy}
                    error={view().error}
                    onBack={() => dispatch({ type: "back" })}
                    onConfirm={(request) => dispatch({ type: "save.requested", request })}
                  />
                )}
              </Match>
              <Match when={setupStep()}>
                {(current) => (
                  <SetupStep
                    server={current().server}
                    plan={current().plan}
                    existing={props.existing}
                    busy={view().busy}
                    error={view().error}
                    onCancel={() => dispatch({ type: "back" })}
                    onSubmit={(request) => dispatch({ type: "save.requested", request })}
                  />
                )}
              </Match>
            </Switch>
          </DialogBody>
        </div>
      </Show>
      <div
        ref={(element) => (focus.browse = element)}
        class="flex min-h-0 flex-1 flex-col"
        style={{ display: step().type === "browse" ? undefined : "none" }}
      >
        <DialogHeader>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-14-medium text-v2-text-text-base">{language.t("settings.extensions.add.title")}</h2>
            <p class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.add.description")}</p>
          </div>
        </DialogHeader>
        <DialogBody class="flex min-h-0 flex-1 flex-col px-5 pb-5">
          <Tabs
            variant="pill"
            value={tab()}
            onChange={(value) => {
              const found = TABS.find((item) => item === value)
              if (found) setTab(found)
            }}
            class="flex min-h-0 flex-1 flex-col gap-3"
          >
            <Tabs.List aria-label={language.t("settings.extensions.add.tabs")}>
              <Tabs.Trigger value="registry">{language.t("settings.extensions.add.tab.registry")}</Tabs.Trigger>
              <Tabs.Trigger value="plugins">{language.t("settings.extensions.add.tab.plugins")}</Tabs.Trigger>
              <Tabs.Trigger value="skills">{language.t("settings.extensions.add.tab.skills")}</Tabs.Trigger>
              <Tabs.Trigger value="custom">{language.t("settings.extensions.add.tab.custom")}</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="registry" class="flex min-h-0 flex-1 flex-col">
              <RegistryTab
                existing={props.existing}
                saving={step().type === "browse" ? view().saving : undefined}
                error={step().type === "browse" && origin() === "registry" ? view().error : undefined}
                onSetup={(server, plan) => {
                  remember()
                  dispatch({ type: "server.chosen", server, plan })
                }}
                onAdd={(request) => {
                  setOrigin("registry")
                  dispatch({ type: "save.requested", request })
                }}
                onAskAi={askAi}
              />
            </Tabs.Content>
            <Tabs.Content value="plugins" class="flex min-h-0 flex-1 flex-col">
              <PluginsTab
                onInstall={(plugin) => {
                  remember()
                  dispatch({ type: "plugin.chosen", plugin })
                }}
                onAskAi={askAi}
              />
            </Tabs.Content>
            <Tabs.Content value="skills" class="flex min-h-0 flex-1 flex-col">
              <SkillsTab
                onInstall={(skill) => {
                  remember()
                  dispatch({ type: "skill.chosen", skill })
                }}
                onAskAi={askAi}
              />
            </Tabs.Content>
            <Tabs.Content value="custom" class="flex min-h-0 flex-1 flex-col">
              <CustomTab
                existing={props.existing}
                busy={step().type === "browse" && view().busy}
                error={step().type === "browse" && origin() === "custom" ? view().error : undefined}
                onPlugin={(plugin) => {
                  remember()
                  dispatch({ type: "plugin.chosen", plugin })
                }}
                onSubmit={(request) => {
                  setOrigin("custom")
                  dispatch({ type: "save.requested", request })
                }}
              />
            </Tabs.Content>
          </Tabs>
        </DialogBody>
      </div>
    </Dialog>
  )
}

/** Confirms installing a plugin or a skill, naming where it comes from, in the layout Remove uses too. */
function ConfirmInstall(props: {
  target: ConfirmTarget
  busy: boolean
  error?: string
  onBack: () => void
  onConfirm: (request: SaveRequest) => void
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()

  // The skills CLI runs with npx, so a Mac without Node.js is told before the install fails.
  const tools = createExtensionLoad({
    key: () => props.target.type,
    task: (type, signal) =>
      type === "skill" ? serverSdk.api.experimental.config.tools({ signal }) : Promise.resolve(undefined),
  })

  const missingNode = () => {
    const current = tools.view()

    return current.status === "ready" && current.value?.node === false
  }

  const body = () => {
    const target = props.target

    if (target.type === "skill")
      return language.t("settings.extensions.add.confirm.skill", { name: target.name, source: target.source })

    if (target.url) return language.t("settings.extensions.add.confirm.body", { name: target.name, url: target.url })

    return language.t("settings.extensions.add.confirm.bodyNpm", { name: target.name })
  }

  const request = (): SaveRequest => {
    const target = props.target

    if (target.type === "skill")
      return { type: "skill", label: target.name, source: target.source, skill: target.skill }

    return { type: "plugin", label: target.name, pkg: target.pkg }
  }

  return (
    <ConfirmStep
      body={body()}
      details={
        <Switch>
          <Match when={props.target.type === "plugin" && props.target}>
            {(target) => (
              <>
                <span>{language.t("settings.extensions.add.confirm.package", { pkg: target().pkg })}</span>
                <Show when={target().url}>
                  {(url) => (
                    <ExternalLink
                      class="text-13-regular"
                      href={url()}
                      aria-label={language.t("settings.extensions.add.source.label", { name: target().name })}
                    >
                      {url()}
                    </ExternalLink>
                  )}
                </Show>
              </>
            )}
          </Match>
          <Match when={props.target.type === "skill" && props.target}>
            {(target) => (
              <>
                <Show when={missingNode()}>
                  <p class="text-13-regular text-v2-text-text-base">
                    {language.t("settings.extensions.add.need.skills")}
                  </p>
                </Show>
                <ExternalLink
                  class="text-13-regular"
                  href={target().url}
                  aria-label={language.t("settings.extensions.add.skills.page.label", { name: target().name })}
                >
                  {target().url}
                </ExternalLink>
                <ExternalLink
                  class="text-13-regular"
                  href={`https://github.com/${target().source}`}
                  aria-label={language.t("settings.extensions.add.skills.github.label", { name: target().name })}
                >
                  {`https://github.com/${target().source}`}
                </ExternalLink>
              </>
            )}
          </Match>
        </Switch>
      }
      error={props.error}
      busy={props.busy}
      action={language.t("settings.extensions.add.plugins.install")}
      busyAction={language.t("settings.extensions.add.installing")}
      actionLabel={language.t("settings.extensions.add.plugins.install.label", { name: props.target.name })}
      onCancel={props.onBack}
      onConfirm={() => props.onConfirm(request())}
    />
  )
}
