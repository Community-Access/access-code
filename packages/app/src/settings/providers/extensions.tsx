import type { McpServer, PluginInfo, SkillInfo } from "@opencode/client/promise"
import { Component, For, Show, createEffect, createMemo, createResource, on, onCleanup, type JSX } from "solid-js"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { Tabs } from "@opencode/ui/tabs"
import { TruncatedText } from "@opencode/ui/truncated-text"
import { useLanguage } from "@/runtime/i18n/language"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import { useMcpController } from "@/providers/connect/mcp"
import { mcpRowView } from "@/providers/connect/mcp-machine"
import { DialogMcp } from "@/providers/connect/mcp-dialog"
import { ExtensionPlugins } from "@/runtime/plugin/extension-plugins"
import { pluginLabel } from "@/providers/catalog/plugin"
import { usePlatform } from "@/runtime/platform/platform"
import { SettingsList } from "@/settings/list"
import { createExtensionLoad, ExtensionLoadFailed } from "@/settings/extension-load"
import type { SettingsView } from "@/settings/surface"
import { DialogAddExtension } from "./add-extension/dialog"
import { serverSlug, serverTitle } from "./add-extension/mcp-plan"
import { ConsoleName, ConsoleReplaced, createConsoleSources } from "./console-link"
import { mcpKeychain, mcpOrigin, mcpRuns, pluginOrigin, skillOrigin, type Origin } from "./extension-origin"
import { DialogRemoveExtension, RemoveFailed } from "./remove-dialog"
import "@/settings/settings.css"
import "@/shell/search-list.css"

type Section = "mcps" | "plugins" | "skills"

/** The Add dialog tab that matches each Extensions tab. */
const ADD_TABS = { mcps: "registry", plugins: "plugins", skills: "skills", lsps: "registry" } as const

/** How long after adding a server its Sign in button may still take focus. */
const SIGN_IN_WAIT_MS = 30_000

/** The folder that holds a file, so a settings file's name is not shown. */
function folder(path: string) {
  return path.slice(0, Math.max(path.lastIndexOf("/"), 0)) || path
}

const RUNS = {
  local: "settings.extensions.runs.local",
  remote: "settings.extensions.runs.remote",
  docker: "settings.extensions.runs.docker",
} as const

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  disabled: "mcp.status.disabled",
} as const

export const SettingsExtensions: Component<{
  directory?: string
  subtab?: SettingsView["subtab"]
  onSubtab: (value: SettingsView["subtab"]) => void
  headerAction?: JSX.Element
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  // AccessCode: servers are saved under short names like "notion". Show the real name, "Notion", from the popular
  // list the Add dialog uses, and a tidied name for anything else, so VoiceOver never reads "Remove notion".
  const [popular] = createResource(() =>
    serverSdk.api.experimental.config.mcpPopular().catch(() => ({ servers: [] as { name: string; title?: string }[] })),
  )
  const titles = createMemo(
    () => new Map((popular()?.servers ?? []).map((server) => [serverSlug(server.name), serverTitle(server)] as const)),
  )
  const mcpTitle = (name: string) => titles().get(name) ?? serverTitle({ name })
  const data = useData()
  const dialog = useDialog()
  const platform = usePlatform()
  // MCP connections are per Location, so read and toggle them where the active session runs, as the TUI does. The
  // names come from the default Location so this page lists only the servers available to all projects.
  const location = () => (props.directory ? { directory: props.directory } : data.location.default())
  const mcp = useMcpController(() => props.directory)

  // The synced lists follow mcp.status.changed, so a finished sign-in shows up without a refetch.
  createEffect(() => {
    if (serverSdk.connection.status() !== "connected") return
    void data.location.mcp.server.sync(data.location.default()).catch(() => undefined)

    if (props.directory) void data.location.mcp.server.sync(location()).catch(() => undefined)
  })

  const mcps = createMemo(() => {
    const active = data.location.mcp.server.list(location())

    return (data.location.mcp.server.list(data.location.default()) ?? [])
      .map((server) => active?.find((item) => item.name === server.name) ?? server)
      .toSorted((a, b) => a.name.localeCompare(b.name))
  })

  const toggle = (item: McpServer, enabled: boolean) =>
    mcp.dispatch({ type: "toggle.requested", name: item.name, enabled, status: item.status.status })

  const sources = createConsoleSources(() => props.directory)

  const plugins = createExtensionLoad({
    key: () => serverSdk.scope,
    task: (_, signal) => serverSdk.api.plugin.list(undefined, { signal }).then((result) => result.data),
  })

  onCleanup(
    serverSdk.event.on("plugin.updated", (event) => {
      if (!event.location) plugins.invalidate()
    }),
  )

  const pluginList = createMemo(() => {
    const current = plugins.view()

    return current.status === "ready" ? current.value : undefined
  })

  // The desktop window runs the GUIs of its own server's plugins, so only that server's rows control them.
  const own = () => !!platform.plugins && ServerConnection.builtin(serverSdk.server)

  createEffect(() => {
    if (serverSdk.connection.status() !== "connected") return
    void data.location.skill.sync().catch(() => undefined)
  })
  const skills = createMemo(() => (data.location.skill.list() ?? []).toSorted((a, b) => a.name.localeCompare(b.name)))

  // Which file sets each extension, so only what the global config file or skills folder holds offers Remove.
  const origins = createExtensionLoad({
    key: () => serverSdk.scope,
    task: (_, signal) =>
      Promise.all([
        serverSdk.api.config.get(undefined, { signal }),
        serverSdk.api.experimental.config.extensionPaths({ signal }),
      ]).then(([entries, paths]) => ({ entries, paths })),
  })

  onCleanup(serverSdk.event.on("config.updated", () => origins.invalidate()))

  const known = createMemo(() => {
    const current = origins.view()

    return current.status === "ready" ? current.value : undefined
  })

  const originLine = (origin: Origin) => {
    if (origin.type === "global") return language.t("settings.extensions.from.global", { path: origin.path })

    if (origin.type === "file") return language.t("settings.extensions.from.file", { path: folder(origin.path) })

    return language.t("settings.extensions.from.other")
  }

  const mcpInfo = (name: string) => {
    const current = known()

    if (sources.managed(name)) return { line: language.t("settings.extensions.from.console"), removable: false }

    if (!current) return undefined
    const origin = mcpOrigin(name, current.entries, current.paths.config)
    const runs = mcpRuns(name, current.entries)

    return {
      line: originLine(origin),
      runs: runs ? language.t(RUNS[runs]) : undefined,
      removable: origin.type === "global",
    }
  }

  const pluginInfo = (plugin: PluginInfo) => {
    const current = known()

    if (!current) return undefined
    const found = pluginOrigin(plugin, current.entries, current.paths.config)

    if (plugin.source.type === "local")
      return {
        line: language.t("settings.extensions.from.file", { path: folder(plugin.source.path) }),
        spec: undefined,
      }

    return { line: originLine(found.origin), spec: found.origin.type === "global" ? found.spec : undefined }
  }

  const skillInfo = (skill: SkillInfo) => {
    const current = known()

    if (sources.skill(skill)) return { line: language.t("settings.extensions.from.console"), folder: undefined }

    if (!current) return undefined
    const found = skillOrigin(skill, current.paths.skills)

    if (found.origin.type === "global")
      return { line: language.t("settings.extensions.from.skillsFolder"), folder: found.folder }

    return { line: originLine(found.origin), folder: undefined }
  }

  const removableKeys = (section: Section) => {
    if (section === "mcps") return mcps().flatMap((item) => (mcpInfo(item.name)?.removable ? [item.name] : []))

    if (section === "plugins")
      return (pluginList() ?? []).flatMap((plugin) => (pluginInfo(plugin)?.spec ? [pluginLabel(plugin)] : []))

    return skills().flatMap((skill) => (skillInfo(skill)?.folder ? [skill.id] : []))
  }

  // After a removal, focus moves to the next item's Remove button, or the section heading when none is left. The lists
  // reload after the change, which can replace the rows, so focus is placed again once the removed item is gone.
  const headings: Partial<Record<Section, HTMLHeadingElement>> = {}
  const pending: { section?: Section; next?: string; until: number } = { until: 0 }

  const placeFocus = () => {
    const section = pending.section

    if (!section) return
    const key = pending.next ? `${section}:${pending.next}` : undefined
    const button = key
      ? Array.from(document.querySelectorAll<HTMLElement>("[data-remove-key]")).find(
          (element) => element.dataset.removeKey === key,
        )
      : undefined
    ;(button ?? headings[section])?.focus()
  }

  createEffect(
    on([mcps, pluginList, skills], () => {
      if (!pending.section || Date.now() > pending.until) return
      requestAnimationFrame(() => {
        const active = document.activeElement

        if (!active || active === document.body || !active.isConnected) placeFocus()
      })
    }),
  )

  // After adding a server that asks for a sign-in, its Sign in button takes focus once the server reports it, unless
  // the person has moved on. The dialog returns focus to the Add button when it closes.
  const signIn: { name?: string; until: number } = { until: 0 }

  const awaitSignIn = (name: string) => {
    signIn.name = name
    signIn.until = Date.now() + SIGN_IN_WAIT_MS
  }

  createEffect(
    on(mcps, (list) => {
      const name = signIn.name

      if (!name || Date.now() > signIn.until) return
      const item = list.find((server) => server.name === name)

      if (item?.status.status !== "needs_auth" || !item.integrationID) return
      signIn.name = undefined
      requestAnimationFrame(() => {
        const active = document.activeElement
        const button = Array.from(document.querySelectorAll<HTMLElement>("[data-sign-in]")).find(
          (element) => element.dataset.signIn === name,
        )

        if (!button) return
        // Only when focus is still where the dialog left it: the Add button or nowhere.
        if (active && active !== document.body && !active.closest(".settings-tab-header-actions")) return
        button.focus()
      })
    }),
  )

  const askRemove = (section: Section, name: string, key: string, remove: () => Promise<void>) => {
    const keys = removableKeys(section)
    const index = keys.indexOf(key)
    const next = index === -1 ? undefined : (keys[index + 1] ?? keys[index - 1])

    dialog.show(() => (
      <DialogRemoveExtension
        name={name}
        remove={remove}
        onRemoved={() => {
          pending.section = section
          pending.next = next
          pending.until = Date.now() + 5_000
          placeFocus()
        }}
      />
    ))
  }

  const removeButton = (section: Section, name: string, key: string, remove: () => Promise<void>) => (
    <Button
      size="small"
      variant="ghost-muted"
      data-remove-key={`${section}:${key}`}
      aria-label={language.t("settings.extensions.remove.label", { name })}
      onClick={() => askRemove(section, name, key, remove)}
    >
      {language.t("settings.extensions.remove")}
    </Button>
  )

  const removeMcp = async (name: string) => {
    const current = known()
    const origin = current && mcpOrigin(name, current.entries, current.paths.config)

    if (!current || origin?.type !== "global") throw new RemoveFailed(language.t("settings.extensions.from.other"))
    // The Keychain items only this server used go with it.
    const keys = mcpKeychain(name, current.entries, origin.path)

    await serverSdk.api.experimental.config.update({
      mcp: { [name]: null },
      ...(keys.length > 0 ? { keychain: Object.fromEntries(keys.map((key) => [key, null])) } : {}),
    })
    data.location.mcp.server.invalidate(data.location.default())
    void data.location.mcp.server.sync(data.location.default()).catch(() => undefined)
  }

  const removePlugin = async (spec: string) => {
    await serverSdk.api.experimental.config.update({ plugins: { remove: [spec] } })
    plugins.invalidate()
  }

  const removeSkill = async (folder: string) => {
    const result = await serverSdk.api.experimental.config.skillRemove({ skill: folder })

    if (!result.ok) throw new RemoveFailed(result.output || language.t("settings.extensions.add.failedUnknown"))
    data.location.skill.invalidate()
    void data.location.skill.sync().catch(() => undefined)
  }

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <h1 class="settings-tab-title">{language.t("settings.tab.extensions")}</h1>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.extensions.description")}</span>
          </div>
          <div class="settings-tab-header-actions">
            <Button
              variant="neutral"
              icon="plus"
              aria-label={language.t("settings.extensions.add.button.label")}
              onClick={() =>
                dialog.show(() => (
                  <DialogAddExtension
                    directory={props.directory}
                    existing={mcps().map((item) => item.name)}
                    tab={ADD_TABS[props.subtab ?? "mcps"]}
                    onAdded={(request) => {
                      if (request.type === "mcp") awaitSignIn(request.name)
                    }}
                  />
                ))
              }
            >
              {language.t("settings.extensions.add.button")}
            </Button>
            {props.headerAction}
          </div>
        </div>
      </div>

      <div class="settings-tab-body">
        <Tabs
          variant="pill"
          value={props.subtab ?? "mcps"}
          onChange={(value) => {
            if (value === "mcps" || value === "plugins" || value === "skills") props.onSubtab(value)
          }}
          class="settings-extensions-tabs settings-subtabs"
        >
          <Tabs.List aria-label={language.t("settings.extensions.types")}>
            <Tabs.Trigger value="mcps">{language.t("settings.extensions.tab.mcps")}</Tabs.Trigger>
            <Tabs.Trigger value="plugins">{language.t("settings.extensions.tab.plugins")}</Tabs.Trigger>
            <Tabs.Trigger value="skills">{language.t("settings.extensions.tab.skills")}</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="mcps">
            <div class="settings-section">
              <div class="flex items-center justify-between">
                <h2
                  ref={(element) => (headings.mcps = element)}
                  tabindex="-1"
                  class="settings-extension-heading text-13-medium focus:outline-none"
                >
                  {language.t("settings.extensions.availableAll")}
                </h2>
              </div>
              <SettingsList variant="catalog">
                <For each={mcps()}>
                  {(item) => {
                    const row = () => mcpRowView(mcp.state(), item.name, item.status.status)

                    const busy = () => row().busy

                    const managed = () => sources.managed(item.name)

                    const links = () => sources.links(item.name)

                    const status = () =>
                      managed()?.needsConnection && item.status.status === "connected"
                        ? "needs_auth"
                        : item.status.status

                    // The dot shows the status, as in the MCPs dialog; the words stay for assistive technology.
                    const label = () => {
                      if (managed()) return language.t("settings.extensions.console.temporary")

                      return item.status.status === "pending" ? undefined : language.t(statusLabels[item.status.status])
                    }

                    const connect = () => sources.connect(item.name)

                    const info = () => mcpInfo(item.name)

                    return (
                      <div class="settings-extension-row settings-mcp-row" data-status={status()}>
                        <div class="settings-extension-lead">
                          <span class="settings-mcp-status">
                            <span class="mcp-status-dot" data-status={status()} aria-hidden="true" />
                          </span>
                          <div class="flex min-w-0 flex-col gap-0.5">
                            <div class="flex min-w-0 items-center gap-2">
                              <h3 class="flex min-w-0">
                                <Show
                                  when={managed() && links()}
                                  fallback={
                                    <TruncatedText text={mcpTitle(item.name)} class="settings-extension-name" />
                                  }
                                >
                                  {(current) => <ConsoleName name={mcpTitle(item.name)} href={current().manage} />}
                                </Show>
                              </h3>
                              <Show when={sources.mcp(item.name)?.overridden && links()}>
                                {(current) => <ConsoleReplaced name={mcpTitle(item.name)} href={current().manage} />}
                              </Show>
                            </div>
                            <Show when={info()?.line}>
                              {(line) => (
                                <span class="text-11-regular text-v2-text-text-muted [overflow-wrap:anywhere]">
                                  {line()}
                                </span>
                              )}
                            </Show>
                            <Show when={info()?.runs}>
                              {(runs) => <span class="text-11-regular text-v2-text-text-muted">{runs()}</span>}
                            </Show>
                          </div>
                        </div>
                        <div class="settings-extension-trailing">
                          <Show when={item.status.status === "failed"}>
                            <Button
                              size="small"
                              variant="ghost-muted"
                              aria-label={language.t("dialog.mcp.error.viewLabel", { name: mcpTitle(item.name) })}
                              onClick={() =>
                                dialog.show(() => <DialogMcp directory={location().directory} server={item.name} />)
                              }
                            >
                              {language.t("dialog.mcp.error.view")}
                            </Button>
                          </Show>
                          <Show
                            when={connect()}
                            fallback={
                              <Show
                                when={item.status.status === "needs_auth" && item.integrationID}
                                fallback={
                                  <Switch
                                    checked={item.status.status !== "disabled"}
                                    disabled={row().pending}
                                    description={label()}
                                    class="[&_[data-slot=switch-description]]:sr-only"
                                    onChange={(enabled) => toggle(item, enabled)}
                                  >
                                    <span class="sr-only">{item.name}</span>
                                  </Switch>
                                }
                              >
                                <Button
                                  size="small"
                                  variant="ghost-muted"
                                  disabled={busy()}
                                  aria-busy={busy()}
                                  data-sign-in={item.name}
                                  aria-label={language.t("dialog.mcp.signIn.open", { name: mcpTitle(item.name) })}
                                  onClick={() => toggle(item, true)}
                                >
                                  {language.t(busy() ? "dialog.mcp.signingIn" : "dialog.mcp.signIn")}
                                </Button>
                              </Show>
                            }
                          >
                            {(href) => (
                              <Button
                                size="small"
                                variant="ghost-muted"
                                aria-label={language.t("settings.extensions.console.connect", {
                                  name: mcpTitle(item.name),
                                })}
                                onClick={() => platform.openExternal(href())}
                              >
                                {language.t("common.connect")}
                              </Button>
                            )}
                          </Show>
                          <Show when={info()?.removable}>
                            {removeButton("mcps", mcpTitle(item.name), item.name, () => removeMcp(item.name))}
                          </Show>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </SettingsList>
              <Show when={mcps().length === 0}>
                <p class="project-settings-extension-empty-description">
                  {language.t("settings.extensions.empty.mcps")}
                </p>
              </Show>
              <Show when={sources.view().status === "error"}>
                <ExtensionLoadFailed
                  message={language.t("settings.extensions.sources.loadFailed")}
                  retry={language.t("common.retry")}
                  onRetry={sources.retry}
                />
              </Show>
            </div>
          </Tabs.Content>

          <Tabs.Content value="plugins">
            <div class="settings-section">
              <div class="flex items-center justify-between">
                <h2
                  ref={(element) => (headings.plugins = element)}
                  tabindex="-1"
                  class="settings-extension-heading text-13-medium focus:outline-none"
                >
                  {language.t("settings.extensions.availableAll")}
                </h2>
              </div>
              {/* The desktop's own server also lists the plugins main runs, so its rows stay while the list loads. */}
              <Show when={own() || pluginList()}>
                <ExtensionPlugins
                  plugins={pluginList() ?? []}
                  own={own()}
                  details={(plugin) => {
                    const info = pluginInfo(plugin)
                    const spec = info?.spec

                    return {
                      lines: [info?.line],
                      actions: spec
                        ? removeButton("plugins", pluginLabel(plugin), pluginLabel(plugin), () => removePlugin(spec))
                        : undefined,
                    }
                  }}
                />
              </Show>
              <Show when={plugins.view().status === "ready" && pluginList()?.length === 0}>
                <p class="project-settings-extension-empty-description">
                  {language.t("settings.extensions.empty.plugins")}
                </p>
              </Show>
              <Show when={plugins.view().status === "loading" && !own()}>
                <p class="project-settings-extension-empty-description">{language.t("common.loading")}</p>
              </Show>
              <Show when={plugins.view().status === "error"}>
                <ExtensionLoadFailed
                  message={language.t("settings.extensions.plugins.loadFailed")}
                  retry={language.t("common.retry")}
                  onRetry={plugins.retry}
                />
              </Show>
            </div>
          </Tabs.Content>

          <Tabs.Content value="skills">
            <div class="settings-section">
              <div class="flex items-center justify-between">
                <h2
                  ref={(element) => (headings.skills = element)}
                  tabindex="-1"
                  class="settings-extension-heading text-13-medium focus:outline-none"
                >
                  {language.t("settings.extensions.availableAll")}
                </h2>
              </div>
              <SettingsList variant="catalog">
                <For each={skills()}>
                  {(skill) => {
                    const link = () => sources.skill(skill)

                    const info = () => skillInfo(skill)

                    return (
                      <div class="settings-extension-row">
                        <div class="settings-extension-lead">
                          <Icon name="post-skill" class="text-v2-icon-icon-muted shrink-0" />
                          <div class="flex min-w-0 flex-col gap-0.5">
                            <h3 class="flex min-w-0">
                              <Show
                                when={link()}
                                fallback={<span class="settings-extension-name truncate">{skill.name}</span>}
                              >
                                {(href) => <ConsoleName name={skill.name} href={href()} />}
                              </Show>
                            </h3>
                            <Show when={skill.description}>
                              {(description) => (
                                <span class="line-clamp-2 text-11-regular text-v2-text-text-muted">
                                  {description()}
                                </span>
                              )}
                            </Show>
                            <Show when={info()?.line}>
                              {(line) => (
                                <span class="text-11-regular text-v2-text-text-muted [overflow-wrap:anywhere]">
                                  {line()}
                                </span>
                              )}
                            </Show>
                          </div>
                        </div>
                        <Show when={info()?.folder}>
                          {(folder) => (
                            <div class="settings-servers-actions">
                              {removeButton("skills", skill.name, skill.id, () => removeSkill(folder()))}
                            </div>
                          )}
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </SettingsList>
              <Show when={skills().length === 0}>
                <p class="project-settings-extension-empty-description">
                  {language.t("settings.extensions.empty.skills")}
                </p>
              </Show>
              <Show when={sources.view().status === "error"}>
                <ExtensionLoadFailed
                  message={language.t("settings.extensions.sources.loadFailed")}
                  retry={language.t("common.retry")}
                  onRetry={sources.retry}
                />
              </Show>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </>
  )
}
