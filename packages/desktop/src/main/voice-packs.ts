import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { isIP } from "node:net"
import path from "node:path"

export type VoicePack = {
  id: string
  name: string
  kind: "recognition" | "speech"
  description: string
  license: string
  source: string
  files: readonly {
    readonly path: string
    readonly url: string
    readonly size: number
    readonly sha256: string
  }[]
}

export type VoicePackStatus = {
  id: string
  name: string
  kind: VoicePack["kind"]
  description: string
  license: string
  source: string
  size: number
  installed: boolean
  download: { received: number; total: number } | null
  error: string | null
}

type Entry = {
  pack: VoicePack
  size: number
  installed: boolean
  download: VoicePackStatus["download"]
  error: string | null
  run?: { controller: AbortController; promise: Promise<void> }
  removing?: Promise<void>
  removingNow: boolean
}

export function createVoicePacks(
  directory: string,
  catalog: readonly VoicePack[],
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  const root = path.resolve(directory)
  const entries = new Map<string, Entry>()
  const ids = new Set<string>()

  for (const pack of catalog) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pack.id) || pack.id === "." || pack.id === ".." || reserved(pack.id))
      throw new Error(`Unsafe voice pack id: ${pack.id}`)
    const normalizedID = pack.id.toLowerCase()
    if (ids.has(normalizedID)) throw new Error(`Duplicate voice pack id: ${pack.id}`)
    ids.add(normalizedID)
    if (pack.kind !== "recognition" && pack.kind !== "speech") throw new Error(`Invalid voice pack kind: ${pack.id}`)
    if (![pack.name, pack.description, pack.license, pack.source].every((value) => typeof value === "string"))
      throw new Error(`Invalid voice pack metadata: ${pack.id}`)
    if (pack.files.length === 0) throw new Error(`Voice pack has no files: ${pack.id}`)

    const paths = new Set<string>()
    const files = pack.files.map((file) => {
      const segments = file.path.split("/")
      if (
        !file.path ||
        file.path.includes("\\") ||
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            /[<>:"|?*\x00-\x1f]/.test(segment) ||
            /[. ]$/.test(segment) ||
            reserved(segment),
        )
      )
        throw new Error(`Unsafe voice pack file path: ${file.path}`)
      const normalizedPath = file.path.toLowerCase()
      if (paths.has(normalizedPath)) throw new Error(`Duplicate voice pack file: ${file.path}`)
      paths.add(normalizedPath)
      if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`Invalid file size: ${file.path}`)
      if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`Invalid SHA-256: ${file.path}`)

      const url = new URL(file.url)
      const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
      const loopback = hostname === "localhost" || hostname === "::1" || (isIP(hostname) === 4 && hostname.startsWith("127."))
      if (
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      )
        throw new Error(`Voice pack file URL must use HTTPS or localhost HTTP: ${file.path}`)

      return { ...file, path: file.path, url: url.href }
    })
    const size = files.reduce((total, file) => total + file.size, 0)
    if (!Number.isSafeInteger(size)) throw new Error(`Voice pack size is too large: ${pack.id}`)
    entries.set(pack.id, {
      pack: { ...pack, files },
      size,
      installed: false,
      download: null,
      error: null,
      removingNow: false,
    })
  }

  const requireEntry = (id: string) => {
    const entry = entries.get(id)
    if (!entry) throw new Error(`Unknown voice pack: ${id}`)
    return entry
  }

  const list = async (): Promise<VoicePackStatus[]> =>
    Promise.all(
      [...entries.values()].map(async (entry) => {
        if (!entry.run && !entry.removingNow) {
          const installed = await isDirectory(path.join(root, entry.pack.id))
          if (!entry.run && !entry.removingNow) entry.installed = installed
        }
        return {
          id: entry.pack.id,
          name: entry.pack.name,
          kind: entry.pack.kind,
          description: entry.pack.description,
          license: entry.pack.license,
          source: entry.pack.source,
          size: entry.size,
          installed: entry.installed,
          download: entry.download ? { ...entry.download } : null,
          error: entry.error,
        }
      }),
    )

  const start = async (id: string): Promise<void> => {
    const entry = requireEntry(id)
    if (entry.run || entry.removingNow) throw new Error(`Voice pack operation already in progress: ${id}`)
    const controller = new AbortController()
    entry.download = { received: 0, total: entry.size }
    entry.error = null
    const promise = download(entry, controller.signal).catch((error: unknown) => {
      entry.download = null
      entry.error = controller.signal.aborted ? null : message(error)
    }).finally(() => {
      entry.run = undefined
    })
    entry.run = { controller, promise }
  }

  const cancel = async (id: string): Promise<void> => {
    const entry = requireEntry(id)
    const run = entry.run
    if (!run) return
    run.controller.abort()
    await run.promise
  }

  const remove = async (id: string): Promise<void> => {
    const entry = requireEntry(id)
    if (entry.removing) return entry.removing
    entry.removingNow = true
    entry.run?.controller.abort()
    const run = entry.run
    const removal = (async () => {
      await run?.promise
      await rm(path.join(root, entry.pack.id), { recursive: true, force: true })
      const prefix = `.${entry.pack.id}.partial-`
      for (const name of await readDirectory(root)) {
        if (name.startsWith(prefix)) await rm(path.join(root, name), { recursive: true, force: true })
      }
      entry.installed = false
      entry.download = null
      entry.error = null
    })().catch((error: unknown) => {
      entry.error = message(error)
      throw error
    }).finally(() => {
      entry.removingNow = false
      entry.removing = undefined
    })
    entry.removing = removal
    return removal
  }

  return { list, start, cancel, remove }

  async function download(entry: Entry, signal: AbortSignal) {
    const target = path.join(root, entry.pack.id)
    const staging = path.join(root, `.${entry.pack.id}.partial-${randomUUID()}`)
    await mkdir(root, { recursive: true })
    if (await exists(target)) {
      entry.installed = await isDirectory(target)
      throw new Error(`Voice pack is already installed: ${entry.pack.id}`)
    }
    await mkdir(staging)
    let received = 0
    try {
      for (const file of entry.pack.files) {
        if (signal.aborted) throw new Error("Download cancelled")
        const destination = path.join(staging, ...file.path.split("/"))
        await mkdir(path.dirname(destination), { recursive: true })
        const response = await fetcher(file.url, { signal }).catch((error: unknown) => {
          throw new Error(`Voice pack request failed: ${file.path}: ${message(error)}`)
        })
        if (!response.ok) throw new Error(`Download failed (${response.status}): ${file.path}`)
        if (!response.body) throw new Error(`Download returned no data: ${file.path}`)
        const output = await open(destination, "wx")
        const hash = createHash("sha256")
        let fileSize = 0
        try {
          for await (const chunk of response.body) {
            if (signal.aborted) throw new Error("Download cancelled")
            fileSize += chunk.byteLength
            if (fileSize > file.size) throw new Error(`Downloaded file is larger than expected: ${file.path}`)
            hash.update(chunk)
            await output.writeFile(chunk)
            received += chunk.byteLength
            entry.download = { received, total: entry.size }
          }
        } finally {
          await output.close()
        }
        if (fileSize !== file.size) throw new Error(`Downloaded file size does not match: ${file.path}`)
        if (hash.digest("hex") !== file.sha256.toLowerCase()) throw new Error(`Downloaded file SHA-256 does not match: ${file.path}`)
      }
      if (signal.aborted) throw new Error("Download cancelled")
      await rename(staging, target)
      if (signal.aborted) {
        await rm(target, { recursive: true, force: true })
        throw new Error("Download cancelled")
      }
      entry.installed = true
      entry.download = null
      entry.error = null
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

function reserved(segment: string) {
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
}

async function exists(file: string) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

async function isDirectory(file: string) {
  try {
    return (await lstat(file)).isDirectory()
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

async function readDirectory(directory: string) {
  try {
    return await readdir(directory)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
