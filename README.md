<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset=".github/assets/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/@opencode/cli"><img alt="npm" src="https://img.shields.io/npm/v/@opencode/cli?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/release.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/release.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](services/site/public/v1/docs/assets/lander/screenshot.png)](https://opencode.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Package managers
npm i -g @opencode/cli@latest      # or bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

## Access Code desktop and web

Access Code is an accessibility-focused fork of OpenCode. The chat announcement changes use the same
renderer on Windows, macOS, Linux, and the web. The installer and portable packaging described below
are specific to Windows.

### Run Access Code on Windows

The [Windows build instructions](./packages/desktop/README.md#windows-x64-installer) produce three options.
These paths are relative to the repository root and use the default x64 development build:

- **Inno Setup installer:** Run `dist\desktop\accesscode-desktop-win-x64.exe` to install for the current user.
- **Unpacked app:** Run `dist\desktop\app\AccessCode Dev.exe` without installing. Keep the unpacked folder
  together. This option uses your normal app profile; it is not portable mode.
- **Portable app:** Run `dist\portable\AccessCode-windows-x64\AccessCode Dev.exe`. Keep the whole directory
  together, including `accesscode-portable.flag`. A writable copy stores its profile in `AccessCode-data`
  beside the executable. See the [portable build instructions and limitations](./packages/desktop/README.md#windows-portable-edition).

Local installers are unsigned and do not update automatically. Signed production releases can use the
Inno Setup update flow when both the installer signatures and the release feed are configured. The
[Windows build workflow](./.github/workflows/accesscode-windows.yml) is configured to produce unsigned
x64 and ARM64 installer artifacts for testing, not to publish releases.

### Connect a ChatGPT account

In **Settings > Providers**, choose **OpenAI**, then **Sign in with ChatGPT**. Finish signing in in your
browser and allow token sharing so eligible requests can use your ChatGPT plan. No API key is needed
for this sign-in method. New connections ask OpenAI to register the app as **Access Code**; existing
connections keep their issued client ID. The browser returns through a local loopback connection, which
does not require the desktop protocol handler in portable mode.

GitHub Copilot sign-in is separate. GitHub displays the name of its registered OAuth application on the
authorization page. Showing **Access Code** there still requires a maintainer-managed GitHub OAuth
registration with device flow and verified Copilot access.

### Use and test chat announcements

Under **Settings → Accessibility**, set **Reply announcements** to **Off**, **Reply ready** (a short
announcement that waits for a pause in screen-reader speech), or **Read full reply** (the default,
which can interrupt speech). Existing on/off preferences become **Read full reply** or **Off**.
The separate **Announce copied replies** switch controls confirmation after a successful clipboard write.
To get a system alert while working in another app, use the link to **Notifications settings**.

The session screen has a level-1 heading, and the conversation title is level 2. In the Accessibility
tab, choose levels 3 through 6 independently for your messages and assistant replies. Both default
to level 3. An existing setting of level 2 falls back to level 3.

In **Settings → Accessibility**, the command palette, or the desktop **View → Accessibility** menu:

- **Repeat Last Announcement** replays the last message sent to the live region.
- **Test Announcements** sends "Access Code announcement test". In Settings, the button uses the
  polite region in **Reply ready** mode and the alert region otherwise. It does not detect whether the
  screen reader received it.

Open the command palette with **Ctrl+K** or **Ctrl+Shift+P** on Windows and Linux, or
**Command+K** or **Command+Shift+P** on macOS. Type to filter, use the arrow keys to
choose a result, press **Enter** to run it, or press **Escape** to close the palette.
Desktop users can also choose **View → Command Palette**. **View → Accessibility**
contains Accessibility Settings, Test Announcements, and Repeat Last Announcement.
With English menus on Windows, press **Alt+F** for File, **Alt+E** for Edit,
**Alt+V** for View, or **Alt+H** for Help. After opening a menu, press the
underlined letter for an item, or use the arrow keys and **Enter**.

### Verification status

The Windows x64 portable app was launched successfully, and the unsigned x64 installer was built.
The ChatGPT provider and announcement regression tests passed, as did the shared renderer build.
The earlier portable previews predate the announcement changes; rebuild to try them. Live ChatGPT
sign-in, ARM64 runtime behavior, signed updates, and announcements with NVDA or Narrator on Windows,
VoiceOver on macOS, and Orca on Linux still need hands-on verification.

### Upstream OpenCode desktop app (beta)

The following downloads are for upstream OpenCode, not this Access Code build.
See the [OpenCode desktop downloads](https://opencode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Installation Directory

The install script installs OpenCode to `$HOME/.opencode/bin`.

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
