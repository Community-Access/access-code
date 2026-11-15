import { Config } from "@opencode/core/config"
import { ShellSelect } from "@opencode/core/shell/select"
import path from "node:path"
import { ExtensionCatalog } from "@opencode/schema/extension-catalog"
import { McpRegistry } from "@opencode/schema/mcp-registry"
import { Global } from "@opencode/util/global"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import {
  cached,
  cachedBy,
  dockerResult,
  filterSkills,
  findTools,
  GITHUB_MCP_URL,
  githubSignIn,
  insideFolder,
  installArgs,
  loadDocker,
  loadPopular,
  loadPopularSkills,
  removeArgs,
  runSkills,
  searchSkills,
  skillFolders,
  SKILL_SEARCH_MIN,
  skillsDirectory,
} from "../extension-catalog"

// Shared across requests, so the dialog opens quickly after the first load.
const docker = cached(loadDocker)
const popularSkills = cached(loadPopularSkills)
const signIn = cachedBy(async (url) => {
  // The MCP SDK loads only when a sign-in is checked, as it does in core.
  const { McpOAuth } = await import("@opencode/core/mcp/oauth")

  return McpOAuth.probeSignIn(url)
})

export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>
  Effect.gen(function* () {
    const global = yield* Global.Service
    const skills = skillsDirectory(global.home)
    const popular = cached(() => loadPopular(global.home, docker))
    return handlers
      .handle("config.get", () => Config.Service.use((config) => config.entries()))
      .handle(
        "config.update",
        Effect.fn(function* (ctx) {
          const config = yield* Config.Service
          if (!config.update) return yield* Effect.die(new Error("Config updates are unavailable"))
          return yield* config.update(ctx.payload).pipe(Effect.orDie)
        }),
      )
      .handle(
        "config.mcpRegistry",
        Effect.fn(function* (ctx) {
          const url = new URL("https://registry.modelcontextprotocol.io/v0/servers")
          url.searchParams.set("version", "latest")
          url.searchParams.set("limit", "30")
          if (ctx.query.search) url.searchParams.set("search", ctx.query.search)
          if (ctx.query.cursor) url.searchParams.set("cursor", ctx.query.cursor)
          // The registry does not allow browser requests, so the server fetches it for the Extensions page.
          const body = yield* Effect.tryPromise(() =>
            fetch(url, { signal: AbortSignal.timeout(15_000) }).then((res) => res.json()),
          ).pipe(Effect.orDie)
          const decoded = yield* Schema.decodeUnknownEffect(McpRegistry.Response)(body).pipe(Effect.orDie)
          return new McpRegistry.SearchResult({
            servers: decoded.servers.map((item) => item.server),
            nextCursor: decoded.metadata?.nextCursor,
          })
        }),
      )
      .handle(
        "config.mcpPopular",
        Effect.fn(function* () {
          return yield* Effect.tryPromise(() => popular()).pipe(Effect.orDie)
        }),
      )
      .handle(
        "config.mcpDocker",
        Effect.fn(function* (ctx) {
          const servers = yield* Effect.tryPromise(() => docker()).pipe(Effect.orDie)
          return dockerResult(servers, ctx.query.search)
        }),
      )
      .handle(
        "config.skillSearch",
        Effect.fn(function* (ctx) {
          const search = ctx.query.search?.trim()
          const found = yield* Effect.tryPromise(async () => {
            if (search && search.length >= SKILL_SEARCH_MIN) return searchSkills(search)
            const listed = await popularSkills()
            return search ? filterSkills(listed, search) : listed
          }).pipe(Effect.orDie)
          return new ExtensionCatalog.SkillSearchResult({ skills: found })
        }),
      )
      .handle(
        "config.skillInstall",
        Effect.fn(function* (ctx) {
          const before = yield* Effect.promise(() => skillFolders(skills))
          const result = yield* Effect.promise(() => runSkills(installArgs(ctx.payload), global.home))
          if (!result.ok) return new ExtensionCatalog.CommandResult(result)
          const after = yield* Effect.promise(() => skillFolders(skills))
          // The CLI can finish without installing anything, for example when the repository has no skill by that name.
          const added = [...after].some((name) => !before.has(name)) || after.has(ctx.payload.skill)
          if (added) return new ExtensionCatalog.CommandResult(result)
          return new ExtensionCatalog.CommandResult({
            ok: false,
            output: `${result.output}\nNo skill was added to ${skills}.`.trim(),
          })
        }),
      )
      .handle(
        "config.skillRemove",
        Effect.fn(function* (ctx) {
          const target = path.join(skills, ctx.payload.skill)
          // Only a skill in the global OpenCode skills folder is AccessCode's to remove.
          if (!(yield* Effect.promise(() => insideFolder(skills, target))))
            return new ExtensionCatalog.CommandResult({ ok: false, output: `${target} is not an installed skill.` })
          const result = yield* Effect.promise(() => runSkills(removeArgs(ctx.payload), global.home))
          const left = yield* Effect.promise(() => skillFolders(skills))
          if (!left.has(ctx.payload.skill)) return new ExtensionCatalog.CommandResult({ ...result, ok: true })
          return new ExtensionCatalog.CommandResult({
            ok: false,
            output: `${result.output}\n${target} is still there.`.trim(),
          })
        }),
      )
      .handle(
        "config.mcpSignIn",
        Effect.fn(function* (ctx) {
          // Only https servers are checked; remote MCP servers that sign in use https.
          const url = URL.parse(ctx.query.url)
          if (url?.protocol !== "https:") return new ExtensionCatalog.SignIn({ supported: false })
          // GitHub has no client registration, so its sign-in works only with AccessCode's own client secret.
          if (url.href === GITHUB_MCP_URL) return new ExtensionCatalog.SignIn({ supported: githubSignIn() })
          const supported = yield* Effect.promise(() =>
            signIn(url.href).then(
              (kind) => kind === "browser",
              () => false,
            ),
          )
          return new ExtensionCatalog.SignIn({ supported })
        }),
      )
      .handle("config.tools", () => Effect.succeed(new ExtensionCatalog.Tools(findTools(global.home))))
      .handle("config.extensionPaths", () =>
        Effect.succeed(new ExtensionCatalog.Paths({ config: global.config, skills })),
      )
      .handle(
        "config.shells",
        Effect.fn(function* () {
          const shell = yield* ShellSelect.Service
          if (!shell.list) return yield* Effect.die(new Error("Shell discovery is unavailable"))
          return yield* shell.list()
        }),
      )
  }),
)
