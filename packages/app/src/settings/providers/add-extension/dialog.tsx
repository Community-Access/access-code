import { Button } from "@opencode/ui/button"
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
import { CustomTab } from "./custom-tab"
import { createAddState, saveView, transitionAdd, type AddEffect, type AddEvent, type SaveRequest } from "./machine"
import { PluginsTab } from "./plugins-tab"
import { RegistryTab } from "./registry-tab"
import { SaveError } from "./save-error"
import { SetupStep } from "./setup-step"

type Tab = "plugins" | "registry" | "custom"

/**
 * Adds a community plugin, an MCP Registry server or a hand-entered one to the global opencode.json. The tabs stay
 * mounted behind the confirm and setup steps, so going back keeps the search and returns focus to the row's button.
 */
export function DialogAddExtension(props: { directory?: string; existing: string[] }) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  const tabs = useTabs()
  const [state, setState] = createSignal(createAddState())
  const [tab, setTab] = createSignal<Tab>("plugins")
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
      announce(language.t("settings.extensions.add.added", { name: effect.label }))
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
    const update =
      request.type === "plugin"
        ? { plugins: { add: [request.pkg] } }
        : {
            mcp: { [request.name]: request.config },
            ...(Object.keys(request.keychain).length > 0 ? { keychain: request.keychain } : {}),
          }

    void serverSdk.api.experimental.config.update(update).then(
      () => {
        if (!live.disposed) return dispatch({ type: "save.succeeded", attempt })
        // The dialog closed while saving, but the server still added it, so say so.
        announce(language.t("settings.extensions.add.added", { name: request.label }))
      },
      (error: unknown) => {
        if (live.disposed) return
        const reason = formatServerError(error, language.t, language.t("settings.extensions.add.failedUnknown"))
        dispatch({
          type: "save.failed",
          attempt,
          error: language.t("settings.extensions.add.failed", { name: request.label, error: reason }),
        })
      },
    )
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

    if (confirm) return language.t("settings.extensions.add.confirm.title", { name: confirm.plugin.name })
    const setup = setupStep()

    if (!setup) return ""

    return language.t("settings.extensions.add.setup.title", { name: setup.server.title ?? setup.server.name })
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
                  <div class="flex flex-col gap-4">
                    <p class="text-13-regular text-v2-text-text-base">
                      {current().plugin.url
                        ? language.t("settings.extensions.add.confirm.body", {
                            name: current().plugin.name,
                            url: current().plugin.url ?? "",
                          })
                        : language.t("settings.extensions.add.confirm.bodyNpm", { name: current().plugin.name })}
                    </p>
                    <p class="text-13-regular text-v2-text-text-muted">
                      {language.t("settings.extensions.add.confirm.package", { pkg: current().plugin.pkg })}
                    </p>
                    <SaveError error={view().error} />
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" disabled={view().busy} onClick={() => dispatch({ type: "back" })}>
                        {language.t("settings.extensions.add.cancel")}
                      </Button>
                      <Button
                        variant="submit"
                        disabled={view().busy}
                        aria-busy={view().busy}
                        onClick={() =>
                          dispatch({
                            type: "save.requested",
                            request: { type: "plugin", label: current().plugin.name, pkg: current().plugin.pkg },
                          })
                        }
                      >
                        {language.t(
                          view().busy
                            ? "settings.extensions.add.installing"
                            : "settings.extensions.add.plugins.install",
                        )}
                      </Button>
                    </div>
                  </div>
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
              if (value === "plugins" || value === "registry" || value === "custom") setTab(value)
            }}
            class="flex min-h-0 flex-1 flex-col gap-3"
          >
            <Tabs.List aria-label={language.t("settings.extensions.add.tabs")}>
              <Tabs.Trigger value="plugins">{language.t("settings.extensions.add.tab.plugins")}</Tabs.Trigger>
              <Tabs.Trigger value="registry">{language.t("settings.extensions.add.tab.registry")}</Tabs.Trigger>
              <Tabs.Trigger value="custom">{language.t("settings.extensions.add.tab.custom")}</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="plugins" class="flex min-h-0 flex-1 flex-col">
              <PluginsTab
                onInstall={(plugin) => {
                  remember()
                  dispatch({ type: "plugin.chosen", plugin })
                }}
                onAskAi={askAi}
              />
            </Tabs.Content>
            <Tabs.Content value="registry" class="flex min-h-0 flex-1 flex-col">
              <RegistryTab
                onSetup={(server, plan) => {
                  remember()
                  dispatch({ type: "server.chosen", server, plan })
                }}
                onAskAi={askAi}
              />
            </Tabs.Content>
            <Tabs.Content value="custom" class="flex min-h-0 flex-1 flex-col">
              <CustomTab
                existing={props.existing}
                busy={step().type === "browse" && view().busy}
                error={step().type === "browse" ? view().error : undefined}
                onPlugin={(plugin) => {
                  remember()
                  dispatch({ type: "plugin.chosen", plugin })
                }}
                onSubmit={(request) => dispatch({ type: "save.requested", request })}
              />
            </Tabs.Content>
          </Tabs>
        </DialogBody>
      </div>
    </Dialog>
  )
}
