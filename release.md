# AccessCode 2.3.2-beta.6: Windows joins the release

**Released November 20, 2026**

AccessCode is an accessible, community-built AI coding assistant based on
OpenCode. This release brings the project’s Windows work to the download page,
alongside the signed macOS release. It also brings screen-reader-friendly chat
controls, more dependable ChatGPT sign-in, and a smoother desktop experience.

Thank you to everyone who tested builds, reported issues, reviewed changes, and
helped make this release possible. AccessCode is built in the open by its
community; this release reflects substantial work from **Taylor Arndt** and
**Jeff Bishop**, as well as the upstream OpenCode project.

## Get AccessCode

Download the release for your platform from the
[AccessCode 2.3.2-beta.6 release page](https://github.com/Community-Access/access-code/releases/tag/accesscode-2.3.2-beta.6).

- **Windows:** choose the signed installer for a standard installation, or the
  portable edition to run AccessCode from a folder. Keep the portable folder
  together; its `AccessCode-data` folder stores that copy’s settings and
  conversations.
- **macOS:** download the signed and notarized Apple silicon build.

Windows portable builds do not install automatic updates or register the
`opencode://` link handler. Check the release page for future versions.

## What’s new

### Windows desktop builds

Windows users can now install and run AccessCode from a portable folder. The
Windows packaging work covers the desktop app, installer, portable profile,
and release signing. Native desktop menus include access keys, such as **Alt+F**
for File, **Alt+E** for Edit, **Alt+V** for View, and **Alt+H** for Help.

### Chat settings that work better with screen readers

The new **Settings > Accessibility** page lets you choose how AccessCode
announces replies:

- Turn reply announcements off, hear a brief “Response ready” notice, or have
  the full reply read aloud (the default).
- Choose whether AccessCode announces when you copy a reply.
- Set the heading level used for your messages and assistant replies.
- Use **Test Announcements** and **Repeat Last Announcement** from the
  Accessibility settings, command palette, or **View > Accessibility**.

Announcements are typed and coordinated with the chat timeline so updates are
easier to follow with assistive technology.

### More reliable ChatGPT sign-in

ChatGPT sign-in now registers new AccessCode connections under the **Access
Code** name and has clearer recovery when the browser cannot return to the
application. You can paste the redirect address into the sign-in dialog to
finish the same attempt. Existing connections retain their client ID.

### Smaller desktop refinements

- **Command+Shift+P** lists commands, like VS Code, rather than mixing in other
  command-palette results.
- OpenCode Go remains available without being promoted.
- The Accessibility settings page and its screen-reader announcement regions
  have been clarified and tidied.

## A note on the OpenCode foundation

This release is based on OpenCode 2.3.2, bringing its upstream improvements and
fixes with it. Among them, GPT-6.2 prompt caching avoids repeatedly billing the
system prompt as uncached input, and `webfetch` no longer repeats its input URL
and format in structured output. AccessCode is a community project and is not
built by or affiliated with the OpenCode team.

## Community work in this release

Taylor Arndt led the AccessCode desktop and release groundwork: Windows
packaging and accessible chat preferences, signed macOS release automation,
provider and project documentation, desktop accessibility refinements, and
keeping the project’s links and release workflows aligned with the
Community-Access repository. Taylor also improved command-palette behavior and
kept OpenCode Go available without promoting it. Follow-up contributions
strengthened Windows release preparation, Linux CI, offline search tests, API
documentation builds, and generated-client coverage for shipped configuration
aliases. Dependabot security updates were also enabled.

Jeff Bishop contributed Windows installer and portable packaging, accessible
chat preferences and native menus, and improvements to ChatGPT registration
and sign-in recovery. Jeff also added the signed Windows release-candidate
workflow and updated the Windows release guidance.

Together, these contributions turn AccessCode from a Mac-focused release into
a cross-platform community project, while keeping accessibility at the center
of the desktop experience.

## Help shape what comes next

Please try AccessCode with your preferred screen reader, share feedback, and
report problems in the
[Community-Access/access-code issue tracker](https://github.com/Community-Access/access-code/issues).
Contributions are welcome; see the project’s
[contributing guide](https://github.com/Community-Access/access-code/blob/dev/CONTRIBUTING.md).
