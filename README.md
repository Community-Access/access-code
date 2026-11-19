# AccessCode

AccessCode is an AI coding agent built to work well with VoiceOver and other screen readers. It is a version of [OpenCode](https://github.com/anomalyco/opencode), the open source coding agent, with accessibility fixes throughout the desktop app.

You chat with an AI model, and it reads, writes and runs code in your projects. You choose the model: a cloud service you already pay for, or a model running privately on your own Mac.

## Download

Get the latest version from the [Releases page](https://github.com/Community-Access/access-code/releases). Download **AccessCode-mac-arm64.dmg**, open it, and drag AccessCode to Applications.

- Needs a Mac with Apple silicon.
- Signed and notarized by Apple.
- Installs next to OpenCode. It has its own app and background server, and shares your settings and conversations with OpenCode.

## Use any AI provider

AccessCode is not tied to one company or one kind of model. Connect as many providers as you like in Settings, Providers, and switch models in any chat.

**Cloud providers**

- Claude (Anthropic)
- ChatGPT, with your ChatGPT sign-in, or OpenAI with an API key
- GitHub Copilot
- Google Gemini
- OpenRouter, Vercel AI Gateway and many more
- OpenCode Go and OpenCode Zen, OpenCode's own optional plans

**Models on your own Mac**

Any server that speaks the OpenAI API works, so you can run models privately and offline with tools such as LM Studio, Ollama, MLX servers or TensorFold. Your code never leaves your Mac.

## What AccessCode adds

### Works with VoiceOver

- Every control has one clear name, and headings mark each part of the screen.
- Replies, "Working" and permission requests are read aloud as they happen.
- Settings has a sensible focus order, and each setting is read once.
- Tooltips no longer open or read twice when VoiceOver moves the pointer.
- Accessibility fixes from open OpenCode pull requests are included.

### Add extensions without editing files

Settings, Extensions has an Add button for:

- **Apps and services (MCP servers):** popular servers in categories, plus the MCP Registry and the Docker MCP Catalog. Servers that support it sign in through your browser. Keys you type are kept in the macOS Keychain.
- **Plugins:** OpenCode community plugins.
- **Skills:** from skills.sh.

Everything you add can be removed from the same page. If something is not listed, "Ask AI to add" or the /add command in any chat adds it for you.

### Accessibility settings

Settings, Accessibility lets you choose how chats sound and read:

- **Reply announcements:** Off, Reply ready (a short "Response ready"), or Read full reply (the default).
- **Announce copied replies:** confirms when a reply is copied to the clipboard.
- **Heading levels:** choose levels 3 to 6 for your messages and for replies. The chat title is level 2.
- **Test Announcements** and **Repeat Last Announcement** are on this page, in the command palette, and in the View, Accessibility menu.

## Windows (in testing)

Windows builds are being tested and are not on the Releases page yet. To build one yourself, follow the [Windows build instructions](./packages/desktop/README.md#windows-x64-installer). They make three versions:

- **Installer:** `dist\desktop\accesscode-desktop-win-x64.exe` installs AccessCode for the current user.
- **Unpacked app:** `dist\desktop\app\AccessCode Dev.exe` runs without installing and uses your normal profile.
- **Portable app:** `dist\portable\AccessCode-windows-x64\AccessCode Dev.exe` keeps its settings in an `AccessCode-data` folder beside it. Keep the whole folder together. See the [portable build notes](./packages/desktop/README.md#windows-portable-edition).

On Windows and Linux, menus have access keys: Alt+F for File, Alt+E for Edit, Alt+V for View and Alt+H for Help.

## Known limits

- The terminal interface (TUI) has not been changed yet.
- AccessCode does not update itself yet. Check the Releases page for new versions.
- Only Apple silicon Macs have released builds today. Windows is in testing.

## Staying close to OpenCode

AccessCode follows OpenCode closely and brings in each OpenCode release, so you get their new features and fixes along with the accessibility work. For how agents, models and settings work, see the [OpenCode documentation](https://opencode.ai/docs).

AccessCode is not built by the OpenCode team and is not affiliated with them.

## Feedback and contributing

Found something that does not work with your screen reader? [Open an issue](https://github.com/Community-Access/access-code/issues). Pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

AccessCode is made by Taylor Arndt.
