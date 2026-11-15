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

/** The groups the Apps and services tab shows, in order. The app names them. */
export const CATEGORIES = [
  "featured",
  "productivity",
  "design",
  "developer",
  "search",
  "automation",
  "business",
  "data",
  "media",
  "files",
  "other",
] as const
export type Category = (typeof CATEGORIES)[number]

/**
 * The servers the Popular list shows, in order within each category. A name is an official MCP Registry name, the
 * name of a server described below (such as Start Testing or a reference server), or `docker:<key>` for an entry of
 * the Docker MCP Catalog. Each was checked to load, to come from its real publisher or the canonical project, and to
 * need nothing, a browser sign-in, a key with a page to get one, or a plain value such as a folder.
 */
export const POPULAR: { name: string; category: Category }[] = [
  { name: "net.starttesting/mcp", category: "featured" },
  { name: "io.github.github/github-mcp-server", category: "featured" },
  { name: "com.notion/mcp", category: "featured" },
  { name: "io.github.upstash/context7", category: "featured" },
  { name: "io.github.modelcontextprotocol/filesystem", category: "featured" },

  { name: "app.linear/linear", category: "productivity" },
  { name: "com.atlassian/atlassian-mcp-server", category: "productivity" },
  { name: "com.monday/monday.com", category: "productivity" },
  { name: "com.airtable/mcp", category: "productivity" },
  { name: "net.todoist/mcp", category: "productivity" },
  { name: "io.sanity.www/mcp", category: "productivity" },

  { name: "com.figma.mcp/mcp", category: "design" },
  { name: "com.canva.mcp/mcp", category: "design" },
  { name: "io.github.miroapp/mcp-server", category: "design" },
  { name: "com.webflow/mcp", category: "design" },
  { name: "com.wix/mcp", category: "design" },
  { name: "accesscode.blender", category: "design" },

  { name: "com.gitlab/mcp", category: "developer" },
  { name: "io.github.getsentry/sentry-mcp", category: "developer" },
  { name: "com.vercel/vercel-mcp", category: "developer" },
  { name: "com.cloudflare.mcp/mcp", category: "developer" },
  { name: "com.supabase/mcp", category: "developer" },
  { name: "com.postman/postman-mcp-server", category: "developer" },
  { name: "dev.jam/jam", category: "developer" },
  { name: "io.github.ChromeDevTools/chrome-devtools-mcp", category: "developer" },
  { name: "io.github.vercel/next-devtools-mcp", category: "developer" },
  { name: "com.microsoft/microsoft-learn-mcp", category: "developer" },
  { name: "io.github.modelcontextprotocol/git", category: "developer" },
  { name: "io.github.oraios/serena", category: "developer" },
  { name: "io.github.containers/kubernetes-mcp-server", category: "developer" },
  { name: "io.github.hashicorp/terraform-mcp-server", category: "developer" },
  { name: "accesscode.azure", category: "developer" },
  { name: "accesscode.aws-documentation", category: "developer" },
  { name: "docker:node-code-sandbox", category: "developer" },
  { name: "io.github.modelcontextprotocol/everything", category: "developer" },

  { name: "docker:duckduckgo", category: "search" },
  { name: "docker:wikipedia-mcp", category: "search" },
  { name: "io.github.modelcontextprotocol/fetch", category: "search" },
  { name: "io.github.brave/brave-search-mcp-server", category: "search" },
  { name: "ai.exa/exa", category: "search" },
  { name: "io.github.firecrawl/firecrawl-mcp-server", category: "search" },
  { name: "io.github.tavily-ai/tavily-mcp", category: "search" },
  { name: "ai.perplexity/mcp-server", category: "search" },
  { name: "com.wolfram/mcp", category: "search" },
  { name: "co.huggingface/hf-mcp-server", category: "search" },
  { name: "docker:mcp-hackernews", category: "search" },
  { name: "docker:paper-search", category: "search" },

  { name: "io.github.microsoft/playwright-mcp", category: "automation" },
  { name: "com.zapier/mcp", category: "automation" },
  { name: "com.make/mcp-server", category: "automation" },
  { name: "com.apify/apify-mcp-server", category: "automation" },
  { name: "io.github.browserbase/mcp-server-browserbase", category: "automation" },
  { name: "io.github.wonderwhy-er/desktop-commander", category: "automation" },

  { name: "com.stripe/mcp", category: "business" },
  { name: "com.paypal.mcp/mcp", category: "business" },

  { name: "com.neon/mcp", category: "data" },
  { name: "io.prisma/mcp", category: "data" },
  { name: "io.github.PostHog/mcp", category: "data" },
  { name: "io.github.grafana/mcp-grafana", category: "data" },
  { name: "com.newrelic/mcp-server", category: "data" },
  { name: "io.github.mongodb-js/mongodb-mcp-server", category: "data" },
  { name: "io.github.redis/mcp-redis", category: "data" },
  { name: "io.github.ClickHouse/mcp-clickhouse", category: "data" },
  { name: "accesscode.sqlite", category: "data" },
  { name: "accesscode.postgres", category: "data" },

  { name: "io.elevenlabs/mcp", category: "media" },
  { name: "docker:youtube_transcript", category: "media" },

  { name: "io.github.modelcontextprotocol/memory", category: "files" },
  { name: "accesscode.markitdown", category: "files" },
  { name: "accesscode.excel", category: "files" },
  { name: "io.github.modelcontextprotocol/time", category: "files" },
  { name: "io.github.modelcontextprotocol/sequentialthinking", category: "files" },
]

/** The Docker MCP Catalog's categories, in the groups the tab shows. Anything else is `other`. */
const DOCKER_CATEGORIES: Record<string, Category> = {
  devops: "developer",
  development: "developer",
  "developer-tools": "developer",
  devtools: "developer",
  code: "developer",
  tools: "developer",
  security: "developer",
  productivity: "productivity",
  documentation: "productivity",
  knowledge: "productivity",
  communication: "productivity",
  messaging: "productivity",
  database: "data",
  "data-analytics": "data",
  analytics: "data",
  monitoring: "data",
  "data-visualization": "data",
  search: "search",
  news: "search",
  maps: "search",
  geospatial: "search",
  travel: "search",
  ai: "media",
  "ai-ml": "media",
  video: "media",
  finance: "business",
  payments: "business",
  crm: "business",
  business: "business",
  commerce: "business",
  "cost-management": "business",
  automation: "automation",
}

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
    reference({
      slug: "everything",
      title: "Everything",
      description: "A test server with one of every MCP feature, for trying things out.",
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-everything",
    }),
  ]
}

/**
 * Servers the registry does not list, or lists only in a form AccessCode cannot run, described here: Start Testing,
 * and well-known servers that run on the Mac with npx or uvx.
 */
export function describedServers(home: string) {
  const local = (input: {
    slug: string
    title: string
    description: string
    website: string
    registryType: "npm" | "pypi"
    identifier: string
    packageArguments?: McpRegistry.Argument[]
    environmentVariables?: McpRegistry.Input[]
  }) =>
    new McpRegistry.Server({
      name: `accesscode.${input.slug}`,
      title: input.title,
      description: input.description,
      websiteUrl: input.website,
      packages: [
        new McpRegistry.Package({
          registryType: input.registryType,
          identifier: input.identifier,
          transport: { type: "stdio" },
          packageArguments: input.packageArguments,
          environmentVariables: input.environmentVariables,
        }),
      ],
    })
  const fixed = (...values: string[]) => values.map((value) => new McpRegistry.Argument({ type: "positional", value }))

  return [
    new McpRegistry.Server({
      name: "net.starttesting/mcp",
      title: "Start Testing",
      description: "Track bugs, feedback and test sessions for your apps in Start Testing.",
      websiteUrl: "https://starttesting.net",
      remotes: [new McpRegistry.Remote({ type: "streamable-http", url: "https://mcp.starttesting.net" })],
    }),
    local({
      slug: "markitdown",
      title: "MarkItDown",
      description:
        "Turns PDFs, Word, Excel and PowerPoint files and web pages into text the AI can read. By Microsoft.",
      website: "https://github.com/microsoft/markitdown",
      registryType: "pypi",
      identifier: "markitdown-mcp",
    }),
    local({
      slug: "excel",
      title: "Excel",
      description: "Reads and edits Excel workbooks on your Mac, without Excel installed.",
      website: "https://github.com/haris-musa/excel-mcp-server",
      registryType: "pypi",
      identifier: "excel-mcp-server",
      packageArguments: fixed("stdio"),
    }),
    local({
      slug: "blender",
      title: "Blender",
      description: "Lets the AI build and change 3D scenes in Blender. Needs the Blender MCP add-on in Blender.",
      website: "https://github.com/ahujasid/blender-mcp",
      registryType: "pypi",
      identifier: "blender-mcp",
    }),
    local({
      slug: "azure",
      title: "Azure",
      description: "Manages your Azure resources. Sign in with the Azure command line tool first.",
      website: "https://github.com/microsoft/mcp",
      registryType: "npm",
      identifier: "@azure/mcp",
      packageArguments: fixed("server", "start"),
    }),
    local({
      slug: "aws-documentation",
      title: "AWS Documentation",
      description: "Searches and reads the AWS documentation. By AWS Labs.",
      website: "https://github.com/awslabs/mcp",
      registryType: "pypi",
      identifier: "awslabs.aws-documentation-mcp-server",
    }),
    local({
      slug: "sqlite",
      title: "SQLite",
      description: "Reads and changes a SQLite database file on your Mac.",
      website: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite",
      registryType: "pypi",
      identifier: "mcp-server-sqlite",
      packageArguments: [
        new McpRegistry.Argument({
          type: "named",
          name: "--db-path",
          valueHint: "Database file",
          description: "The database file to use. It is created if it does not exist.",
          default: path.join(home, "database.sqlite"),
          isRequired: true,
        }),
      ],
    }),
    local({
      slug: "postgres",
      title: "Postgres",
      description: "Reads, tunes and changes a PostgreSQL database. By Crystal DBA.",
      website: "https://github.com/crystaldba/postgres-mcp",
      registryType: "pypi",
      identifier: "postgres-mcp",
      environmentVariables: [
        new McpRegistry.Input({
          name: "DATABASE_URI",
          description: "The database address, such as postgresql://user:password@localhost:5432/name.",
          isRequired: true,
          isSecret: true,
        }),
      ],
    }),
  ]
}

const LatestResponse = Schema.Struct({ server: McpRegistry.Server })

const decodeLatest = Schema.decodeUnknownOption(LatestResponse)

/** At most this many registry requests run at once; the registry refuses bursts. */
const REGISTRY_CONCURRENCY = 8

/**
 * The popular servers that load, in list order, and the category of each. Registry servers are fetched, described
 * ones are built here, and Docker entries come from the Docker MCP Catalog, which is left out when it does not load.
 */
export async function loadPopular(home: string, docker: () => Promise<DockerServer[]>) {
  const described = new Map(
    [...referenceServers(home), ...describedServers(home)].map((server) => [server.name, server]),
  )
  const catalog = await docker().catch(() => [] as DockerServer[])
  const queue = POPULAR.filter((entry) => !described.has(entry.name) && !entry.name.startsWith("docker:"))
  const fetched = new Map<string, McpRegistry.Server>()

  await Promise.all(
    Array.from({ length: REGISTRY_CONCURRENCY }, async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        const server = await fetchLatest(entry.name)
        if (server) fetched.set(entry.name, server)
      }
    }),
  )

  // Nothing loading means the registry is unreachable; failing keeps that out of the cache so Retry tries again.
  if (fetched.size === 0) throw new Error("The MCP Registry did not answer")
  const found = POPULAR.flatMap((entry) => {
    const server = entry.name.startsWith("docker:")
      ? catalog.find((item) => item.server.name === entry.name.slice("docker:".length))?.server
      : (described.get(entry.name) ?? fetched.get(entry.name))

    return server ? [{ server, category: entry.category }] : []
  })

  return new McpRegistry.SearchResult({
    servers: found.map((item) => item.server),
    categories: Object.fromEntries(found.map((item) => [item.server.name, item.category])),
  })
}

async function fetchLatest(name: string) {
  const response = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}/versions/latest`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined)

  if (!response?.ok) return
  const decoded = decodeLatest(await response.json().catch(() => undefined))

  return decoded._tag === "Some" ? decoded.value.server : undefined
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
export type DockerServer = {
  server: McpRegistry.Server
  text: string
  pulls: number
  stars: number
  category: Category
}

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

/** The search result for the Docker MCP Catalog, with each server's category. */
export function dockerResult(servers: readonly DockerServer[], search: string | undefined) {
  const found = searchDocker(servers, search)
  const categories = new Map(servers.map((item) => [item.server.name, item.category]))

  return new McpRegistry.SearchResult({
    servers: found,
    categories: Object.fromEntries(found.map((server) => [server.name, categories.get(server.name) ?? "other"])),
  })
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
    category: DOCKER_CATEGORIES[entry.metadata?.category ?? ""] ?? "other",
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

/** Like `cached`, for a load that takes a key, such as a URL. */
export function cachedBy<T>(load: (key: string) => Promise<T>) {
  const entries = new Map<string, () => Promise<T>>()

  return (key: string) => {
    const entry = entries.get(key) ?? cached(() => load(key))
    entries.set(key, entry)

    return entry()
  }
}

/** GitHub's remote MCP server, which signs in with AccessCode's registered GitHub OAuth app. */
export const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"

/**
 * Whether this server can complete a GitHub sign-in: the GitHub MCP entry refers to the app's client secret as
 * {env:ACCESSCODE_GITHUB_CLIENT_SECRET}, which the desktop app sets for the server it starts.
 */
export function githubSignIn(env: Record<string, string | undefined> = process.env) {
  return !!env.ACCESSCODE_GITHUB_CLIENT_SECRET
}

/** Folders that hold Node.js, uv and Docker on a Mac when a desktop app's PATH leaves them out. */
export function toolFolders(home: string) {
  // uv's installer puts uvx in ~/.local/bin.
  return ["/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local", "bin")]
}

/** Which programs local MCP servers and skills run with are installed. Only looks for files; runs nothing. */
export function findTools(home: string, search = process.env.PATH ?? "") {
  const PATH = [search, ...toolFolders(home)].filter(Boolean).join(":")
  const has = (name: string) => Bun.which(name, { PATH }) !== null

  return { node: has("npx"), uv: has("uvx"), docker: has("docker") }
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

  if (!child) return { ok: false, output: "Skills need Node.js. Install it from nodejs.org, then try again." }
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const output = commandOutput(`${stdout}\n${stderr}`)

  if (child.signalCode)
    return { ok: false, output: `${output}\nStopped after ${COMMAND_TIMEOUT_MS / 1000} seconds.`.trim() }

  return { ok: code === 0, output: code === 0 ? output : explain(output) }
}

/** A failed command's output, led by a plain sentence when the cause is a common one. */
export function explain(output: string) {
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network/i.test(output))
    return `Could not reach the internet. Check your connection, then try again.\n${output}`.trim()

  return output
}

/** The folders in the skills folder, to tell whether an install added one. */
export async function skillFolders(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])

  return new Set(entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name))
}
