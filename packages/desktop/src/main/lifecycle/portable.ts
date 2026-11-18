import { mkdirSync, statSync } from "node:fs"
import path from "node:path"

export const portableMarker = "accesscode-portable.flag"

export function portableDataRoot(platform: NodeJS.Platform, executable: string) {
  if (platform !== "win32") return undefined

  const directory = path.dirname(executable)
  return statSync(path.join(directory, portableMarker), { throwIfNoEntry: false })?.isFile()
    ? path.join(directory, "AccessCode-data")
    : undefined
}

export const portableRoot = portableDataRoot(process.platform, process.execPath)

export function preparePortableData(root: string) {
  for (const dir of ["desktop", "session", "data", "config", "cache", "state", "home", "tmp"])
    mkdirSync(path.join(root, dir), { recursive: true })

  Object.assign(process.env, {
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    OPENCODE_CONFIG_DIR: path.join(root, "config", "opencode"),
    OPENCODE_DB: path.join(root, "data", "opencode.db"),
    OPENCODE_TEST_HOME: path.join(root, "home"),
    TEMP: path.join(root, "tmp"),
    TMP: path.join(root, "tmp"),
  })
  delete process.env.OPENCODE_DESKTOP_SERVER_CHANNEL
}
