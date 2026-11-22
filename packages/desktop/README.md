# Access Code Desktop

The Access Code desktop app is built with Electron. See the [Access Code desktop and web overview](../../README.md#access-code-desktop-and-web)
for chat announcements, provider connections, and verification status.

## Development

```bash
bun install
bun dev
```

## Build

`bun run build` prepares `resources/` (icons, metainfo and the bundled CLI) and builds the app into `out/`.
`bun run pack` then packages it, unsigned, into `dist/desktop/` at the repository root: a `.app` tarball on macOS,
the unpacked app on Windows, and AppImage/deb/rpm on Linux. Mac release builds are signed and notarized in CI. Windows releases are signed manually.

```bash
bun run build && bun run pack
```

Both read the same environment as every other release package:

| Variable           | Meaning                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `OPENCODE_CHANNEL` | `dev` (default), `beta`, or `latest`/`prod`. Picks the app identity, icons and bundled CLI.                     |
| `OPENCODE_VERSION` | Version stamped into the app and its packages.                                                                  |
| `OPENCODE_TARGET`  | `darwin-arm64`, `darwin-x64`, `windows-x64`, `linux-x64`, `linux-arm64`. Defaults to the host. Windows ARM64 packaging is paused. |

The CLI is placed outside `app.asar` in the application's resources directory, and packaging fails if it is missing.
`bun run build` uses `packages/cli/dist` when that holds the target's CLI. Otherwise `dev` (and `local`, unset or unrecognized)
downloads the published dev CLI, `beta` downloads the beta CLI, and `prod`/`latest` fail.

`bun dev` is separate from packaging: it uses local renderer/server mode, the dev app identity, and the CLI source by
default. `bun dev --download-server <version>` instead downloads that CLI version for local development.

### Windows x64 installer

From the repository root in PowerShell, with the version of Bun pinned in `package.json` and
[Inno Setup](https://jrsoftware.org/isdl.php) 6.7.4 or newer. Add `ISCC.exe` to `PATH` or set `ISCC` to its absolute path.

```powershell
bun install --frozen-lockfile
$env:OPENCODE_CHANNEL = "dev"
$env:OPENCODE_VERSION = (Get-Content package.json -Raw | ConvertFrom-Json).version
$env:OPENCODE_TARGET = "windows-x64-baseline"
bun run --cwd packages\cli build --skip-install

$env:OPENCODE_TARGET = "windows-x64"
bun run --cwd packages\desktop build
bun run --cwd packages\desktop pack
```

Stop if any command fails. To try the unpacked app without installing, run
`dist\desktop\app\AccessCode Dev.exe` with the rest of that folder intact. It uses the normal app profile.
To generate an unsigned Inno Setup installer, move that app directory to a short staging path before packing it
again. Inno Setup can hit the Windows path limit on nested terminal files. The regular pack command clears
`dist\desktop` and `packages\desktop\dist` at startup, so the second pass replaces the unpacked output.

```powershell
$staging = New-Item -ItemType Directory -Path (Join-Path $PWD ".cache\inno-$([guid]::NewGuid().ToString('N').Substring(0,8))")
Move-Item dist\desktop\app $staging.FullName
$env:OPENCODE_DESKTOP_APP = Join-Path $staging.FullName "app"
try {
    bun run --cwd packages\desktop pack
} finally {
    Remove-Item Env:\OPENCODE_DESKTOP_APP
}
```

The resulting installer is `dist\desktop\accesscode-desktop-win-x64.exe`. The temporary staged copy can be
removed after packaging. This procedure does not sign or publish the installer.

The [Windows CI workflow](../../.github/workflows/accesscode-windows.yml) builds unsigned Dev installers and
portable editions for x64. These are for testing, not public release. Windows ARM64 packaging is paused.

The `windows-voice` test branch has experimental Windows voice support. Windows speech voices and recognition depend
on what is installed on the device. Voice settings offer independently selected Whisper Tiny English (about 104 MB)
and Moonshine Tiny English (about 124 MB) recognition models. Choose **Install** to download one, or cancel or
remove it later. Downloads are checked against pinned file sizes and SHA-256 hashes. The models run locally;
selecting one does not change the reply voice. Kokoro English is an optional US English reply voice pack.
It uses the [Misaki ONNX phonemizer](https://huggingface.co/nekwo/misaki-en-us-g2p-onnx/tree/4b3a605d2f605318ab4f762ab9855c44106528b7);
unfamiliar words use its neural fallback. Some context-dependent words may be pronounced incorrectly, and
unsupported characters are reported as errors rather than omitted. Piper LibriTTS English is another optional
US English speech pack, with 904 numbered speakers selected in voice settings. It uses OpenPhonemizer and a
Sherpa-converted Piper model; unknown words use neural phonemization. Unsupported characters or phonemes are
reported as errors. Pronunciation, including contractions, needs listening tests. The pack is about 177 MB;
no model downloads automatically. Other downloadable speech voices are not yet available.
Microphone and voice previews are included, but real accessibility and interruption testing remains outstanding.
The `windows_voice` experimental flag controls these features using the connected server's global configuration.
It defaults on for local and dev builds and off for releases; set `experimental.windows_voice` in configuration
or use `OPENCODE_FLAGS=windows_voice` on the server to opt in. Changes to configuration refresh the controls.

Windows x64 builds include the sherpa-onnx license and the ONNX Runtime license and third-party notices under
`resources\voice\licenses`. These notices come from [sherpa-onnx 2.0.1](https://github.com/k2-fsa/sherpa-onnx/tree/v2.0.1)
and its [ONNX Runtime 1.28.2 Windows x64 static-CRT archive](https://github.com/csukuangfj/onnxruntime-libs/releases/download/v1.28.2/onnxruntime-win-x64-MT-Release-1.28.2.tar.bz2).
The separate phonemizer process uses ONNX Runtime Node 1.30.0; its license and third-party notices are
from the [official 1.30.0 Windows Python wheel](https://pypi.org/project/onnxruntime/1.30.0/#files)
(SHA-256 `3bdd1752a8502ac1a7ccc6e878d16db6943df574d54ed7f01058a6806ae05be4`).
Update the notices when updating either bundled runtime.
The Piper and OpenPhonemizer attribution and license notice is in `resources\voice\licenses\piper-model-NOTICE.txt`.
The Piper model card reports training on LibriTTS, which is distributed under CC BY 4.0.
Voice-model terms, dataset attribution and runtime notice completeness require qualified review before release.

For a stable Windows release, run the [unsigned payload build](../../.github/workflows/accesscode-windows-payloads.yml)
from `main`. Enter the stable version from `package.json` and the exact Authenticode publisher subject agreed with
the maintainer. The workflow builds x64 and uploads an unpacked app and a portable folder.

On the signing machine, check out the same commit and download the two unsigned stable payloads. Manually sign the
release-owned binaries in both folders and verify their signatures and publisher.
Preserve and verify the expected third-party signatures. Archive the signed portable folder with its marker intact.
Set `OPENCODE_CHANNEL=latest`, the matching `OPENCODE_VERSION` and `OPENCODE_TARGET`, and point `OPENCODE_DESKTOP_APP`
at the signed unpacked app. Run the Inno packaging command above, then sign and verify the resulting installer.
The resulting signed installer is x64.

To publish automatic updates, run `.github\release\write-accesscode-windows-feed.ps1` with the signed installer
directory, stable version and signing subject. It verifies and lists the signed x64 installer in `latest.yml`.
Publish the signed installer and generated feed together as assets of the latest
[AccessCode GitHub release](https://github.com/Community-Access/access-code/releases).
Do not publish unsigned installers to this feed. Automatic updates are off in local and preview builds.

#### Sign Windows builds with Azure Artifact Signing

The Windows machine used for Quill can reuse its Azure Artifact Signing
(formerly Trusted Signing) setup for an approved Access Code build. This
produces an embedded Authenticode signature, not a detached provenance
signature. Azure holds the private key; no local PFX is needed.

1. Use a Windows SDK with `signtool.exe`, the approved Azure signing account
   and certificate profile, and an Azure identity with the **Artifact Signing
   Certificate Profile Signer** role. Keep account configuration and credentials
   out of Access Code commits. For local Azure CLI authentication, run
   `az login` if the intended identity is not already signed in.
2. From the Quill checkout, run `python scripts\code_signing.py doctor` and
   review its individual checks. Run `python scripts\code_signing.py ensure-dlib`
   to stage the pinned Microsoft signing client if needed. The doctor checks
   local prerequisites; it does not prove Azure will authorize a signature.
3. Use a disposable copy of an approved release candidate for the first test.
   Run `python scripts\code_signing.py sign <absolute-path-to-executable>`
   and then `python scripts\code_signing.py verify <absolute-path-to-executable>`,
   replacing the placeholder with a quoted path. Confirm the valid timestamp
   and expected publisher. Do not overwrite an existing portable build or
   bypass Quill's policy against signing Dev and Beta builds.
4. For a release, agree on the publisher with the Access Code maintainer first.
   Sign the release-owned binaries in the staged payload before compiling Inno
   Setup, then sign and verify the resulting x64 installer. Set
   `ACCESSCODE_WINDOWS_UPDATE_PUBLISHER` to the exact approved signer subject
   before packaging, and generate `latest.yml` only after the final installer
   is signed. A signature from the Quill profile is not automatically
   appropriate for an official Access Code release.

See [Microsoft's Artifact Signing integration guide](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
for the SignTool configuration and role requirements.

### Windows portable edition

After building the Windows CLI and desktop app as above, run `bun run --cwd packages\desktop pack --portable`
from the repository root. Open `AccessCode Dev.exe` in `dist\portable\AccessCode-windows-x64`. Keep the whole
folder together, including `accesscode-portable.flag`. Run it from a writable location; your settings,
conversations, and cache are stored in the `AccessCode-data` folder beside the executable.
Packaging refuses to replace an existing portable destination because that folder can contain your profile.
Back up the profile before moving an existing build out of the way.

The portable edition does not register the `opencode://` link handler or install automatic updates. Browser
sign-in flows that require that handler may not work. Credentials managed by Windows may still be tied to the
original machine or Windows account. Close AccessCode before moving the folder or removing its drive.

### Connect a ChatGPT account

Open **Settings > Providers**, choose **OpenAI**, and select **Sign in with ChatGPT**. Finish sign-in in your
browser and allow token sharing so eligible requests can use your ChatGPT plan. This is separate from the
OpenAI API key option and does not require an API key or a bundled client secret.

On the first connection, Access Code asks OpenAI to register it under the name **Access Code**. Existing
connections keep their issued client ID. The browser returns to a temporary loopback listener on the local
server, so this sign-in does not require the desktop protocol handler in the Windows portable edition.

For a first test, use a fresh profile in a build that includes the ChatGPT
provider changes. Keep the connection dialog open while the browser completes
sign-in. Use an eligible ChatGPT account, then select an available OpenAI model
and send a short prompt to verify that the connection works. No manual OAuth
client registration, client secret, or API key is needed for this flow.

If the browser says it cannot reach the local page, leave the Access Code
sign-in dialog open. Copy the address from the browser, paste it into the
**Redirect URL** field in Access Code, and choose **Continue** to finish the
same attempt. If you already returned to the provider list, start a new sign-in
and use the address from that new attempt. Do not share the address in chat
or issue reports: it can contain a one-time authorization code. If OpenAI declines registration or
does not grant token sharing, note the error text with sensitive values removed
and retry with an eligible account if available. The **API key** connection
option is a separate fallback with separate billing.

## Beta channel

Every push to the `beta` branch publishes OpenCode Beta (`ai.opencode.desktop.beta`) as version `0.0.0-beta-<run>` to
the `beta` update channel. Beta publishes only the desktop app; the CLI and SDK packages ship
from `dev`. Install it from `https://opencode.ai/update/api/beta/desktop/opencode/<asset>`, for example
`opencode-desktop-mac-arm64.dmg` or `opencode-desktop-win-x64.exe`. Installed builds update in place on every platform.

## Startup benchmark

`perf/startup.bench.ts` times a launch with [strobe](https://github.com/anomalyco/strobe), from process spawn to what a
person waits for, in pairs of launches of two builds with an interval per case. Every launch runs in a private home
(its own `%APPDATA%`, XDG folders, database, config and service registration, the developer's `OPENCODE_*`, `OTEL_*`
and `SENTRY_*` environment removed), so it never touches the developer's app, profile or live service.

| Case                            | Launch                                                                              | Ends on      |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| launch to Home                  | Profile kept from earlier launches; the service already runs, from the bundled CLI. | Home         |
| launch to a restored tab        | Profile kept; the first launch's onboarding draft is restored.                      | The composer |
| launch to Home, service stopped | Profile kept; the desktop spawns its service.                                       | Home         |
| first launch                    | No profile or GPU shader caches: right after an install, onboarding opens a draft.  | The composer |
| dev start to Home               | `bun dev:desktop` with Vite's caches and `out` deleted.                             | Home         |

```bash
# A returning user's launches of two packaged builds (pack each with OPENCODE_CHANNEL=beta or prod), or two installed
# channels.
strobe bench perf/startup.bench.ts --target desktop --base exe:<old>/OpenCode.exe --head exe:<new>/OpenCode.exe
strobe bench perf/startup.bench.ts --target desktop --base app:opencode --head app:opencode-beta

# The first launch after an install.
strobe bench perf/startup.bench.ts --target install --base app:opencode --head app:opencode-beta

# The dev loop's cold start, dev against this checkout.
strobe bench perf/startup.bench.ts --target dev --base origin/dev --head .
```

strobe runs on Windows, macOS and Linux. Windows measures the most; on macOS a packaged launch needs a build whose bundle
id this account has never run (`packages/app/perf/README.md` lists what each OS gives).

Besides `launch.ready`, each launch reports its milestones as `launch.<name>` in ms since spawn: the main process's own
marks from its log (`entry`, `electron`, `window`, `served`, `bundle`, `logging`, `storage`, `init`, `layers`,
`visible`, `service.starting`, `service.ready`; `src/main/lifecycle/marks.ts`), or each step of the dev command's
output. `launch.painted` and `launch.settled` are when the window's pixels first and last changed, `cpu.work` is the CPU
every process used until ready, and `launch.node.*` is Node's bootstrap timing in builds that accept `--inspect`. The
first launch of each build is discarded, because a new binary pays the antivirus scan. The packaged
returning-user cases keep the GPU shader caches their build compiled in earlier launches, as a person's machine has
them; `first launch` starts each launch without them. `--why always` adds a profiled
launch per build: the main process and the renderer, both from their first statement.

A packaged beta or prod build registers itself as the `opencode://` handler when it starts, even from the bench; the
installed app takes the registration back on its next launch. Those channels run with `HTTPS_PROXY` pointed at a
closed port (`--offline` forces it for dev) so the updater's first check fails fast instead of reaching GitHub.
