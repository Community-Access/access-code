import { Button } from "@opencode/ui/button"
import { Field } from "@opencode/ui/field"
import { TextInput } from "@opencode/ui/text-input"
import { createStore } from "solid-js/store"
import { For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ExternalLink } from "@/runtime/platform/external-link"
import { createExtensionLoad } from "@/settings/extension-load"
import { announce } from "@/session/announce"
import { SaveError } from "./save-error"
import type { SaveRequest } from "./machine"
import {
  buildPlan,
  GITHUB_SERVER,
  githubPlan,
  KEY_PAGES,
  missingInputs,
  NAME_PATTERN,
  serverSlug,
  serverTitle,
  signInPlan,
  type McpPlan,
  type RegistryServer,
} from "./mcp-plan"

/**
 * How the server will connect: checking first, then a browser sign-in after adding, or the keys the registry asks
 * for. Keys stay available as "Use a key instead".
 */
type Mode = "checking" | "signIn" | "keys"

const NEEDS = {
  npx: "settings.extensions.add.need.node",
  uvx: "settings.extensions.add.need.uv",
  docker: "settings.extensions.add.need.docker",
} as const

/** Where to get the helper program a local server runs with. */
const INSTALL = {
  npx: { url: "https://nodejs.org/en/download", label: "settings.extensions.add.install.node" },
  uvx: { url: "https://docs.astral.sh/uv/getting-started/installation/", label: "settings.extensions.add.install.uv" },
  docker: { url: "https://www.docker.com/products/docker-desktop/", label: "settings.extensions.add.install.docker" },
} as const

/**
 * What a registry server needs before it is added. A server that can sign in with the browser needs nothing;
 * otherwise its inputs, required ones first. GitHub signs in through AccessCode's OAuth app when the server has its
 * secret. The name it is saved under is under More options, open when it would replace a server already added.
 */
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
  const serverSdk = useServerSDK()
  const title = () => serverTitle(props.server)
  const github = props.server.name === GITHUB_SERVER
  const browser = github
    ? githubPlan(props.server)
    : props.plan.inputs.some((input) => input.secret)
      ? signInPlan(props.server)
      : undefined
  const initial = serverSlug(props.server.name)

  const [form, setForm] = createStore({
    mode: (browser ? "checking" : "keys") as Mode,
    /** Whether browser sign-in works, so the person can switch back after choosing a key. */
    found: false,
    name: initial,
    more: props.existing.includes(initial),
    values: Object.fromEntries(props.plan.inputs.map((input) => [input.key, input.initial])) as Record<string, string>,
    issue: undefined as string | undefined,
    invalid: undefined as string | undefined,
  })

  const fields = new Map<string, HTMLElement>()
  const refs: { toggle?: HTMLButtonElement } = {}

  if (browser)
    void serverSdk.api.experimental.config.mcpSignIn({ url: browser.url }).then(
      (result) => setForm({ found: result.supported, mode: result.supported ? "signIn" : "keys" }),
      () => setForm({ mode: "keys" }),
    )

  const plan = () => {
    if (form.mode === "signIn" && browser) return browser

    return props.plan
  }

  const inputs = () =>
    form.mode === "keys" ? plan().inputs.toSorted((a, b) => Number(b.required) - Number(a.required)) : []

  // Node.js, uv or Docker must be installed for a server that runs on the Mac.
  const tools = createExtensionLoad({
    key: () => (props.plan.type === "local" ? props.plan.runtime : undefined),
    task: (runtime, signal) =>
      runtime ? serverSdk.api.experimental.config.tools({ signal }) : Promise.resolve(undefined),
  })

  /** The runtime of a local server whose helper program is not installed. */
  const missingHelper = () => {
    const current = plan()
    const found = tools.view()

    if (current.type !== "local" || found.status !== "ready" || !found.value) return
    const installed = { npx: found.value.node, uvx: found.value.uv, docker: found.value.docker }[current.runtime]

    return installed ? undefined : current.runtime
  }

  const runtimeNote = () => {
    const missing = missingHelper()

    if (missing) return language.t(NEEDS[missing])
    const current = plan()

    if (current.type === "local" && current.runtime === "docker" && tools.view().status === "ready")
      return language.t("settings.extensions.add.need.dockerOpen")
  }

  // A server whose key comes from a known page links to it.
  const keyPage = () => (form.mode === "keys" ? KEY_PAGES[props.server.name] : undefined)

  const required = (input: McpPlan["inputs"][number]) => input.required || !!input.token

  const field = (input: McpPlan["inputs"][number]) => (
    <Field invalid={form.invalid === input.key}>
      <Field.Label>
        {language.t(
          required(input) ? "settings.extensions.add.setup.required" : "settings.extensions.add.setup.optional",
          { name: label(input) },
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
        aria-required={required(input)}
        autocomplete="off"
        spellcheck={false}
        onInput={(event) => setForm("values", input.key, event.currentTarget.value)}
      />
    </Field>
  )

  const summary = () => {
    const current = plan()

    if (current.type === "remote")
      return language.t("settings.extensions.add.setup.remote", { host: URL.parse(current.url)?.host ?? current.url })

    return language.t("settings.extensions.add.setup.local")
  }

  const technical = () => {
    const current = plan()

    if (current.type === "remote") return language.t("settings.extensions.add.setup.address", { url: current.url })

    return language.t("settings.extensions.add.setup.command", {
      command: [current.runtime, current.identifier].join(" "),
    })
  }

  // Read when it changes, so the result of the check is heard without moving focus.
  const status = () => {
    if (form.mode === "checking") return language.t("settings.extensions.add.setup.checking", { name: title() })

    if (form.mode === "signIn") return language.t("settings.extensions.add.setup.signIn", { name: title() })

    if (github && !form.found) return language.t("settings.extensions.add.setup.github.token")

    return ""
  }

  const switchMode = (mode: Mode) => {
    setForm({ mode, issue: undefined, invalid: undefined })
    requestAnimationFrame(() => {
      if (mode === "keys") return fields.get(inputs()[0]?.key ?? "")?.focus() ?? refs.toggle?.focus()
      refs.toggle?.focus()
    })
  }

  const fail = (key: string, message: string) => {
    const hidden = key === "name" || plan().inputs.some((input) => input.key === key && !required(input))
    setForm({ issue: message, invalid: key, more: hidden || form.more })
    announce(message, "assertive")
    requestAnimationFrame(() => fields.get(key)?.focus())
  }

  const submit = () => {
    if (form.mode === "checking") return
    const name = form.name.trim()

    if (!NAME_PATTERN.test(name)) return fail("name", language.t("settings.extensions.add.setup.name.invalid"))
    const missing = missingInputs(inputs(), form.values)[0]

    if (missing) return fail(missing.key, language.t("settings.extensions.add.setup.missing", { name: label(missing) }))
    setForm({ issue: undefined, invalid: undefined })
    const built = buildPlan(plan(), name, form.mode === "keys" ? form.values : {})
    props.onSubmit({
      type: "mcp",
      label: title(),
      name,
      config: built.config,
      keychain: built.keychain,
      signIn: form.mode === "signIn",
    })
  }

  const label = (input: McpPlan["inputs"][number]) =>
    input.token ? language.t("settings.extensions.add.setup.token") : input.label

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
      <Show when={runtimeNote()}>{(note) => <p class="text-13-regular text-v2-text-text-base">{note()}</p>}</Show>
      <Show when={missingHelper()}>
        {(runtime) => (
          <ExternalLink class="text-13-regular" href={INSTALL[runtime()].url}>
            {language.t(INSTALL[runtime()].label)}
          </ExternalLink>
        )}
      </Show>
      <p role="status" class="text-13-regular text-v2-text-text-base">
        {status()}
      </p>
      <Show when={form.mode === "keys" && inputs().length === 0}>
        <p class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.add.setup.noInputs")}</p>
      </Show>
      <Show when={keyPage()}>
        {(href) => (
          <>
            <p class="text-13-regular text-v2-text-text-base">
              {language.t("settings.extensions.add.setup.key", { name: title() })}
            </p>
            <ExternalLink class="text-13-regular" href={href()}>
              {language.t("settings.extensions.add.setup.key.link", { name: title() })}
            </ExternalLink>
          </>
        )}
      </Show>
      <For each={inputs().filter(required)}>{(input) => field(input)}</For>
      <Show when={form.found && form.mode !== "checking"}>
        <div>
          <Button
            ref={(element: HTMLButtonElement) => (refs.toggle = element)}
            type="button"
            variant="ghost-muted"
            onClick={() => switchMode(form.mode === "keys" ? "signIn" : "keys")}
          >
            {language.t(
              form.mode === "keys"
                ? "settings.extensions.add.setup.useSignIn"
                : github
                  ? "settings.extensions.add.setup.useToken"
                  : "settings.extensions.add.setup.useKey",
            )}
          </Button>
        </div>
      </Show>
      <details
        open={form.more}
        onToggle={(event) => setForm("more", event.currentTarget.open)}
        class="flex flex-col gap-3"
      >
        <summary class="cursor-pointer text-13-medium text-v2-text-text-base">
          {language.t("settings.extensions.add.setup.more")}
        </summary>
        <div class="flex flex-col gap-3 pt-3">
          <p class="text-13-regular text-v2-text-text-muted [overflow-wrap:anywhere]">{technical()}</p>
          <For each={inputs().filter((input) => !required(input))}>{(input) => field(input)}</For>
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
        </div>
      </details>
      <Show when={form.issue}>
        {(issue) => <p class="text-13-regular text-v2-text-text-critical-base">{issue()}</p>}
      </Show>
      <SaveError error={props.error} />
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={props.busy} onClick={() => props.onCancel()}>
          {language.t("settings.extensions.add.cancel")}
        </Button>
        <Button
          type="submit"
          variant="submit"
          disabled={props.busy || form.mode === "checking"}
          aria-busy={props.busy}
          aria-label={
            props.busy ? undefined : language.t("settings.extensions.add.plugins.install.label", { name: title() })
          }
        >
          {language.t(props.busy ? "settings.extensions.add.adding" : "settings.extensions.add.setup.add")}
        </Button>
      </div>
    </form>
  )
}
