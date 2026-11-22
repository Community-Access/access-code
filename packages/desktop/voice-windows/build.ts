import { $ } from "bun"
import { spawnSync } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { NativeArch } from "../../../script/native-arch"
import { getCurrentCli } from "../script/utils"

if (process.platform !== "win32") throw new Error("The Windows voice helper must be built on Windows")

const target = getCurrentCli()
if (target.os !== "win32") throw new Error(`Cannot build the Windows voice helper for ${target.target}`)

const programFiles = process.env["ProgramFiles(x86)"]
if (!programFiles) throw new Error("ProgramFiles(x86) is not set")

const vswhere = path.join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe")
const installation = (
  await $`${vswhere} -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`.text()
).trim()
if (!installation) throw new Error("Visual Studio C++ Build Tools were not found")

const vcvars = path.join(installation, "VC", "Auxiliary", "Build", "vcvarsall.bat")
const output = path.resolve(import.meta.dir, "../resources/voice")
const exe = path.join(output, "accesscode-sapi.exe")
const object = path.join(output, "accesscode-sapi.obj")
const source = path.join(import.meta.dir, "sapi.cpp")
const arch = target.cpu === "arm64" ? "amd64_arm64" : "amd64"
const cmd = process.env.ComSpec
if (!cmd) throw new Error("ComSpec is not set")

await mkdir(output, { recursive: true })
const command = `"call "${vcvars}" ${arch} >nul && cl /nologo /std:c++17 /EHsc /MT /W4 /WX /Fo"${object}" "${source}" /Fe"${exe}" /link sapi.lib ole32.lib oleaut32.lib"`
const build = spawnSync(cmd, ["/d", "/s", "/c", command], { stdio: "inherit", windowsVerbatimArguments: true })
if (build.error) throw build.error
if (build.status !== 0) throw new Error(`Windows voice helper build failed with exit code ${build.status}`)
await NativeArch.verify(exe, target.cpu === "arm64" ? "arm64" : "x64")
await rm(object, { force: true })
console.log(`Windows voice helper built for ${target.target}: ${exe}`)
