import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { app, autoUpdater } from "electron"
import pkg from "electron-updater"
import { Effect } from "effect"
import type { Platform } from "./machine"

const restartTimeout = 10_000
const runFile = promisify(execFile)
const updateConfigPath = path.join(process.resourcesPath, "accesscode-update.json")

export async function hasWindowsUpdateConfig() {
  return (await windowsPublisher()) !== undefined
}

async function windowsPublisher() {
  const contents = await readFile(updateConfigPath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    },
  )
  if (contents === undefined) return undefined
  const config = JSON.parse(contents)
  return (
    config.provider === "generic" &&
    config.url === "https://github.com/Community-Access/access-code/releases/latest/download/" &&
    Array.isArray(config.publisherName) &&
    config.publisherName.length === 1 &&
    typeof config.publisherName[0] === "string" &&
    config.publisherName[0].trim().length > 0
      ? config.publisherName[0] as string
      : undefined
  )
}

async function verifyWindowsInstaller(publisher: string, installer: string) {
  const { stdout } = await runFile(
    path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$s = Get-AuthenticodeSignature -LiteralPath $env:ACCESSCODE_UPDATE_FILE -ErrorAction Stop; " +
        "if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -cne $env:ACCESSCODE_UPDATE_SUBJECT) { exit 1 }; 'valid'",
    ],
    {
      env: { ...process.env, ACCESSCODE_UPDATE_FILE: installer, ACCESSCODE_UPDATE_SUBJECT: publisher },
      timeout: 20_000,
      windowsHide: true,
    },
  )
  if (stdout.trim() !== "valid") throw new Error("Could not verify the AccessCode installer signature")
}

// Reuse electron-updater's verified full-file transport, but never run its NSIS install command.
class InnoUpdater extends pkg.NsisUpdater {
  protected override doInstall() {
    const installer = this.installerPath
    if (!installer) {
      this.dispatchError(new Error("No verified AccessCode installer is available"))
      return false
    }
    void this.spawnLog(installer, [
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
      "/ACCESSCODERESTART=1",
    ]).catch((error) => this.dispatchError(error))
    return true
  }
}

export const make = Effect.fn("Updater.platform")(function* (channel: string) {
  const publisher = yield* Effect.promise(windowsPublisher)
  if (!publisher) throw new Error("AccessCode's Windows update publisher is not configured")
  const updateClient = new InnoUpdater()
  updateClient.updateConfigPath = updateConfigPath
  updateClient.verifyUpdateCodeSignature = async (_, installer) => {
    await verifyWindowsInstaller(publisher, installer)
    return null
  }
  updateClient.disableDifferentialDownload = true
  updateClient.disableWebInstaller = true
  const userAgent = `opencode/${channel === "prod" ? "latest" : channel}/${app.getVersion()}/desktop`
  const runFork = Effect.runForkWith(yield* Effect.context())
  updateClient.logger = {
    info: (...args) => runFork(Effect.logInfo(...args)),
    warn: (...args) => runFork(Effect.logWarning(...args)),
    error: (...args) => runFork(Effect.logError(...args)),
    debug: (...args) => runFork(Effect.logDebug(...args)),
  }
  updateClient.channel = "latest"
  updateClient.requestHeaders = { "User-Agent": userAgent }
  updateClient.allowPrerelease = false
  updateClient.allowDowngrade = false
  updateClient.autoDownload = false
  updateClient.autoInstallOnAppQuit = false
  yield* Effect.logInfo("auto updater configured", {
    channel: updateClient.channel,
    allowPrerelease: updateClient.allowPrerelease,
    allowDowngrade: updateClient.allowDowngrade,
    currentVersion: app.getVersion(),
  })

  return {
    checkForUpdate: Effect.tryPromise({
      try: async () => {
        const result = await updateClient.checkForUpdates()

        if (!result?.isUpdateAvailable) return undefined
        const files = result.updateInfo.files
        // electron-updater picks the installer whose name contains process.arch, which emulation on Windows ARM64
        // reports as x64. downloadUpdate() reads this same list, so keeping only the ARM64 installer moves the install
        // to the native build. macOS needs nothing here: electron-updater already prefers arm64 under Rosetta.
        const native = files.filter((file) => file.url.includes("arm64"))

        if (process.platform === "win32" && app.runningUnderARM64Translation && native.length > 0) {
          files.splice(0, files.length, ...native)
          runFork(
            Effect.logInfo("updating emulated x64 install to native ARM64", { urls: native.map((file) => file.url) }),
          )
        }

        return { mode: "restart", version: result.updateInfo.version } as const
      },
      catch: (error) => error,
    }),
    stageUpdate: () =>
      Effect.tryPromise({
        try: async () => {
          const files = await updateClient.downloadUpdate()
          const installer = files.find((file) => file.endsWith(".exe"))
          if (!installer) throw new Error("The AccessCode update did not contain a Windows installer")
          // Also verify cached downloads, which may bypass the downloader's validation callback.
          await verifyWindowsInstaller(publisher, installer)
        },
        catch: (error) => error,
      }),
    installAndRestart: installAndRestart(updateClient),
  } satisfies Platform
})

const installAndRestart = (updateClient: InnoUpdater) => Effect.callback<void, Error>((resume) => {
  const cleanup = () => {
    autoUpdater.removeListener("before-quit-for-update", started)
    updateClient.removeListener("error", fail)
  }

  const started = () => {
    cleanup()
    resume(Effect.void)
  }

  const fail = (error: Error) => {
    cleanup()
    resume(Effect.fail(error))
  }

  autoUpdater.once("before-quit-for-update", started)
  updateClient.once("error", fail)

  try {
    updateClient.quitAndInstall()
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)))
  }

  return Effect.sync(cleanup)
}).pipe(
  Effect.timeoutOrElse({
    duration: restartTimeout,
    orElse: () =>
      Effect.logError("update restart did not start").pipe(
        Effect.andThen(Effect.fail(new Error("Update restart did not start"))),
      ),
  }),
)
