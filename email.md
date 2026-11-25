Subject: Help test Access Code's new Windows voice features

Hi everyone,

We'd love your help testing voice features in Access Code on Windows x64.

## Get the test build

Visit the [Windows voice test release](https://github.com/Community-Access/access-code/releases/tag/windows-voice-test-20261122)
and open the **Assets** section. Download:

- [Portable edition: accesscode-portable-windows-x64.zip](https://github.com/Community-Access/access-code/releases/download/windows-voice-test-20261122/accesscode-portable-windows-x64.zip)

The download is public; you don't need a GitHub account or have to build the
code yourself. Please use these release assets rather than GitHub's source code
ZIP files.

We recommend starting with the portable edition. Extract the entire ZIP into a
new writable folder, then run `AccessCode Dev.exe`. Keep
`accesscode-portable.flag` beside it, and don't overwrite an existing portable
installation.

These are unsigned test builds, so Windows may display a publisher warning.
Verify that you downloaded them from the official release page before running
them. Windows ARM devices are not supported yet.

Portable ZIP SHA-256: `60a58ec4046f6203460f43355525f4ab9d5bef79a4e6fa85e8a3f6a52c13ef6b`

## Before you start

You'll need a Windows x64 computer, a microphone, speakers or headphones,
internet access for optional model downloads, and enough free disk space.
Start in a quiet room with headphones if possible. Use a disposable project
and conversation, and don't stop or replace a production app or server.

Open **Voice settings** near the message composer. Voice features require the
`windows_voice` experimental flag on the connected server; it's on by default
in development builds. If the controls are missing, record your build and
server configuration rather than changing a production server.

You can test the microphone and voice previews without sending a conversation
prompt. Actual conversational replies require a configured model provider.

## Testing scenarios

Please mark each scenario **pass**, **fail**, or **blocked**. It's fine to test
only the scenarios and equipment available to you.

1. **Check for automatic downloads.** Open **Optional voice models** and look
   for Whisper Tiny English, Moonshine Tiny English, Kokoro English and Piper
   LibriTTS English. Check that each shows its status, size, license, source
   and install control. Opening settings must not start a download. Windows
   voices and recognition depend on what's installed on your computer.
2. **Test your microphone.** Choose **Allow microphone and refresh list**,
   select a device, record a short sample, stop recording and play it back.
   Can you hear the correct microphone? Does recording stop? The sample
   shouldn't be sent to the conversation. Try a second microphone if available.
   If you deny permission or disconnect the selected device, check that the
   app clearly reports the problem instead of silently choosing another device.
3. **Preview voices.** Select an installed Windows voice under **Reply
   voice**, generate a preview and play it. Try another voice if available.
   Adjust reply volume and speed and listen for changes. Previewing should not
   send anything to the conversation.
4. **Install, cancel and remove models.** Install optional packs one at a
   time and check progress. Cancel a download, confirm it doesn't appear
   installed, then retry. If practical, test a network failure and recovery.
   Remove a selected pack and check that its selection becomes unavailable
   rather than silently switching. Reinstall it for later tests. Try removing
   a pack while it's in use and record what happens.
5. **Compare voice and recognition combinations.** Preview Kokoro and Piper.
   For Piper, try speaker numbers 1 and 904 and invalid values; invalid input
   must not preview a different speaker. Keep your reply voice selected while
   switching between Windows recognition, Whisper Tiny English and Moonshine
   Tiny English. Then keep recognition fixed while switching Windows, Kokoro
   and Piper voices. Check that your choices remain selected and work.
6. **Try dictation and Voice Mode.** Choose **Dictate**, say a short sentence,
   and stop. The text should appear in the composer without being sent.
   Clear or correct it. Start Voice Mode, speak a harmless prompt and pause.
   Check that it's sent once, the reply is spoken, and ending Voice Mode stops
   it. Try Ctrl+Alt+V for Voice Mode and Ctrl+Alt+S for **Stop Speaking**.
7. **Listen for recognition and pronunciation problems.** Repeat short and
   long phrases with each recognizer. Include names, a code term, a path,
   punctuation, negative and decimal numbers, and `20,000`. Compare Windows,
   Kokoro and Piper speech using contractions, `API`, "button", an unfamiliar
   word and `O'Connor`. Note missing words, incorrect pronunciations, pauses
   and delays. Unsupported characters or phonemes should produce an explicit
   error rather than being silently skipped.
8. **Interrupt a reply.** Try both **When I interrupt** choices: steering
   the current work and canceling it. Interrupt a long answer during
   generation and during playback, and try **Stop Speaking** separately.
   Check that speech stops, the selected session behavior occurs, your new
   words are retained once, and old audio doesn't resume.
9. **Check accessibility.** Use Tab and Shift+Tab and operate the controls
   without a mouse. Check visible focus, clear names and values, reading order,
   focus return, and announcements for progress and errors. If available, try
   NVDA, JAWS or Narrator, with headphones and speakers, and check readability
   at 200% zoom. Note if screen-reader or speaker audio triggers the microphone.
10. **Try real-world changes.** If available, try another microphone or
    output device, a noisy room, unplugging and reconnecting a device,
    sleep and resume, and offline use after installing models. Record anything
    you can't test as blocked.

For detailed steps and expected results, see the
[Windows voice testing guide](https://github.com/Community-Access/access-code/blob/93fd7da52598818a772483ca9c9b38f1da3cb6f6/packages/desktop/WINDOWS-VOICE-TESTING.md).
If voice settings are missing, check the guide's instructions for the
experimental flag on the connected server; don't change a production server
just to test.

Please reply with your Windows version, computer and CPU, which download you
used, microphone and output device, recognition and reply voice selections,
and screen reader and version if applicable. For each issue, include the steps,
what you expected, what happened, whether it happens again, and whether you
used headphones or speakers. Remove credentials, private paths and conversation
content from error messages. Don't send private conversations or recordings
without consent.

## What is local and what is hosted

The two groups of features have different privacy and cost boundaries:

- **Local dictation and speech options** stay on the test computer:
  Windows SAPI recognition and installed Windows voices, plus the optional
  Whisper Tiny English, Moonshine Tiny English, Kokoro English and Piper
  LibriTTS packs. Optional packs download only when you choose to install
  them. Dictation text is inserted into the composer and is not sent to a
  conversation until you submit it or deliberately use Voice Mode.
- **Hosted voice calls are not on-device.** The experimental call implementation
  sends live microphone audio over WebRTC to OpenAI's `gpt-live-1` model.
  Speech transcripts, session context and delegation instructions may also be
  sent to the hosted `gpt-6.1-sol` delegator and the tools/sessions it invokes.
  This is the reason a consent dialog now appears before every first Voice
  Call start: it identifies the hosted service, model boundary and possible
  charges. The dialog must be accepted before the call connects.

Voice answers and normal coding prompts use the model provider configured for
that server or session. Hosted Voice Call use may incur normal API or provider
charges, depending on the server's credentials and pricing. It is not covered
by the optional on-device model downloads.

## Voice models and capabilities under test

| Area | Current test scope |
|---|---|
| Windows baseline | Installed Windows SAPI voices and Windows speech recognition. Availability depends on the device. |
| Local recognition | Optional Whisper Tiny English and Moonshine Tiny English. English is the tested mode. |
| Local reply voices | Optional Kokoro English (about 152 MB) and Piper LibriTTS English, with independent reply selection. Piper exposes a 904-speaker numeric selector in the experimental implementation. |
| Hosted live voice | OpenAI `gpt-live-1` for live speech recognition/speech over WebRTC, plus `gpt-6.1-sol` for delegating coding and session actions. |
| Independent controls | Dictation, recognition engine, reply voice, volume, speed, interrupt behavior and stop-speaking controls. |
| Session actions | Session navigation, reads, status checks, steering, queued work, model listing/switching and opening or creating sessions. The delegator is instructed not to write code itself. |

Piper, Kokoro, Moonshine and Whisper are on-device/optional engine candidates.
Their quality, licenses, pronunciation, hardware compatibility and interruption
behavior are still under evaluation. Piper and Kokoro voices may not handle all
names, symbols or languages correctly. Unsupported text should produce an
explicit error rather than being silently omitted.

Do not test private audio or conversations. In particular, don't use the hosted
Voice Call path for sensitive project details unless you have explicit consent
and understand the provider and account terms. Remove credentials, private
paths and conversation content from reports. Note every uploaded/downloaded
asset, provider key, billing relationship and blocked capability in your
results.

This is a test build, not a stable release. Thank you for helping us make it
better!
