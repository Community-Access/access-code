import { displayName } from "@opencode/ui/project-avatar"

/** A project's name for reading and display. A project at the top of the disk is named "/", which screen readers announce as a stray "slash", so it reads as the root folder instead. */
export function projectLabel(project: { name?: string; worktree: string }, rootFolder: string) {
  const name = displayName(project)

  return /^[/\\]+$/.test(name) ? rootFolder : name
}
