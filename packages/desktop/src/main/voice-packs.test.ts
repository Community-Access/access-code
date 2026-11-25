import { createHash, randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import { mkdir, readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { createVoicePacks, type VoicePack, type VoicePackStatus } from "./voice-packs"

const body = Buffer.from("synthetic local voice pack bytes")

describe("voice pack manager", () => {
  test("downloads verified bytes, lists metadata only, and removes the installed pack", async () => {
    const server = await serve((_request, response) => response.end(body))
    const directory = await storageDirectory()
    try {
      const manager = createVoicePacks(directory, [pack(server.url, body)], fetch)
      await manager.start("test-speech")
      const installed = await until(manager, "test-speech", (status) => status.installed || status.error !== null)

      expect(installed).toEqual({
        id: "test-speech",
        name: "Synthetic speech",
        kind: "speech",
        description: "Synthetic test bytes",
        license: "Test-only",
        source: "Local test server",
        size: body.byteLength,
        installed: true,
        download: null,
        error: null,
      })
      expect(await readFile(path.join(directory, "test-speech", "model.bin"))).toEqual(body)

      await manager.remove("test-speech")
      expect((await manager.list())[0].installed).toBe(false)
      expect(await readdir(directory)).toEqual([])
    } finally {
      await close(server.server)
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("follows model-host redirects before verifying the downloaded bytes", async () => {
    const server = await serve((request, response) => {
      if (request.url === "/model.bin") {
        response.writeHead(302, { location: "/content" })
        return response.end()
      }
      response.end(body)
    })
    const directory = await storageDirectory()
    try {
      const manager = createVoicePacks(directory, [pack(server.url, body)])
      await manager.start("test-speech")
      const result = await until(manager, "test-speech", (status) => status.installed || status.error !== null)
      expect(result.error).toBeNull()
      expect(result.installed).toBe(true)
      expect(await readFile(path.join(directory, "test-speech", "model.bin"))).toEqual(body)
    } finally {
      await close(server.server)
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects integrity mismatches and removes partial files", async () => {
    const server = await serve((_request, response) => response.end(body))
    const directory = await storageDirectory()
    try {
      const manager = createVoicePacks(directory, [pack(server.url, body, "0".repeat(64))])
      await manager.start("test-speech")
      const failed = await until(manager, "test-speech", (status) => status.error !== null)

      expect(failed.installed).toBe(false)
      expect(failed.download).toBeNull()
      expect(failed.error).toContain("SHA-256")
      expect(await readdir(directory)).toEqual([])
    } finally {
      await close(server.server)
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects an exact-size mismatch and removes partial files", async () => {
    const server = await serve((_request, response) => response.end(body.subarray(0, body.byteLength - 1)))
    const directory = await storageDirectory()
    try {
      const fixture = pack(server.url, body)
      const manager = createVoicePacks(directory, [fixture])
      await manager.start("test-speech")
      const failed = await until(manager, "test-speech", (status) => status.error !== null)

      expect(failed.installed).toBe(false)
      expect(failed.download).toBeNull()
      expect(failed.error).toContain("size does not match")
      expect(await readdir(directory)).toEqual([])
    } finally {
      await close(server.server)
      await rm(directory, { recursive: true, force: true })
    }
  })
  test("cancels a streaming download and cleans its staging directory", async () => {
    const firstChunk = deferred()
    const connectionClosed = deferred()
    const server = await serve(async (_request, response) => {
      response.on("close", connectionClosed.resolve)
      response.write(body.subarray(0, 4))
      firstChunk.resolve()
      await connectionClosed.promise
    })
    const directory = await storageDirectory()
    try {
      const manager = createVoicePacks(directory, [pack(server.url, body)])
      await manager.start("test-speech")
      await firstChunk.promise
      const downloading = await until(manager, "test-speech", (status) => (status.download?.received ?? 0) > 0)
      expect(downloading.download).toEqual({ received: 4, total: body.byteLength })

      await manager.cancel("test-speech")
      const cancelled = (await manager.list())[0]
      expect(cancelled.installed).toBe(false)
      expect(cancelled.download).toBeNull()
      expect(cancelled.error).toBeNull()
      expect(await readdir(directory)).toEqual([])
    } finally {
      await close(server.server)
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects unsafe and duplicate file paths", () => {
    const fixture = pack("https://example.invalid/model.bin", body)
    expect(() => createVoicePacks("unused", [{ ...fixture, files: [{ ...fixture.files[0], path: "../model.bin" }] }])).toThrow(
      "Unsafe voice pack file path",
    )
    expect(() =>
      createVoicePacks("unused", [
        { ...fixture, files: [fixture.files[0], { ...fixture.files[0], path: "MODEL.BIN" }] },
      ]),
    ).toThrow("Duplicate voice pack file")
    expect(() =>
      createVoicePacks("unused", [
        { ...fixture, files: [{ ...fixture.files[0], url: "http://example.invalid/model.bin" }] },
      ]),
    ).toThrow("must use HTTPS or localhost HTTP")
  })

  test("rejects unknown pack IDs for every operation", async () => {
    const manager = createVoicePacks("unused", [])
    await expect(manager.start("missing")).rejects.toThrow("Unknown voice pack")
    await expect(manager.cancel("missing")).rejects.toThrow("Unknown voice pack")
    await expect(manager.remove("missing")).rejects.toThrow("Unknown voice pack")
  })
})

function pack(url: string, bytes: Uint8Array, sha256 = createHash("sha256").update(bytes).digest("hex")): VoicePack {
  return {
    id: "test-speech",
    name: "Synthetic speech",
    kind: "speech",
    description: "Synthetic test bytes",
    license: "Test-only",
    source: "Local test server",
    files: [{ path: "model.bin", url, size: bytes.byteLength, sha256 }],
  }
}

async function serve(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Local test server has no TCP address")
  return { server, url: `http://127.0.0.1:${address.port}/model.bin` }
}

async function close(server: Server) {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function storageDirectory() {
  const directory = path.join(import.meta.dir, `.voice-packs-test-${randomUUID()}`)
  await mkdir(directory)
  return directory
}

async function until(
  manager: ReturnType<typeof createVoicePacks>,
  id: string,
  matches: (status: VoicePackStatus) => boolean,
) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const status = (await manager.list()).find((item) => item.id === id)
    if (!status) throw new Error(`Missing voice pack: ${id}`)
    if (matches(status)) return status
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for voice pack: ${id}`)
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}
