const ECOSYSTEM_URL =
  "https://raw.githubusercontent.com/anomalyco/opencode/dev/services/site/src/docs/v1/content/ecosystem.mdx"

const NPM_URL = "https://registry.npmjs.org"

const NPM_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

const TIMEOUT_MS = 15_000

/** A community plugin from the OpenCode docs. `pkg` is its npm package when the package points back at the repo. */
export type EcosystemPlugin = { name: string; url: string; description: string; pkg?: string }

/**
 * Reads the rows of the markdown table under `## Plugins`. Each row's first cell is a `[name](link)`; rows without a
 * link are skipped.
 */
export function parseEcosystem(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+Plugins\s*$/.test(line.trim()))

  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^##\s/.test(line.trim()))

  return (end === -1 ? rest : rest.slice(0, end)).flatMap((line) => {
    const row = line.trim()

    if (!row.startsWith("|")) return []
    const cells = splitRow(row)
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(cells[0] ?? "")

    if (!link) return []

    return [{ name: link[1].trim(), url: link[2], description: (cells[1] ?? "").trim() }]
  })
}

/** Splits a table row on pipes that are not escaped as `\|`. */
function splitRow(row: string) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"))
}

/** `owner/repo` of a GitHub URL or npm repository field, lowercased, or undefined when it is not on GitHub. */
export function githubRepo(value: string) {
  const trimmed = value.trim()
  const shorthand = /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(trimmed)
  const url = /github\.com[/:]([\w.-]+)\/([\w.-]+)/.exec(trimmed)
  const match = url ?? shorthand

  if (!match) return

  return `${match[1]}/${match[2].replace(/\.git$/, "")}`.toLowerCase()
}

/** The npm `repository` field, which is a string or an object with a url. */
export function repositoryUrl(repository: unknown) {
  if (typeof repository === "string") return repository

  if (repository && typeof repository === "object" && "url" in repository && typeof repository.url === "string")
    return repository.url

  return undefined
}

/** True when the npm package's repository is the same GitHub repo as the plugin's link. */
export function sameRepo(link: string, repository: unknown) {
  const expected = githubRepo(link)
  const url = repositoryUrl(repository)

  if (!expected || !url) return false

  return githubRepo(url) === expected
}

export function validPackageName(name: string) {
  return NPM_NAME.test(name)
}

const cache: { list?: Promise<EcosystemPlugin[]> } = {}

/** The community plugins with their npm packages resolved, fetched once per session. A failure is not cached. */
export function loadEcosystem() {
  if (cache.list) return cache.list
  const list = fetchEcosystem().catch((error: unknown) => {
    cache.list = undefined
    throw error
  })
  cache.list = list

  return list
}

async function fetchEcosystem() {
  const response = await fetch(ECOSYSTEM_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const plugins = parseEcosystem(await response.text())

  return Promise.all(
    plugins.map(async (plugin) => ({
      ...plugin,
      pkg: await resolvePackage(plugin.name, plugin.url).catch(() => undefined),
    })),
  )
}

/** Accepts the link text as the npm package only when that package says it comes from the same GitHub repo. */
export async function resolvePackage(name: string, link: string) {
  if (!validPackageName(name)) return
  const response = await fetch(`${NPM_URL}/${name.replace("/", "%2f")}/latest`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) return
  const manifest: unknown = await response.json()

  if (!manifest || typeof manifest !== "object" || !("repository" in manifest)) return

  return sameRepo(link, manifest.repository) ? name : undefined
}

/** A package name with an optional version or tag, such as `opencode-pty`, `@scope/name@1.2.0` or `name@beta`. */
export function validPluginSpec(spec: string) {
  const at = spec.indexOf("@", 1)
  const name = at === -1 ? spec : spec.slice(0, at)
  const version = at === -1 ? undefined : spec.slice(at + 1)

  return validPackageName(name) && (version === undefined || /^[^\s@]+$/.test(version))
}
