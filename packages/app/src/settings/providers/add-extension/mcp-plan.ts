import type { ExperimentalConfigMcpRegistryOutput, ExperimentalConfigUpdateInput } from "@opencode/client/promise"

export type RegistryServer = ExperimentalConfigMcpRegistryOutput["servers"][number]

type RegistryPackage = NonNullable<RegistryServer["packages"]>[number]

type RegistryRemote = NonNullable<RegistryServer["remotes"]>[number]

type RegistryInput = NonNullable<RegistryRemote["headers"]>[number]

type RegistryArgument = NonNullable<RegistryPackage["packageArguments"]>[number]

export type McpConfig = NonNullable<NonNullable<ExperimentalConfigUpdateInput["mcp"]>[string]>

/** One field the person fills in before a server is added. */
export type SetupInput = {
  key: string
  label: string
  description?: string
  required: boolean
  secret: boolean
  initial: string
  /** An Authorization header's token, sent as `Bearer <token>`; the person pastes only the token. */
  token?: boolean
}

/** A value made of fixed text and the inputs it is filled from, such as `Bearer {api_key}`. */
type Segment = { type: "text"; text: string } | { type: "input"; key: string }

type Entry = { name: string; segments: Segment[] }

export type McpPlan =
  | { type: "remote"; url: string; headers: Entry[]; inputs: SetupInput[]; oauth?: OAuth }
  | {
      type: "local"
      runtime: "npx" | "uvx" | "docker"
      identifier: string
      version?: string
      args: Segment[][]
      env: Entry[]
      inputs: SetupInput[]
    }

type OAuth = { client_id: string; client_secret: string }

export const NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const KEYCHAIN_LIMIT = 128

const SECRET_NAME = /key|token|secret|password|authorization|credential/i

// Names that say nothing about the server, such as `com.example/mcp`, fall back to the namespace's last part.
const GENERIC_SLUGS = new Set(["mcp", "server", "mcp-server"])

const RUNTIMES = { npm: "npx", pypi: "uvx", oci: "docker" } as const

/** The pages where people get a key for servers that need one, by registry name. */
export const KEY_PAGES: Record<string, string> = {
  "io.github.brave/brave-search-mcp-server": "https://api-dashboard.search.brave.com/app/keys",
  "io.github.tavily-ai/tavily-mcp": "https://app.tavily.com/home",
  "io.github.browserbase/mcp-server-browserbase": "https://www.browserbase.com/settings",
}

/** GitHub's official server. GitHub has no client registration, so it signs in with AccessCode's own OAuth app. */
export const GITHUB_SERVER = "io.github.github/github-mcp-server"

/**
 * AccessCode's GitHub OAuth app. The client ID is public; the secret never enters the config, which refers to the
 * variable the desktop app sets for its server.
 */
const GITHUB_OAUTH: OAuth = {
  client_id: "Ov23lip9cLZPKKREYwUv",
  client_secret: "{env:ACCESSCODE_GITHUB_CLIENT_SECRET}",
}

/**
 * Picks how to run a registry server: a remote that needs nothing from the person, then a package that runs on the
 * Mac, then a remote that asks for its keys. Undefined when nothing can be added without help.
 */
export function planServer(server: RegistryServer): McpPlan | undefined {
  const remotes = (server.remotes ?? []).flatMap((remote) => planRemote(remote) ?? [])
  const open = remotes.find((plan) => plan.inputs.every((input) => !input.required))

  if (open) return open

  const packages = (server.packages ?? []).flatMap((item) => planPackage(item) ?? [])
  const local = packages.find((plan) => plan.runtime !== "docker") ?? packages[0]

  return local ?? remotes[0]
}

function planRemote(remote: RegistryRemote): McpPlan | undefined {
  // A URL with {variables} needs values the registry does not describe well enough to ask for.
  if (remote.type !== "streamable-http" && remote.type !== "sse") return
  if (remote.url.includes("{")) return
  const headers = (remote.headers ?? []).map((header) => planEntry("header", header))

  return {
    type: "remote",
    url: remote.url,
    headers: headers.map((item) => item.entry),
    inputs: headers.flatMap((item) => item.inputs),
  }
}

function planPackage(item: RegistryPackage): Extract<McpPlan, { type: "local" }> | undefined {
  const runtime = Object.hasOwn(RUNTIMES, item.registryType)
    ? RUNTIMES[item.registryType as keyof typeof RUNTIMES]
    : undefined

  if (!runtime) return
  // OpenCode talks to a local server over stdio; a package that serves HTTP needs a port and a URL instead.
  if (item.transport && item.transport.type !== "stdio") return
  const env = (item.environmentVariables ?? []).map((variable) => planEntry("env", variable))
  const args = (item.packageArguments ?? []).map((argument, index) => planArgument(argument, index))

  return {
    type: "local",
    runtime,
    identifier: item.identifier,
    version: item.version,
    args: args.flatMap((arg) => arg.segments),
    env: env.map((entry) => entry.entry),
    inputs: [...args.flatMap((arg) => arg.inputs), ...env.flatMap((entry) => entry.inputs)],
  }
}

/** An env var or header: a fixed value, a template with {placeholders}, or one field for the whole value. */
function planEntry(kind: "env" | "header", input: RegistryInput) {
  const base = {
    description: input.description,
    required: input.isRequired ?? false,
    // Registries often leave isSecret unset on API keys, so a name that looks like one is kept in the Keychain too.
    secret: input.isSecret === true || SECRET_NAME.test(input.name),
  }

  if (!input.value) {
    const key = `${kind}:${input.name}`
    const field = { ...base, key, label: input.name, initial: base.secret ? "" : (input.default ?? "") }

    // An Authorization header with no template almost always wants a bearer token, which people paste without the
    // "Bearer " prefix.
    if (kind === "header" && input.name.toLowerCase() === "authorization")
      return {
        entry: { name: input.name, segments: [text("Bearer "), { type: "input" as const, key }] },
        inputs: [{ ...field, secret: true, token: true }],
      }

    return { entry: { name: input.name, segments: [{ type: "input" as const, key }] }, inputs: [field] }
  }

  const segments = parseTemplate(input.value, (placeholder) => `${kind}:${input.name}:${placeholder}`)

  const inputs = segments.flatMap((segment) =>
    segment.type === "input"
      ? [
          {
            ...base,
            key: segment.key,
            label: segment.key.split(":").slice(2).join(":"),
            secret: base.secret || SECRET_NAME.test(segment.key),
            initial: "",
          },
        ]
      : [],
  )

  return { entry: { name: input.name, segments }, inputs }
}

function planArgument(argument: RegistryArgument, index: number) {
  // A required value with a hint and a default, such as the folder Filesystem may use, is a field filled with the
  // default; any other default is used as is.
  const editable = argument.isRequired && argument.valueHint !== undefined && argument.value === undefined
  const fixed = argument.value ?? (editable ? undefined : argument.default)
  const flag = argument.type === "named" && argument.name ? [[text(argument.name)]] : []

  if (fixed !== undefined) return { segments: [...flag, [text(fixed)]], inputs: [] }

  // A named argument without a value hint is a plain flag such as --stdio.
  if (flag.length > 0 && !argument.valueHint) return { segments: argument.isRequired ? flag : [], inputs: [] }

  if (!argument.isRequired) return { segments: [], inputs: [] }
  const key = `arg:${index}`

  return {
    segments: [...flag, [{ type: "input" as const, key }]],
    inputs: [
      {
        key,
        label: argument.valueHint ?? argument.name ?? key,
        description: argument.description,
        required: true,
        secret: argument.isSecret ?? false,
        initial: argument.default ?? "",
      },
    ],
  }
}

function text(value: string): Segment {
  return { type: "text", text: value }
}

function parseTemplate(value: string, key: (placeholder: string) => string): Segment[] {
  return value
    .split(/(\{[^{}]+\})/)
    .filter((part) => part !== "")
    .map((part) => (/^\{[^{}]+\}$/.test(part) ? { type: "input", key: key(part.slice(1, -1)) } : text(part)))
}

/** The required inputs that are still empty. A token counts as required: the header is useless without it. */
export function missingInputs(inputs: readonly SetupInput[], values: Record<string, string>) {
  return inputs.filter((input) => (input.required || input.token) && !values[input.key]?.trim())
}

/** Whether adding needs a step first because something must be filled in. */
export function needsSetup(plan: McpPlan) {
  return plan.inputs.length > 0
}

/** The server's first remote without its keys, for a server that signs in with the browser instead. */
export function signInPlan(server: RegistryServer): Extract<McpPlan, { type: "remote" }> | undefined {
  const remote = (server.remotes ?? []).flatMap((item) => planRemote(item) ?? [])[0]

  if (remote?.type !== "remote") return

  return { type: "remote", url: remote.url, headers: [], inputs: [] }
}

/** GitHub's remote without a token, signing in with the browser through AccessCode's GitHub OAuth app. */
export function githubPlan(server: RegistryServer): Extract<McpPlan, { type: "remote" }> | undefined {
  const remote = signInPlan(server)

  if (!remote) return

  return { ...remote, oauth: GITHUB_OAUTH }
}

/**
 * Turns a plan and the person's values into the config to save. Secrets go to the Keychain under a name derived from
 * the server name, and the config refers to them as {keychain:NAME}. An entry whose input was left empty is left out.
 */
export function buildPlan(plan: McpPlan, name: string, values: Record<string, string>) {
  const keychain: Record<string, string> = {}
  const secrets = new Map(plan.inputs.filter((input) => input.secret).map((input) => [input.key, input.label]))
  const tokens = new Set(plan.inputs.filter((input) => input.token).map((input) => input.key))

  const resolve = (segments: Segment[]) => {
    const missing = segments.some((segment) => segment.type === "input" && !values[segment.key]?.trim())

    if (missing) return

    return segments
      .map((segment) => {
        if (segment.type === "text") return segment.text
        const raw = values[segment.key]?.trim() ?? ""
        const value = tokens.has(segment.key) ? raw.replace(/^bearer\s+/i, "") : raw
        const label = secrets.get(segment.key)

        if (label === undefined) return value
        const id = keychainName(name, label)
        keychain[id] = value

        return `{keychain:${id}}`
      })
      .join("")
  }

  const entries = (list: Entry[]) =>
    Object.fromEntries(
      list.flatMap((entry) => {
        const value = resolve(entry.segments)

        return value === undefined ? [] : [[entry.name, value]]
      }),
    )

  if (plan.type === "remote") {
    const headers = entries(plan.headers)

    return { config: remoteConfig(plan.url, headers, plan.oauth), keychain }
  }

  const environment = entries(plan.env)
  const args = plan.args.flatMap((segments) => resolve(segments) ?? [])

  return {
    config: localConfig([...runtimeCommand(plan, Object.keys(environment)), ...args], environment),
    keychain,
  }
}

function runtimeCommand(plan: Extract<McpPlan, { type: "local" }>, env: string[]) {
  if (plan.runtime === "npx")
    return ["npx", "-y", plan.version ? `${plan.identifier}@${plan.version}` : plan.identifier]

  if (plan.runtime === "uvx") return ["uvx", plan.version ? `${plan.identifier}==${plan.version}` : plan.identifier]
  // Docker passes each variable through by name, so its value stays out of the command line.
  const tagged =
    plan.version && !/:[^/]+$/.test(plan.identifier) ? `${plan.identifier}:${plan.version}` : plan.identifier

  return ["docker", "run", "-i", "--rm", ...env.flatMap((variable) => ["-e", variable]), tagged]
}

function remoteConfig(url: string, headers: Record<string, string>, oauth?: OAuth): McpConfig {
  return {
    type: "remote",
    url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(oauth ? { oauth } : {}),
  }
}

function localConfig(command: string[], environment: Record<string, string>): McpConfig {
  return Object.keys(environment).length > 0 ? { type: "local", command, environment } : { type: "local", command }
}

/** A Keychain item name for one of a server's secrets, limited to the characters the Keychain API accepts. */
export function keychainName(server: string, label: string) {
  return `mcp-${server}-${label}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, KEYCHAIN_LIMIT)
}

/**
 * The name to show for a registry server: its title without a trailing "MCP" or "MCP Server" or a subtitle after a
 * colon, or else a readable name made from its registry name, such as Notion for `com.notion/mcp`.
 */
export function serverTitle(server: Pick<RegistryServer, "name" | "title">) {
  const title = server.title
    ?.split(":")[0]
    ?.replace(/\s+MCP(\s+Server)?$/i, "")
    .trim()

  if (title) return title
  const words = serverSlug(server.name)
    .replace(/(^|-)mcp(-server)?($|-)/g, "$1")
    .split(/[-_]+/)
    .filter(Boolean)

  if (words.length === 0) return server.name

  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")
}

/** A short config name from a registry name such as `io.github.owner/my-server`. */
export function serverSlug(name: string) {
  const parts = name.split("/")
  const last = slugify(parts.at(-1) ?? "")

  if (!GENERIC_SLUGS.has(last) || parts.length < 2) return last || "server"
  // The namespace's last part that is not itself generic, so `com.cloudflare.mcp/mcp` is cloudflare.
  const namespace = (parts.at(-2) ?? "")
    .split(".")
    .map(slugify)
    .filter((part) => part && !GENERIC_SLUGS.has(part))

  return namespace.at(-1) || last
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 64)
}

/** Splits a command line into arguments, honoring single and double quotes and backslash escapes. */
export function splitCommand(line: string) {
  const state = { args: [] as string[], current: "", started: false, quote: "", escaped: false }

  Array.from(line).forEach((char) => {
    if (state.escaped) {
      state.current += char
      state.escaped = false
      return
    }

    if (char === "\\" && state.quote !== "'") {
      state.escaped = true
      state.started = true
      return
    }

    if (state.quote) {
      if (char === state.quote) {
        state.quote = ""
        return
      }
      state.current += char
      return
    }

    if (char === '"' || char === "'") {
      state.quote = char
      state.started = true
      return
    }

    if (/\s/.test(char)) {
      if (state.started) state.args.push(state.current)
      state.current = ""
      state.started = false
      return
    }

    state.current += char
    state.started = true
  })

  return state.started ? [...state.args, state.current] : state.args
}

export type CustomRow = { name: string; value: string; secret: boolean }

export type CustomMcp = { name: string; kind: "local" | "remote"; command: string; url: string; rows: CustomRow[] }

/** What is wrong with a hand-entered server, checked in the order the fields appear. */
export function customMcpIssue(input: CustomMcp) {
  if (!NAME_PATTERN.test(input.name.trim())) return "name" as const

  if (input.kind === "local" && splitCommand(input.command).length === 0) return "command" as const

  if (input.kind === "remote" && !URL.canParse(input.url.trim())) return "url" as const

  if (input.rows.some((row) => !row.name.trim() && row.value.trim())) return "row" as const

  return undefined
}

/** The config and Keychain items for a hand-entered server. Rows marked as keys go to the Keychain. */
export function buildCustomMcp(input: CustomMcp) {
  const name = input.name.trim()
  const keychain: Record<string, string> = {}
  const rows = input.rows.filter((row) => row.name.trim())

  const values = Object.fromEntries(
    rows.map((row) => {
      const key = row.name.trim()

      if (!row.secret) return [key, row.value]
      const id = keychainName(name, key)
      keychain[id] = row.value.trim()

      return [key, `{keychain:${id}}`]
    }),
  )

  if (input.kind === "remote") return { name, config: remoteConfig(input.url.trim(), values), keychain }

  return { name, config: localConfig(splitCommand(input.command), values), keychain }
}
