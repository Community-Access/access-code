import { Button } from "@opencode/ui/button"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { repeatLastAnnouncement, testAnnouncements } from "@/session/announce"
import { SettingsList } from "./list"
import { conversationHeadingLevels, replyAnnouncementModes, useSettings } from "./model"
import { settingsViewUrl } from "./route"
import { SettingsRow } from "./row"
import { useSettingsSurface } from "./surface"

export function SettingsAccessibility() {
  const { t } = useLanguage()
  const { general } = useSettings()
  const surface = useSettingsSurface()
  const levels = [...conversationHeadingLevels]
  const label = (level: number) => t("settings.accessibility.headingLevel", { level })

  return (
    <>
      <div class="settings-tab-header">
        <h1 class="settings-tab-title">{t("settings.accessibility.title")}</h1>
      </div>
      <div class="settings-tab-body settings-tab-body--sectioned">
        <section class="settings-section">
          <h2 class="settings-section-title">{t("settings.accessibility.announcements")}</h2>
          <SettingsList>
            <SettingsRow
              action="settings-announce-replies"
              title={t("settings.accessibility.announceReplies")}
              description={t("settings.accessibility.announceReplies.description")}
            >
              <Select
                options={[...replyAnnouncementModes]}
                current={general.replyAnnouncement()}
                label={(mode) => t(`settings.accessibility.replyAnnouncement.${mode}`)}
                placement="bottom-end"
                onSelect={(mode) => mode !== null && general.setReplyAnnouncement(mode)}
              />
            </SettingsRow>
            <SettingsRow
              action="settings-announce-reply-copies"
              title={t("settings.accessibility.announceReplyCopies")}
              description={t("settings.accessibility.announceReplyCopies.description")}
            >
              <Switch checked={general.announceReplyCopies()} onChange={general.setAnnounceReplyCopies} />
            </SettingsRow>
          </SettingsList>
          <div class="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() =>
                testAnnouncements(
                  t("command.announcements.test.phrase"),
                  general.replyAnnouncement() === "ready" ? "polite" : "assertive",
                )
              }
            >
              {t("command.announcements.test")}
            </Button>
            <Button onClick={() => repeatLastAnnouncement(t("command.announcements.empty"))}>
              {t("command.announcements.repeat")}
            </Button>
          </div>
          <p class="mt-3 text-12-regular text-v2-text-text-muted">
            {t("settings.accessibility.notifications.description")}{" "}
            <A
              class="rounded-sm underline focus-visible:outline focus-visible:outline-2"
              href={settingsViewUrl({ type: "root", tab: "notifications" })}
              state={{ settings: { route: surface.route(), focusTab: "notifications" } }}
              replace
            >
              {t("settings.accessibility.notifications.link")}
            </A>
          </p>
        </section>
        <section class="settings-section">
          <h2 class="settings-section-title">{t("settings.accessibility.headings")}</h2>
          <SettingsList>
            <SettingsRow
              action="settings-user-heading-level"
              title={t("settings.accessibility.userHeadingLevel")}
              description={t("settings.accessibility.userHeadingLevel.description")}
            >
              <Select
                options={levels}
                current={general.userHeadingLevel()}
                value={String}
                label={label}
                placement="bottom-end"
                onSelect={(level) => level !== null && general.setUserHeadingLevel(level)}
              />
            </SettingsRow>
            <SettingsRow
              action="settings-assistant-heading-level"
              title={t("settings.accessibility.assistantHeadingLevel")}
              description={t("settings.accessibility.assistantHeadingLevel.description")}
            >
              <Select
                options={levels}
                current={general.assistantHeadingLevel()}
                value={String}
                label={label}
                placement="bottom-end"
                onSelect={(level) => level !== null && general.setAssistantHeadingLevel(level)}
              />
            </SettingsRow>
          </SettingsList>
        </section>
      </div>
    </>
  )
}
import { A } from "@solidjs/router"
