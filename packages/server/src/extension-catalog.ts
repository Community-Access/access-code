import fs from "node:fs/promises"
import path from "node:path"
import { ExtensionCatalog } from "@opencode/schema/extension-catalog"
import { McpRegistry } from "@opencode/schema/mcp-registry"
import { Schema } from "effect"

// AccessCode: the extension sources the Add extension dialog reads through the server, because they block browser
// requests or are too large to parse in the page, and the skills CLI it runs to install and remove skills.

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers"

const DOCKER_CATALOG_URL = "https://desktop.docker.com/mcp/catalog/v2/catalog.yaml"

const SKILLS_URL = "https://skills.sh/api/search"

const TIMEOUT_MS = 15_000

const CACHE_MS = 60 * 60 * 1000

/** The skills CLI version whose flags were checked against its docs. */
const SKILLS_CLI = "skills@1.8.1"

const COMMAND_TIMEOUT_MS = 120_000

const OUTPUT_LIMIT = 2_000

/** Official MCP Registry names, in the order the Popular list shows them. */
export const POPULAR_SERVERS = [
  "io.github.github/github-mcp-server",
  "io.github.microsoft/playwright-mcp",
  "io.github.upstash/context7",
  "io.github.ChromeDevTools/chrome-devtools-mcp",
  "com.notion/mcp",
  "app.linear/linear",
  "com.atlassian/atlassian-mcp-server",
  "com.figma.mcp/mcp",
  "io.github.getsentry/sentry-mcp",
  "com.stripe/mcp",
  "com.supabase/mcp",
  "com.cloudflare.mcp/mcp",
  "com.vercel/vercel-mcp",
  "com.gitlab/mcp",
  "io.github.brave/brave-search-mcp-server",
  "ai.exa/exa",
  "io.github.firecrawl/firecrawl-mcp-server",
  "io.github.tavily-ai/tavily-mcp",
  "ai.perplexity/mcp-server",
  "com.zapier/mcp",
  "com.make/mcp-server",
  "com.apify/apify-mcp-server",
  "co.huggingface/hf-mcp-server",
  "io.github.mongodb-js/mongodb-mcp-server",
  "io.prisma/mcp",
  "io.github.redis/mcp-redis",
  "io.github.ClickHouse/mcp-clickhouse",
  "com.microsoft/azure",
  "com.microsoft/microsoft-learn-mcp",
  "com.paypal.mcp/mcp",
  "com.canva.mcp/mcp",
  "com.airtable/mcp",
  "com.monday/monday.com",
  "com.webflow/mcp",
  "com.wix/mcp",
  "com.postman/postman-mcp-server",
  "io.elevenlabs/mcp",
  "io.github.PostHog/mcp",
  "io.github.grafana/mcp-grafana",
  "io.github.hashicorp/terraform-mcp-server",
  "com.wolfram/mcp",
  "io.github.browserbase/mcp-server-browserbase",
  "io.github.wonderwhy-er/desktop-commander",
  "io.github.oraios/serena",
]

/** Broad searches whose merged results stand in for "popular", since skills.sh has no popular list in its API. */
export const POPULAR_SKILL_QUERIES = ["react", "design", "test", "docs", "python"]

const REFERENCE_REPO = "https://github.com/modelcontextprotocol/servers"

/**
 * The MCP project's reference servers. They are not in the registry, so they are described here. `home` is the
 * folder Filesystem starts with, which the person can change before adding it.
 */
export function referenceServers(home: string) {
  const stdio = { type: "stdio" }
  const reference = (input: {
    slug: string
    title: string
    description: string
    registryType: "npm" | "pypi"
    identifier: string
    packageArguments?: McpRegistry.Argument[]
  }) =>
    new McpRegistry.Server({
      name: `io.github.modelcontextprotocol/${input.slug}`,
      title: input.title,
      description: input.description,
      websiteUrl: `${REFERENCE_REPO}/tree/main/src/${input.slug}`,
      repository: { url: REFERENCE_REPO },
      packages: [
        new McpRegistry.Package({
          registryType: input.registryType,
          identifier: input.identifier,
          transport: stdio,
          packageArguments: input.packageArguments,
        }),
      ],
    })

  return [
    reference({
      slug: "filesystem",
      title: "Filesystem",
      description: "Read, write and search files in the folders you allow.",
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-filesystem",
      packageArguments: [
        new McpRegistry.Argument({
          type: "positional",
          valueHint: "Allowed folder",
          description: "The folder the server may read and write. Your home folder by default.",
          default: home,
          isRequired: true,
        }),
      ],
    }),
    reference({
      slug: "memory",
      title: "Memory",
      description: "A knowledge graph the AI keeps between conversations.",
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-memory",
    }),
    reference({
      slug: "sequentialthinking",
      title: "Sequential Thinking",
      description: "Helps the AI work through a problem step by step.",
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-sequential-thinking",
    }),
    reference({
      slug: "fetch",
      title: "Fetch",
      description: "Fetches web pages and turns them into text the AI can read.",
      registryType: "pypi",
      identifier: "mcp-server-fetch",
    }),
    reference({
      slug: "git",
      title: "Git",
      description: "Reads and changes Git repositories.",
      registryType: "pypi",
      identifier: "mcp-server-git",
    }),
    reference({
      slug: "time",
      title: "Time",
      description: "Tells the time and converts between time zones.",
      registryType: "pypi",
      identifier: "mcp-server-time",
    }),
  ]
}

const LatestResponse = Schema.Struct({ server: McpRegistry.Server })

const decodeLatest = Schema.decodeUnknownOption(LatestResponse)

/** The popular registry servers that load, in list order, then the reference servers. */
export async function loadPopular(home: string) {
  const servers = await Promise.all(
    POPULAR_SERVERS.map(async (name) => {
      const response = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}/versions/latest`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => undefined)

      if (!response?.ok) return []
      const decoded = decodeLatest(await response.json().catch(() => undefined))

      return decoded._tag === "Some" ? [decoded.value.server] : []
    }),
  )
  const found = servers.flat()

  // Nothing loading means the registry is unreachable; failing keeps that out of the cache so Retry tries again.
  if (found.length === 0) throw new Error("The MCP Registry did not answer")

  return [...found, ...referenceServers(home)]
}

const Text = Schema.String.pipe(Schema.optionalKey)

/** The parts of a Docker MCP Catalog entry the dialog uses. The catalog has more fields; unknown ones are dropped. */
const DockerEntry = Schema.Struct({
  title: Text,
  description: Text,
  type: Text,
  image: Text,
  source: Text,
  upstream: Text,
  secrets: Schema.Struct({ env: Schema.String, description: Text }).pipe(Schema.Array, Schema.optionalKey),
  env: Schema.Struct({ name: Schema.String, value: Schema.Unknown.pipe(Schema.optionalKey) }).pipe(
    Schema.Array,
    Schema.optionalKey,
  ),
  command: Schema.Unknown.pipe(Schema.Array, Schema.optionalKey),
  volumes: Schema.Unknown.pipe(Schema.Array, Schema.optionalKey),
  config: Schema.Struct({
    name: Text,
    properties: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey),
    required: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  }).pipe(Schema.Array, Schema.optionalKey),
  remote: Schema.Struct({
    transport_type: Text,
    url: Schema.String,
    headers: Schema.Record(Schema.String, Schema.String).pipe(Schema.optionalKey),
  }).pipe(Schema.optionalKey),
  metadata: Schema.Struct({
    pulls: Schema.Number.pipe(Schema.optionalKey),
    githubStars: Schema.Number.pipe(Schema.optionalKey),
    category: Text,
    tags: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  }).pipe(Schema.optionalKey),
})
type DockerEntry = typeof DockerEntry.Type

const decodeDockerEntry = Schema.decodeUnknownOption(DockerEntry)

/** One catalog server, with what search and sorting need. */
export type DockerServer = { server: McpRegistry.Server; text: string; pulls: number; stars: number }

/** The `registry:` map of the parsed catalog, mapped and sorted by pulls, then GitHub stars. Bad entries are skipped. */
export function dockerServers(catalog: unknown) {
  const registry =
    catalog && typeof catalog === "object" && "registry" in catalog && catalog.registry ? catalog.registry : {}

  return Object.entries(registry)
    .flatMap(([key, value]) => {
      const entry = decodeDockerEntry(value)

      return entry._tag === "Some" ? [dockerServer(key, entry.value)] : []
    })
    .toSorted((a, b) => b.pulls - a.pulls || b.stars - a.stars)
}

/** The servers whose name, title, description, category or tags contain every word of the search. */
export function searchDocker(servers: readonly DockerServer[], search: string | undefined) {
  const words = (search ?? "").toLowerCase().split(/\s+/).filter(Boolean)

  return servers.filter((item) => words.every((word) => item.text.includes(word))).map((item) => item.server)
}

/**
 * Maps a catalog entry to the registry's shape, so the dialog sets it up like any registry server: an image runs with
 * `docker run`, and a remote keeps its URL and headers. An entry that needs a mounted folder, a templated command or a
 * kind of image the dialog cannot run gets neither, so the dialog offers to ask the AI instead.
 */
export function dockerServer(key: string, entry: DockerEntry): DockerServer {
  const secrets = new Set((entry.secrets ?? []).map((secret) => secret.env))
  const repository = entry.upstream || entry.source

  const server = new McpRegistry.Server({
    name: key,
    title: entry.title,
    description: entry.description,
    repository: repository ? { url: repository } : undefined,
    packages: dockerPackages(entry),
    remotes: dockerRemotes(entry, secrets),
  })
  const tags = entry.metadata?.tags ?? []

  return {
    server,
    text: [key, entry.title, entry.description, entry.metadata?.category, ...tags].join(" ").toLowerCase(),
    pulls: entry.metadata?.pulls ?? 0,
    stars: entry.metadata?.githubStars ?? 0,
  }
}

function dockerPackages(entry: DockerEntry) {
  if (entry.type !== "server" || !entry.image) return
  if ((entry.volumes ?? []).length > 0) return
  const command = (entry.command ?? []).map(String)

  if (command.some((arg) => arg.includes("{{"))) return
  const env = (entry.env ?? []).map((item) => dockerEnv(entry, item.name, item.value))

  if (env.some((item) => item === undefined)) return
  const secrets = (entry.secrets ?? []).map(
    (secret) =>
      new McpRegistry.Input({ name: secret.env, description: secret.description, isSecret: true, isRequired: true }),
  )

  return [
    new McpRegistry.Package({
      registryType: "oci",
      identifier: entry.image,
      transport: { type: "stdio" },
      environmentVariables: [...secrets, ...env.flatMap((item) => (item ? [item] : []))],
      packageArguments: command.map((value) => new McpRegistry.Argument({ type: "positional", value })),
    }),
  ]
}

/**
 * An env entry: a fixed value, a `{{server.setting}}` template turned into the registry's `{setting}` form, or, for a
 * value with braces of its own (such as JSON), a default the person can edit. Undefined when it cannot be set up.
 */
function dockerEnv(entry: DockerEntry, name: string, raw: unknown) {
  const value = raw === undefined || raw === null ? "" : String(raw)

  if (!value.includes("{")) return new McpRegistry.Input({ name, value })

  if (!value.includes("{{")) return new McpRegistry.Input({ name, default: value })
  const settings = [...value.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1].trim())

  if (settings.some((setting) => setting.includes("|"))) return
  const first = settings[0] ?? ""
  const setting = first.slice(first.indexOf(".") + 1)

  return new McpRegistry.Input({
    name,
    value: value.replace(
      /\{\{([^{}]+)\}\}/g,
      (_, path: string) => `{${path.trim().slice(path.trim().indexOf(".") + 1)}}`,
    ),
    description: configDescription(entry, setting),
    isRequired: (entry.config ?? []).some((config) => config.required?.includes(setting)),
  })
}

function configDescription(entry: DockerEntry, setting: string) {
  const property = (entry.config ?? []).map((config) => config.properties?.[setting]).find(Boolean)

  if (!property || typeof property !== "object" || !("description" in property)) return

  return typeof property.description === "string" ? property.description : undefined
}

function dockerRemotes(entry: DockerEntry, secrets: Set<string>) {
  const remote = entry.remote

  if (entry.type !== "remote" || !remote || remote.url.includes("$")) return
  const headers = Object.entries(remote.headers ?? {}).map(([name, value]) => {
    const referenced = [...value.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1])

    return new McpRegistry.Input({
      name,
      value: value.replace(/\$\{([A-Za-z0-9_]+)\}/g, "{$1}"),
      isSecret: referenced.some((variable) => secrets.has(variable)) || undefined,
      isRequired: referenced.length > 0 || undefined,
    })
  })

  return [new McpRegistry.Remote({ type: remote.transport_type ?? "streamable-http", url: remote.url, headers })]
}

/** Parses the catalog YAML with Bun's parser; the catalog is about 500 KB, too large to send to the page whole. */
export async function loadDocker() {
  const response = await fetch(DOCKER_CATALOG_URL, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) })

  if (!response.ok) throw new Error(`Docker MCP Catalog answered ${response.status}`)
  const servers = dockerServers(Bun.YAML.parse(await response.text()))

  if (servers.length === 0) throw new Error("The Docker MCP Catalog is empty")

  return servers
}

const decodeSkills = Schema.decodeUnknownSync(ExtensionCatalog.SkillsResponse)

/** skills.sh results as the API returns them; a missing install count is 0. */
export function skillsFromResponse(body: unknown) {
  return decodeSkills(body).skills.map(
    (skill) =>
      new ExtensionCatalog.Skill({
        id: skill.id,
        source: skill.source,
        skillId: skill.skillId,
        name: skill.name,
        installs: skill.installs ?? 0,
      }),
  )
}

/** Merges several result lists into one, each skill once, most installed first. */
export function mergeSkills(lists: readonly (readonly ExtensionCatalog.Skill[])[]) {
  const byId = new Map(lists.flat().map((skill) => [skill.id, skill]))

  return [...byId.values()].toSorted((a, b) => b.installs - a.installs)
}

/** How many popular skills the dialog lists; the merged searches return several hundred. */
const POPULAR_SKILL_LIMIT = 100

/** skills.sh rejects searches shorter than two characters, so those filter the popular list instead. */
export const SKILL_SEARCH_MIN = 2

export function filterSkills(skills: readonly ExtensionCatalog.Skill[], query: string) {
  const text = query.toLowerCase()

  return skills.filter((skill) => `${skill.name} ${skill.source}`.toLowerCase().includes(text))
}

export async function searchSkills(query: string) {
  const url = new URL(SKILLS_URL)
  url.searchParams.set("q", query)
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) throw new Error(`skills.sh answered ${response.status}`)

  return skillsFromResponse(await response.json())
}

export async function loadPopularSkills() {
  const lists = await Promise.all(POPULAR_SKILL_QUERIES.map((query) => searchSkills(query).catch(() => [])))
  const skills = mergeSkills(lists)

  if (skills.length === 0) throw new Error("skills.sh did not answer")

  return skills.slice(0, POPULAR_SKILL_LIMIT)
}

/** Keeps a successful load for an hour. A failure is dropped, so the next request tries again. */
export function cached<T>(load: () => Promise<T>) {
  const state: { at: number; value?: Promise<T> } = { at: 0 }

  return () => {
    if (state.value && Date.now() - state.at < CACHE_MS) return state.value
    const value = load()
    state.value = value
    state.at = Date.now()
    value.catch(() => {
      if (state.value === value) state.value = undefined
    })

    return value
  }
}

/** The global OpenCode skills folder, where `skills add -g -a opencode` writes. */
export function skillsDirectory(home: string, xdg = process.env.XDG_CONFIG_HOME) {
  return path.join(xdg || path.join(home, ".config"), "opencode", "skills")
}

/**
 * True when `target` is an entry directly inside `root`. A skill the CLI linked rather than copied is a link here, and
 * removing it removes the link, so the link itself is checked, not where it points.
 */
export async function insideFolder(root: string, target: string) {
  if (path.dirname(path.resolve(target)) !== path.resolve(root)) return false

  return fs.lstat(target).then(
    () => true,
    () => false,
  )
}

/** The end of a command's output, without color codes, for an error message. */
export function commandOutput(text: string) {
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").trim()

  return plain.length > OUTPUT_LIMIT ? plain.slice(-OUTPUT_LIMIT) : plain
}

/** The arguments for installing one skill globally for OpenCode, copied rather than linked. */
export function installArgs(input: ExtensionCatalog.SkillInstallInput) {
  return ["add", input.source, "--skill", input.skill, "-g", "-a", "opencode", "-y", "--copy"]
}

export function removeArgs(input: ExtensionCatalog.SkillRemoveInput) {
  return ["remove", input.skill, "-g", "-a", "opencode", "-y"]
}

/** Runs the skills CLI through npx, without a shell, from `cwd`, stopping it after two minutes. */
export async function runSkills(args: string[], cwd: string) {
  const child = await Promise.try(() =>
    Bun.spawn(["npx", "-y", SKILLS_CLI, ...args], {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: COMMAND_TIMEOUT_MS,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    }),
  ).catch(() => undefined)

  if (!child) return { ok: false, output: "Could not run npx. Install Node.js, then try again." }
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const output = commandOutput(`${stdout}\n${stderr}`)

  if (child.signalCode)
    return { ok: false, output: `${output}\nStopped after ${COMMAND_TIMEOUT_MS / 1000} seconds.`.trim() }

  return { ok: code === 0, output }
}

/** The folders in the skills folder, to tell whether an install added one. */
export async function skillFolders(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])

  return new Set(entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name))
}
