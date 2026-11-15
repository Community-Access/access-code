export * as ExtensionCatalog from "./extension-catalog.js"

import { Schema } from "effect"

// AccessCode: the skills directory (skills.sh) and the folders the Add extension dialog installs into. Values that
// reach a command line are checked here, so a request that does not match never starts a process.

/** A GitHub `owner/repo`. Each part starts with a letter or digit, so neither can be read as a command-line flag. */
export const SkillSource = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u),
)

/** A skill's name inside its repository, as skills.sh lists it. */
export const SkillName = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/u))

/** The folder an installed skill lives in. No separators or leading dots, so it cannot leave the skills folder. */
export const SkillFolder = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u))

export class Skill extends Schema.Class<Skill>("ExtensionCatalog.Skill")({
  id: Schema.String,
  source: Schema.String,
  skillId: Schema.String,
  name: Schema.String,
  installs: Schema.Number,
}) {}

export class SkillSearchResult extends Schema.Class<SkillSearchResult>("ExtensionCatalog.SkillSearchResult")({
  skills: Skill.pipe(Schema.Array),
}) {}

export const SkillInstallInput = Schema.Struct({ source: SkillSource, skill: SkillName }).annotate({
  identifier: "ExtensionCatalog.SkillInstallInput",
})
export type SkillInstallInput = typeof SkillInstallInput.Type

export const SkillRemoveInput = Schema.Struct({ skill: SkillFolder }).annotate({
  identifier: "ExtensionCatalog.SkillRemoveInput",
})
export type SkillRemoveInput = typeof SkillRemoveInput.Type

/** What an install or remove command did; `output` is the end of what it printed, for the error message. */
export class CommandResult extends Schema.Class<CommandResult>("ExtensionCatalog.CommandResult")({
  ok: Schema.Boolean,
  output: Schema.String,
}) {}

/** Where AccessCode writes: the global config folder that config updates edit, and the global OpenCode skills folder. */
export class Paths extends Schema.Class<Paths>("ExtensionCatalog.Paths")({
  config: Schema.String,
  skills: Schema.String,
}) {}

/** The skills.sh search response, decoded where the server fetches it. */
export const SkillsResponse = Schema.Struct({
  skills: Schema.Struct({
    id: Schema.String,
    source: Schema.String,
    skillId: Schema.String,
    name: Schema.String,
    installs: Schema.Number.pipe(Schema.optionalKey),
  }).pipe(Schema.Array),
})

/** Whether a remote MCP server supports signing in with the browser, so it needs no key. */
export class SignIn extends Schema.Class<SignIn>("ExtensionCatalog.SignIn")({
  supported: Schema.Boolean,
}) {}

/** Which programs that run local MCP servers and skills are installed. */
export class Tools extends Schema.Class<Tools>("ExtensionCatalog.Tools")({
  node: Schema.Boolean,
  uv: Schema.Boolean,
  docker: Schema.Boolean,
}) {}
