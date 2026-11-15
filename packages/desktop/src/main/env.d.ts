interface ImportMetaEnv {
  readonly OPENCODE_CHANNEL: string
  readonly OPENCODE_VERSION?: string
  readonly ACCESSCODE_GITHUB_CLIENT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
