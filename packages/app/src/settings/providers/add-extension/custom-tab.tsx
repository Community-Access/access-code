import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Field } from "@opencode/ui/field"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextInput } from "@opencode/ui/text-input"
import { createStore } from "solid-js/store"
import { Index, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { validPluginSpec } from "./ecosystem"
import type { PluginTarget, SaveRequest } from "./machine"
import { buildCustomMcp, customMcpIssue, type CustomMcp } from "./mcp-plan"
import { SaveError } from "./save-error"

const ISSUES = {
  name: "settings.extensions.add.setup.name.invalid",
  command: "settings.extensions.add.custom.command.invalid",
  url: "settings.extensions.add.custom.url.invalid",
  row: "settings.extensions.add.custom.row.invalid",
  plugin: "settings.extensions.add.custom.plugin.invalid",
} as const

type Issue = keyof typeof ISSUES

/** A plugin by npm name, or an MCP server typed in by hand, with its keys kept in the Keychain. */
export function CustomTab(props: {
  existing: string[]
  busy: boolean
  error?: string
  onPlugin: (plugin: PluginTarget) => void
  onSubmit: (request: SaveRequest) => void
}) {
  const language = useLanguage()

  const [form, setForm] = createStore({
    kind: "plugin" as "plugin" | "mcp",
    pkg: "",
    mcp: { name: "", kind: "local", command: "", url: "", rows: [] } as CustomMcp,
    issue: undefined as Issue | undefined,
  })

  const fields = new Map<string, HTMLElement>()
  const rowInputs: HTMLInputElement[] = []
  const refs: { add?: HTMLButtonElement } = {}

  const rowKey = () => (form.mcp.kind === "local" ? "env" : "headers")

  const fail = (issue: Issue) => {
    setForm("issue", issue)
    announce(language.t(ISSUES[issue]), "assertive")
    const row = issue === "row" ? form.mcp.rows.findIndex((item) => !item.name.trim() && item.value.trim()) : -1
    const target = row === -1 ? fields.get(issue) : rowInputs[row]
    target?.focus()
  }

  const submitPlugin = () => {
    const pkg = form.pkg.trim()

    if (!validPluginSpec(pkg)) return fail("plugin")
    setForm("issue", undefined)
    props.onPlugin({ name: pkg, pkg })
  }

  const submitMcp = () => {
    const issue = customMcpIssue(form.mcp)

    if (issue) return fail(issue)
    setForm("issue", undefined)
    const built = buildCustomMcp(form.mcp)
    props.onSubmit({ type: "mcp", label: built.name, name: built.name, config: built.config, keychain: built.keychain })
  }

  const addRow = () => {
    const index = form.mcp.rows.length
    setForm("mcp", "rows", index, { name: "", value: "", secret: false })
    requestAnimationFrame(() => rowInputs[index]?.focus())
  }

  const removeRow = (index: number) => {
    setForm("mcp", "rows", (rows) => rows.filter((_, position) => position !== index))
    requestAnimationFrame(() => (rowInputs[index]?.isConnected ? rowInputs[index] : refs.add)?.focus())
  }

  const issueText = (issue: Issue) => (form.issue === issue ? language.t(ISSUES[issue]) : undefined)

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" data-scrollable>
      <RadioGroup
        label={language.t("settings.extensions.add.custom.kind")}
        value={form.kind}
        onChange={(value) => {
          if (value === "plugin" || value === "mcp") setForm({ kind: value, issue: undefined })
        }}
      >
        <RadioItem value="plugin" label={language.t("settings.extensions.add.custom.kind.plugin")} />
        <RadioItem value="mcp" label={language.t("settings.extensions.add.custom.kind.mcp")} />
      </RadioGroup>
      <Switch>
        <Match when={form.kind === "plugin"}>
          <form
            class="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              submitPlugin()
            }}
          >
            <Field invalid={form.issue === "plugin"}>
              <Field.Label>{language.t("settings.extensions.add.custom.plugin")}</Field.Label>
              <Field.Prefix>{language.t("settings.extensions.add.custom.plugin.description")}</Field.Prefix>
              <TextInput
                ref={(element: HTMLInputElement) => fields.set("plugin", element)}
                appearance="large"
                class="!w-full"
                value={form.pkg}
                autocomplete="off"
                spellcheck={false}
                onInput={(event) => setForm("pkg", event.currentTarget.value)}
              />
              <FieldIssue text={issueText("plugin")} />
            </Field>
            <div class="flex justify-end">
              <Button type="submit" variant="submit">
                {language.t("settings.extensions.add.custom.continue")}
              </Button>
            </div>
          </form>
        </Match>
        <Match when={form.kind === "mcp"}>
          <form
            class="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              submitMcp()
            }}
          >
            <Field invalid={form.issue === "name"}>
              <Field.Label>{language.t("settings.extensions.add.setup.name")}</Field.Label>
              <Field.Prefix>
                {props.existing.includes(form.mcp.name.trim())
                  ? language.t("settings.extensions.add.setup.name.replaces", { name: form.mcp.name.trim() })
                  : language.t("settings.extensions.add.setup.name.description")}
              </Field.Prefix>
              <TextInput
                ref={(element: HTMLInputElement) => fields.set("name", element)}
                appearance="large"
                class="!w-full"
                value={form.mcp.name}
                autocomplete="off"
                spellcheck={false}
                onInput={(event) => setForm("mcp", "name", event.currentTarget.value)}
              />
              <FieldIssue text={issueText("name")} />
            </Field>
            <RadioGroup
              label={language.t("settings.extensions.add.custom.transport")}
              value={form.mcp.kind}
              onChange={(value) => {
                if (value === "local" || value === "remote") setForm("mcp", "kind", value)
              }}
            >
              <RadioItem value="local" label={language.t("settings.extensions.add.custom.transport.local")} />
              <RadioItem value="remote" label={language.t("settings.extensions.add.custom.transport.remote")} />
            </RadioGroup>
            <Show
              when={form.mcp.kind === "local"}
              fallback={
                <Field invalid={form.issue === "url"}>
                  <Field.Label>{language.t("settings.extensions.add.custom.url")}</Field.Label>
                  <TextInput
                    ref={(element: HTMLInputElement) => fields.set("url", element)}
                    type="url"
                    appearance="large"
                    class="!w-full"
                    placeholder="https://"
                    value={form.mcp.url}
                    autocomplete="off"
                    spellcheck={false}
                    onInput={(event) => setForm("mcp", "url", event.currentTarget.value)}
                  />
                  <FieldIssue text={issueText("url")} />
                </Field>
              }
            >
              <Field invalid={form.issue === "command"}>
                <Field.Label>{language.t("settings.extensions.add.custom.command")}</Field.Label>
                <Field.Prefix>{language.t("settings.extensions.add.custom.command.description")}</Field.Prefix>
                <TextInput
                  ref={(element: HTMLInputElement) => fields.set("command", element)}
                  appearance="large"
                  class="!w-full font-mono"
                  value={form.mcp.command}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(event) => setForm("mcp", "command", event.currentTarget.value)}
                />
                <FieldIssue text={issueText("command")} />
              </Field>
            </Show>
            <fieldset class="flex flex-col gap-3">
              <legend class="pb-2 text-13-medium text-v2-text-text-base">
                {language.t(`settings.extensions.add.custom.${rowKey()}`)}
              </legend>
              <Index each={form.mcp.rows}>
                {(row, index) => (
                  <div
                    role="group"
                    aria-label={language.t(`settings.extensions.add.custom.${rowKey()}.row`, { index: index + 1 })}
                    class="flex flex-wrap items-center gap-2"
                  >
                    <TextInput
                      ref={(element: HTMLInputElement) => (rowInputs[index] = element)}
                      class="min-w-32 flex-1 font-mono"
                      aria-label={language.t("settings.extensions.add.custom.row.name")}
                      placeholder={language.t("settings.extensions.add.custom.row.name")}
                      aria-invalid={form.issue === "row" && !row().name.trim() && !!row().value.trim()}
                      value={row().name}
                      autocomplete="off"
                      spellcheck={false}
                      onInput={(event) => setForm("mcp", "rows", index, "name", event.currentTarget.value)}
                    />
                    <TextInput
                      class="min-w-32 flex-1"
                      type={row().secret ? "password" : "text"}
                      aria-label={language.t("settings.extensions.add.custom.row.value")}
                      placeholder={language.t("settings.extensions.add.custom.row.value")}
                      value={row().value}
                      autocomplete="off"
                      spellcheck={false}
                      onInput={(event) => setForm("mcp", "rows", index, "value", event.currentTarget.value)}
                    />
                    <Checkbox
                      checked={row().secret}
                      description={language.t("settings.extensions.add.custom.row.secret.description")}
                      onChange={(checked: boolean) => setForm("mcp", "rows", index, "secret", checked)}
                    >
                      {language.t("settings.extensions.add.custom.row.secret")}
                    </Checkbox>
                    <Button type="button" size="small" variant="ghost-muted" onClick={() => removeRow(index)}>
                      {language.t(`settings.extensions.add.custom.${rowKey()}.remove`, { index: index + 1 })}
                    </Button>
                  </div>
                )}
              </Index>
              <IssueText text={issueText("row")} />
              <div>
                <Button
                  ref={(element: HTMLButtonElement) => (refs.add = element)}
                  type="button"
                  variant="ghost-muted"
                  onClick={addRow}
                >
                  {language.t(`settings.extensions.add.custom.${rowKey()}.add`)}
                </Button>
              </div>
            </fieldset>
            <SaveError error={props.error} />
            <div class="flex justify-end">
              <Button type="submit" variant="submit" disabled={props.busy} aria-busy={props.busy}>
                {language.t(props.busy ? "settings.extensions.add.adding" : "settings.extensions.add.setup.add")}
              </Button>
            </div>
          </form>
        </Match>
      </Switch>
    </div>
  )
}

/** An error under a field, which the field's description then includes. */
function FieldIssue(props: { text?: string }) {
  return (
    <Show when={props.text}>
      {(text) => <Field.Suffix class="text-13-regular text-v2-text-text-critical-base">{text()}</Field.Suffix>}
    </Show>
  )
}

function IssueText(props: { text?: string }) {
  return (
    <Show when={props.text}>{(text) => <p class="text-13-regular text-v2-text-text-critical-base">{text()}</p>}</Show>
  )
}
