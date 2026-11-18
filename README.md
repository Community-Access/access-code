# AccessCode

AccessCode is an AI coding agent built to work well with VoiceOver and other screen readers. It is a version of [OpenCode](https://github.com/anomalyco/opencode), the open source coding agent, with accessibility fixes throughout the desktop app.

You chat with an AI model, and it reads, writes and runs code in your projects. You choose the model: a cloud service you already pay for, or a model running privately on your own Mac.

## Download

Get the latest version from the [Releases page](https://github.com/taylorarndt/access-code/releases). Download **AccessCode-mac-arm64.dmg**, open it, and drag AccessCode to Applications.

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

## Known limits

- The terminal interface (TUI) has not been changed yet.
- AccessCode does not update itself yet. Check the Releases page for new versions.
- Only Apple silicon Macs are supported today.

## Staying close to OpenCode

AccessCode follows OpenCode closely and brings in each OpenCode release, so you get their new features and fixes along with the accessibility work. For how agents, models and settings work, see the [OpenCode documentation](https://opencode.ai/docs).

AccessCode is not built by the OpenCode team and is not affiliated with them.

## Feedback and contributing

Found something that does not work with your screen reader? [Open an issue](https://github.com/taylorarndt/access-code/issues). Pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

AccessCode is made by Taylor Arndt.
