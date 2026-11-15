import { Schema } from "effect"
import { githubRepo, loadEcosystem, resolvePackage, validPackageName } from "./ecosystem"

const AWESOME_URL = "https://raw.githubusercontent.com/awesome-opencode/awesome-opencode/main/README.md"

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search"

const KEYWORD = "keywords:opencode-plugin"

const TIMEOUT_MS = 15_000

/** Where a plugin is listed, in the order a row names its first source. */
export type PluginSource = "docs" | "awesome" | "npm"

/** One plugin, merged from every list that names it. `pkg` is its npm package when one is known to be its own. */
export type CatalogPlugin = {
  name: string
  description: string
  url: string
  pkg?: string
  sources: PluginSource[]
  downloads?: number
}

/** A plugin as one list describes it, before merging. */
type Listed = Omit<CatalogPlugin, "sources"> & { source: PluginSource }

/**
 * Reads the plugins section of the awesome-opencode README: each plugin is a `<details>` block whose summary holds
 * the name and a short description, and whose blockquote holds the long description and the repository link.
 */
export function parseAwesome(markdown: string) {
  const start = markdown.search(/<summary><strong>[^<]*PLUGINS<\/strong><\/summary>/i)

  if (start === -1) return []
  const rest = markdown.slice(start + 1)
  const next = rest.search(/<summary><strong>/i)
  const section = next === -1 ? rest : rest.slice(0, next)
  const blocks = section.matchAll(
    /<summary><b>([\s\S]*?)<\/b>([\s\S]*?)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>/gi,
  )

  return [...blocks].flatMap((match) => {
    const name = plain(match[1])
    const short = /<i>([\s\S]*?)<\/i>/i.exec(match[2])?.[1]
    const body = match[3]
    const repository = /<a href="([^"]+)">[^<]*<b>View Repository<\/b><\/a>/i.exec(body)?.[1]
    const url = repository ?? /<a href="([^"]+)"/i.exec(body)?.[1]

    if (!name || !url) return []
    const long = plain(body.split(/<br\s*\/?>\s*<br\s*\/?>/i)[0] ?? "")
    const npm = /npmjs\.com\/package\/((?:@[\w.~-]+\/)?[\w.~-]+)/i.exec(body)?.[1]

    return [{ name, url, description: long || plain(short ?? ""), npm }]
  })
}

/** Text without tags, entities decoded and whitespace collapsed. */
function plain(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

const NpmSearch = Schema.Struct({
  objects: Schema.Struct({
    package: Schema.Struct({
      name: Schema.String,
      description: Schema.String.pipe(Schema.optionalKey),
      links: Schema.Struct({
        npm: Schema.String.pipe(Schema.optionalKey),
        repository: Schema.String.pipe(Schema.optionalKey),
        homepage: Schema.String.pipe(Schema.optionalKey),
      }).pipe(Schema.optionalKey),
    }),
    downloads: Schema.Struct({ weekly: Schema.Number.pipe(Schema.optionalKey) }).pipe(Schema.optionalKey),
  }).pipe(Schema.Array),
})

const decodeNpmSearch = Schema.decodeUnknownSync(NpmSearch)

/** The packages of an npm search, most downloaded first. Their names are real npm names, so each can be installed. */
export function npmPlugins(body: unknown): Listed[] {
  return decodeNpmSearch(body)
    .objects.flatMap((item) => {
      const name = item.package.name

      if (!validPackageName(name)) return []
      const links = item.package.links

      return [
        {
          name,
          pkg: name,
          description: item.package.description ?? "",
          url: repositoryUrl(links?.repository) ?? links?.npm ?? `https://www.npmjs.com/package/${name}`,
          downloads: item.downloads?.weekly ?? 0,
          source: "npm" as const,
        },
      ]
    })
    .toSorted((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
}

/**
 * Merges the lists into one row per plugin. Rows match by npm package, then by GitHub repository, so a plugin the docs
 * list by repository joins the npm package that points back at it. Two packages from one repository stay two rows.
 * Most downloaded first; the rest keep list order.
 */
export function mergePlugins(lists: readonly (readonly Listed[])[]) {
  const rows: CatalogPlugin[] = []
  const index = new Map<string, CatalogPlugin[]>()
  const keys = (item: { pkg?: string; url: string }) => {
    const repo = githubRepo(item.url)

    return [item.pkg && `pkg:${item.pkg}`, repo && `repo:${repo}`, `url:${item.url}`].filter(
      (key): key is string => !!key,
    )
  }
  const remember = (row: CatalogPlugin) =>
    keys(row).forEach((key) => {
      const list = index.get(key) ?? []
      if (!list.includes(row)) index.set(key, [...list, row])
    })

  lists.flat().forEach((item) => {
    const found = keys(item)
      .flatMap((key) => index.get(key) ?? [])
      .find((row) => !row.pkg || !item.pkg || row.pkg === item.pkg)

    if (!found) {
      const row: CatalogPlugin = {
        name: item.name,
        description: item.description,
        url: item.url,
        pkg: item.pkg,
        sources: [item.source],
        downloads: item.downloads,
      }
      rows.push(row)
      remember(row)

      return
    }
    if (!found.sources.includes(item.source)) found.sources.push(item.source)
    found.pkg ??= item.pkg
    if (item.downloads !== undefined) found.downloads = Math.max(found.downloads ?? 0, item.downloads)
    if (!found.description) found.description = item.description
    remember(found)
  })

  return rows
    .map((row, order) => ({ row, order }))
    .toSorted((a, b) => (b.row.downloads ?? -1) - (a.row.downloads ?? -1) || a.order - b.order)
    .map((item) => item.row)
}

/** Adds the packages an npm search found to plugins already merged, keeping each plugin once. */
export function withSearchResults(plugins: readonly CatalogPlugin[], found: readonly Listed[]) {
  return mergePlugins([
    plugins.flatMap(({ sources, ...plugin }) => sources.map((source) => ({ ...plugin, source }))),
    found,
  ])
}

/** The plugins whose name, package or description contains every word of the query. */
export function filterPlugins(plugins: readonly CatalogPlugin[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return plugins.filter((plugin) => {
    const text = `${plugin.name} ${plugin.pkg ?? ""} ${plugin.description}`.toLowerCase()

    return words.every((word) => text.includes(word))
  })
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  return response.json()
}

/** npm packages tagged `opencode-plugin`, optionally matching a search. */
export async function searchNpm(query: string, size: number, signal?: AbortSignal) {
  const url = new URL(NPM_SEARCH_URL)
  url.searchParams.set("text", query ? `${query} ${KEYWORD}` : KEYWORD)
  url.searchParams.set("size", String(size))

  return npmPlugins(await fetchJson(url.toString(), signal))
}

/**
 * The awesome-opencode plugins with their npm packages: the package the npm search already lists for the same
 * repository, else the first candidate whose package points back at the repository.
 */
async function loadAwesome(npm: readonly Listed[]): Promise<Listed[]> {
  const response = await fetch(AWESOME_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const byRepo = new Map(
    npm.flatMap((item) => (item.pkg && githubRepo(item.url) ? [[githubRepo(item.url), item]] : [])),
  )

  return Promise.all(
    parseAwesome(await response.text()).map(async (plugin) => {
      const known = byRepo.get(githubRepo(plugin.url))

      if (known) return { ...plugin, pkg: known.pkg, source: "awesome" as const }
      const candidates = [plugin.npm, plugin.name.toLowerCase(), plugin.url.split("/").pop()?.toLowerCase()]
      const pkg = await firstPackage(
        [...new Set(candidates)].flatMap((name) => (name ? [name] : [])),
        plugin.url,
      )

      return { name: plugin.name, url: plugin.url, description: plugin.description, pkg, source: "awesome" as const }
    }),
  )
}

async function firstPackage(names: string[], url: string): Promise<string | undefined> {
  const [name, ...rest] = names

  if (!name) return
  const found = await resolvePackage(name, url).catch(() => undefined)

  return found ?? firstPackage(rest, url)
}

export type PluginCatalog = { plugins: CatalogPlugin[]; failed: PluginSource[] }

const cache: { catalog?: Promise<PluginCatalog> } = {}

/**
 * Every plugin list, merged, fetched once per session. A list that fails is named in `failed` and the others still
 * show; when all fail, the load fails and is not cached.
 */
export function loadPluginCatalog() {
  if (cache.catalog) return cache.catalog
  const catalog = fetchCatalog()
  cache.catalog = catalog
  catalog.then(
    (value) => {
      if (value.failed.length > 0 && cache.catalog === catalog) cache.catalog = undefined
    },
    () => {
      if (cache.catalog === catalog) cache.catalog = undefined
    },
  )

  return catalog
}

async function fetchCatalog(): Promise<PluginCatalog> {
  const npm = searchNpm("", 250)
  const [docs, awesome, packages] = await Promise.allSettled([
    loadEcosystem(),
    npm.catch(() => []).then((list) => loadAwesome(list)),
    npm,
  ])
  const failed = [
    docs.status === "rejected" ? "docs" : undefined,
    awesome.status === "rejected" ? "awesome" : undefined,
    packages.status === "rejected" ? "npm" : undefined,
  ].filter((source): source is PluginSource => !!source)

  if (failed.length === 3) throw new Error("No plugin list loaded")
  const listed = (result: PromiseSettledResult<readonly Listed[]>) =>
    result.status === "fulfilled" ? result.value : []
  const fromDocs =
    docs.status === "fulfilled" ? docs.value.map((plugin) => ({ ...plugin, source: "docs" as const })) : []

  return { plugins: mergePlugins([fromDocs, listed(awesome), listed(packages)]), failed }
}

/** npm repository links often look like "git+https://github.com/owner/repo.git", which a browser cannot open. */
export function repositoryUrl(url: string | undefined) {
  if (!url) return undefined
  const web = url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "")

  return web.startsWith("https://") || web.startsWith("http://") ? web : undefined
}
