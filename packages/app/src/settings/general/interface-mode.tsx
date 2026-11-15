import { For, Match, Switch, createUniqueId } from "solid-js"
import { useClaimedControlLabel } from "@opencode/ui/control-label"
import { useLanguage } from "@/runtime/i18n/language"
import { type TabLayout, useSettings } from "@/settings/model"
import { SettingsRow } from "@/settings/row"
import "./interface-mode.css"

const modes = [
  { id: "top", layout: "horizontal" },
  { id: "side", layout: "vertical" },
  { id: "inbox", layout: "inbox" },
] as const satisfies { id: string; layout: TabLayout }[]

export function InterfaceModeSetting() {
  const language = useLanguage()
  const id = createUniqueId()

  return (
    <SettingsRow
      title={language.t("settings.general.row.interfaceMode.title")}
      description={language.t("settings.general.row.interfaceMode.description")}
      align="start"
    >
      <InterfaceModeOptions id={id} />
    </SettingsRow>
  )
}

function InterfaceModeOptions(props: { id: string }) {
  const language = useLanguage()
  const settings = useSettings()
  const id = props.id
  // Named by the row title and described by the row description, so VoiceOver reads the setting once, on the group.
  const row = useClaimedControlLabel(() => false)

  return (
    <fieldset
      data-component="interface-mode"
      data-action="settings-tab-layout"
      role="radiogroup"
      aria-labelledby={row.labelledBy}
      aria-describedby={row.describedBy}
    >
      <For each={modes}>
        {(mode) => (
          <label
            data-slot="interface-mode-option"
            data-checked={settings.appearance.tabLayout() === mode.layout ? "" : undefined}
          >
            <input
              type="radio"
              name={id}
              value={mode.id}
              checked={settings.appearance.tabLayout() === mode.layout}
              onChange={() => settings.appearance.setTabLayout(mode.layout)}
              // The visible name below is hidden from screen readers, so the radio is read once by this name.
              aria-label={language.t(`settings.general.row.interfaceMode.${mode.id}`)}
            />
            <span data-slot="interface-mode-sketch" data-mode={mode.id} aria-hidden="true">
              <Switch>
                <Match when={mode.id === "top"}>
                  <span data-slot="preview-strip">
                    <For each={[0, 1, 2]}>
                      {(index) => <span data-slot="preview-tab" data-active={index === 0 ? "" : undefined} />}
                    </For>
                  </span>
                </Match>
                <Match when={mode.id === "side"}>
                  <span data-slot="preview-rail">
                    <For each={[0, 1, 2, 3]}>
                      {(index) => <span data-slot="preview-tab" data-active={index === 0 ? "" : undefined} />}
                    </For>
                  </span>
                </Match>
                <Match when={mode.id === "inbox"}>
                  <span data-slot="preview-rail">
                    <For each={inboxRows}>
                      {(status, index) => (
                        <span data-slot="preview-tab" data-active={index() === 0 ? "" : undefined}>
                          <i data-status={status} />
                        </span>
                      )}
                    </For>
                  </span>
                </Match>
              </Switch>
              <span data-slot="preview-page">
                <span data-slot="preview-line" />
                <span data-slot="preview-line" />
                <span data-slot="preview-composer" />
              </span>
            </span>
            <span data-slot="interface-mode-name" aria-hidden="true">
              {language.t(`settings.general.row.interfaceMode.${mode.id}`)}
            </span>
          </label>
        )}
      </For>
    </fieldset>
  )
}

// Mirrors the inbox: a session that needs you, then finished work, then sessions still running.
const inboxRows = ["approval", "done", "working", "working"] as const
