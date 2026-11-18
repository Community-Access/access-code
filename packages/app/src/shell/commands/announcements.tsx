import { useLanguage } from "@/runtime/i18n/language"
import { repeatLastAnnouncement, testAnnouncements } from "@/session/announce"
import { useCommand } from "./command"

export function AnnouncementCommands() {
  const language = useLanguage()
  const command = useCommand()
  command.register("announcements", () => [
    {
      id: "announcements.repeat",
      title: language.t("command.announcements.repeat"),
      category: language.t("command.category.view"),
      onSelect: () => repeatLastAnnouncement(language.t("command.announcements.empty")),
    },
    {
      id: "announcements.test",
      title: language.t("command.announcements.test"),
      description: language.t("command.announcements.test.description"),
      category: language.t("command.category.view"),
      onSelect: () => testAnnouncements(language.t("command.announcements.test.phrase")),
    },
  ])
  return null
}
