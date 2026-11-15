import type { ConfigEntry, PluginInfo, SkillInfo } from "@opencode/client/promise"

/**
 * Where an installed extension is set. Only `global`, the global config file that config updates edit, or the global
 * OpenCode skills folder, is AccessCode's to remove; anything else is removed where it is set.
 */
export type Origin = { type: "global"; path: string } | { type: "file"; path: string } | { type: "other" }

const OTHER: Origin = { type: "other" }

const SKILL_FOLDER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/

function trimSlash(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

function parent(path: string) {
  return path.slice(0, Math.max(path.lastIndexOf("/"), 0)) || "/"
}

function origin(path: string | undefined, folder: string): Origin {
  if (!path) return OTHER

  if (parent(path) === trimSlash(folder)) return { type: "global", path }

  return { type: "file", path }
}

type Document = Extract<ConfigEntry, { type: "document" }>

function documents(entries: readonly ConfigEntry[]) {
  return entries.filter((entry): entry is Document => entry.type === "document")
}

/** The file that sets an MCP server. Entries go from lowest to highest priority, so the last one that names it wins. */
export function mcpOrigin(name: string, entries: readonly ConfigEntry[], configFolder: string) {
  const document = documents(entries).findLast((entry) => entry.info.mcp?.servers?.[name] !== undefined)

  return document ? origin(document.path, configFolder) : OTHER
}

function keychainRefs(value: unknown) {
  return [...JSON.stringify(value ?? null).matchAll(/\{keychain:([^}"]+)\}/g)].map((match) => match[1])
}

/**
 * The Keychain items to delete with an MCP server removed from the file at `path`: the ones its config refers to as
 * {keychain:NAME} that no other server, in any config file, still refers to.
 */
export function mcpKeychain(name: string, entries: readonly ConfigEntry[], path: string) {
  const all = documents(entries)
  const removed = all.find((entry) => entry.path === path)?.info.mcp?.servers?.[name]
  const kept = new Set(
    all.flatMap((entry) =>
      Object.entries(entry.info.mcp?.servers ?? {}).flatMap(([server, config]) =>
        entry.path === path && server === name ? [] : keychainRefs(config),
      ),
    ),
  )

  return [...new Set(keychainRefs(removed))].filter((id) => !kept.has(id))
}

/** A plugin entry's package spec, as `plugins` lists it: a string, or an object with a package. */
function spec(item: unknown) {
  if (typeof item === "string") return item

  if (item && typeof item === "object" && "package" in item && typeof item.package === "string") return item.package

  return ""
}

/** The package name of a spec such as `name@1.2.0` or `@scope/name@beta`. */
export function packageName(value: string) {
  const at = value.indexOf("@", 1)

  return at === -1 ? value : value.slice(0, at)
}

/** The file that lists a package plugin, with the spec as written there, which is what removing it matches. */
export function pluginOrigin(plugin: PluginInfo, entries: readonly ConfigEntry[], configFolder: string) {
  if (plugin.source.type !== "package") return { origin: OTHER, spec: undefined }
  const name = packageName(plugin.source.target)
  const document = documents(entries).findLast((entry) =>
    (entry.info.plugins ?? []).some((item) => packageName(spec(item)) === name),
  )

  if (!document) return { origin: OTHER, spec: undefined }
  const written = (document.info.plugins ?? []).map(spec).find((item) => packageName(item) === name)

  return { origin: origin(document.path, configFolder), spec: written }
}

/** Where a skill's SKILL.md lives: in its own folder in the global skills folder, or elsewhere. */
export function skillOrigin(skill: Pick<SkillInfo, "path">, skillsFolder: string) {
  const root = `${trimSlash(skillsFolder)}/`

  if (!skill.path.startsWith("/")) return { origin: OTHER, folder: undefined }

  if (!skill.path.startsWith(root))
    return { origin: { type: "file", path: parent(skill.path) } as Origin, folder: undefined }
  const folder = skill.path.slice(root.length).split("/")[0] ?? ""

  if (!SKILL_FOLDER.test(folder)) return { origin: OTHER, folder: undefined }

  return { origin: { type: "global", path: `${root}${folder}` } as Origin, folder }
}

/** Where an MCP server runs, read from the config that sets it, in the words the Add dialog uses. */
export function mcpRuns(name: string, entries: readonly ConfigEntry[]) {
  const config = documents(entries).findLast((entry) => entry.info.mcp?.servers?.[name] !== undefined)?.info.mcp
    ?.servers?.[name]

  if (!config) return undefined

  if (config.type === "remote") return "remote" as const

  return config.command[0] === "docker" ? ("docker" as const) : ("local" as const)
}
