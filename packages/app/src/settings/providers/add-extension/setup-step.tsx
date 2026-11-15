import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { createStore } from "solid-js/store"
import { For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { SaveError } from "./save-error"
import type { SaveRequest } from "./machine"
import { buildPlan, missingInputs, NAME_PATTERN, serverSlug, type McpPlan, type RegistryServer } from "./mcp-plan"

/** The fields a registry server needs: its name in opencode.json, then its inputs, required ones first. */
export function SetupStep(props: {
  server: RegistryServer
  plan: McpPlan
  existing: string[]
  busy: boolean
  error?: string
  onCancel: () => void
  onSubmit: (request: SaveRequest) => void
}) {
  const language = useLanguage()
  const inputs = () => props.plan.inputs.toSorted((a, b) => Number(b.required) - Number(a.required))

  const [form, setForm] = createStore({
    name: serverSlug(props.server.name),
    values: Object.fromEntries(props.plan.inputs.map((input) => [input.key, input.initial])) as Record<string, string>,
    issue: undefined as string | undefined,
    invalid: undefined as string | undefined,
  })

  const fields = new Map<string, HTMLInputElement>()

  const summary = () => {
    const plan = props.plan

    if (plan.type === "remote") return language.t("settings.extensions.add.setup.remote", { url: plan.url })

    return language.t("settings.extensions.add.setup.local", {
      command: [plan.runtime, plan.identifier].join(" "),
    })
  }

  const fail = (key: string, message: string) => {
    setForm({ issue: message, invalid: key })
    announce(message, "assertive")
    fields.get(key)?.focus()
  }

  const submit = () => {
    const name = form.name.trim()

    if (!NAME_PATTERN.test(name)) return fail("name", language.t("settings.extensions.add.setup.name.invalid"))
    const missing = missingInputs(inputs(), form.values)[0]

    if (missing) return fail(missing.key, language.t("settings.extensions.add.setup.missing", { name: missing.label }))
    setForm({ issue: undefined, invalid: undefined })
    const built = buildPlan(props.plan, name, form.values)
    props.onSubmit({
      type: "mcp",
      label: name,
      name,
      config: built.config,
      keychain: built.keychain,
    })
  }

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Show when={props.server.description}>
        {(description) => <p class="text-13-regular text-v2-text-text-base">{description()}</p>}
      </Show>
      <p class="text-13-regular text-v2-text-text-muted [overflow-wrap:anywhere]">{summary()}</p>
      <Field invalid={form.invalid === "name"}>
        <Field.Label>{language.t("settings.extensions.add.setup.name")}</Field.Label>
        <Field.Prefix>
          {props.existing.includes(form.name.trim())
            ? language.t("settings.extensions.add.setup.name.replaces", { name: form.name.trim() })
            : language.t("settings.extensions.add.setup.name.description")}
        </Field.Prefix>
        <TextInput
          ref={(element: HTMLInputElement) => fields.set("name", element)}
          appearance="large"
          class="!w-full"
          value={form.name}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => setForm("name", event.currentTarget.value)}
        />
      </Field>
      <Show when={inputs().length === 0}>
        <p class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.add.setup.noInputs")}</p>
      </Show>
      <For each={inputs()}>
        {(input) => (
          <Field invalid={form.invalid === input.key}>
            <Field.Label>
              {language.t(
                input.required ? "settings.extensions.add.setup.required" : "settings.extensions.add.setup.optional",
                { name: input.label },
              )}
            </Field.Label>
            <Show when={input.description || input.secret}>
              <Field.Prefix>
                {[input.description, input.secret ? language.t("settings.extensions.add.setup.secret") : undefined]
                  .filter(Boolean)
                  .join(" ")}
              </Field.Prefix>
            </Show>
            <TextInput
              ref={(element: HTMLInputElement) => fields.set(input.key, element)}
              type={input.secret ? "password" : "text"}
              appearance="large"
              class="!w-full"
              value={form.values[input.key] ?? ""}
              aria-required={input.required}
              autocomplete="off"
              spellcheck={false}
              onInput={(event) => setForm("values", input.key, event.currentTarget.value)}
            />
          </Field>
        )}
      </For>
      <Show when={form.issue}>
        {(issue) => <p class="text-13-regular text-v2-text-text-critical-base">{issue()}</p>}
      </Show>
      <SaveError error={props.error} />
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={props.busy} onClick={() => props.onCancel()}>
          {language.t("settings.extensions.add.cancel")}
        </Button>
        <Button type="submit" variant="submit" disabled={props.busy} aria-busy={props.busy}>
          {language.t(props.busy ? "settings.extensions.add.adding" : "settings.extensions.add.setup.add")}
        </Button>
      </div>
    </form>
  )
}
