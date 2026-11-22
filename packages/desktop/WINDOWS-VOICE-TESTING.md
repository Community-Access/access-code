# Windows voice test plan

This plan is for the experimental Windows x64 desktop build. It is not a
release approval. Windows ARM64 is not supported yet. Mark every case pass,
fail, or blocked; do not treat an untested scenario as a pass.

## Prepare

1. Download the unsigned installer or portable artifact from the Windows
   installer workflow run for the `windows-voice` branch. GitHub may require
   sign-in. Windows may warn that the publisher is unknown; verify the source
   and only run the build if you trust it.
2. Prefer the portable edition for initial testing. Extract the complete
   artifact to a new writable folder and keep `accesscode-portable.flag` beside
   `AccessCode Dev.exe`. Do not overwrite another portable folder or its
   `AccessCode-data` profile. The installer uses normal application data, so
   use a disposable Windows account or a backed-up test environment for it.
   Do not stop or replace a production app or server.
3. Use an x64 PC, a microphone, speakers or headphones, internet access for
   optional downloads, and sufficient disk space. Start with headphones in a
   quiet room. Actual conversational replies require a configured model
   provider and may incur its normal network charges.
4. Open a disposable project and session. The `windows_voice` experimental
   flag must be enabled on the connected server. It defaults on in dev builds;
   otherwise configure `experimental.windows_voice` or start the test server
   with `OPENCODE_FLAGS=windows_voice`. If controls are missing, record the
   build and server configuration rather than changing a production server.
   Open **Voice settings** from the message composer.
5. Record the Windows version, CPU, build and artifact, screen reader and
   version, microphone, output device, recognition engine, reply voice and
   whether headphones or speakers are used.

## Core checks

1. **No automatic downloads:** Inspect **Optional voice models**. Whisper
   Tiny English, Moonshine Tiny English, Kokoro English and Piper LibriTTS
   English should show status, size, license, source and install controls.
   Opening settings must not start a download. Installed Windows voices and
   speech recognition vary by machine.
2. **Microphone:** Choose **Allow microphone and refresh list**, select a
   microphone, record a short test, stop and play it back. Confirm the right
   device is heard, recording stops, and the sample is not sent to the session.
   Try the Windows default and another device if available. Deny permission and
   disconnect the selected device; expect an understandable error or unavailable
   state, not silent substitution. Restore permission and retry.
3. **Voice preview:** Choose an installed Windows voice, generate and play a
   preview. Try another voice if available. Adjust reply volume and speed and
   check for audible changes. Previews must not send anything to the session.
4. **Install, cancel and remove:** Install each optional pack separately.
   Check progress and completion and that no other pack starts automatically.
   Cancel a download and verify that it does not appear installed; retry.
   Test network failure and recovery. Remove a selected pack, confirm that its
   selection is shown as unavailable rather than silently replaced, and
   reinstall it. Attempt removal while the pack is in use; active work must
   not be corrupted or silently switch engines.
5. **Independent selections:** Preview Kokoro and Piper with each recognition
   engine. Keep the reply voice fixed while switching Windows recognition,
   Whisper Tiny English and Moonshine Tiny English; then keep the recognizer
   fixed while switching SAPI, Kokoro and Piper voices. Check that the selected
   combination persists and works without substitution. For Piper, preview
   speaker numbers 1 and 904, try invalid numbers, and verify that invalid
   input does not preview a different speaker.
6. **Dictation and conversation:** Choose **Dictate**, say a short sentence,
   and stop. Check that text appears in the composer without being sent.
   Clear or correct it. Start Voice Mode, speak a harmless prompt and pause.
   Check that it is sent once, the reply is spoken, and ending Voice Mode
   stops it. Try Ctrl+Alt+V for Voice Mode and Ctrl+Alt+S for **Stop Speaking**.
7. **Recognition and pronunciation:** Repeat short and long English phrases
   with each recognizer. Include names, code terms, a path, punctuation,
   negative and decimal numbers, and `20,000`. Listen to the same reply with
   SAPI, several Kokoro voices and several Piper speakers. Include
   contractions, `API`, "button", an unfamiliar word and `O'Connor`. Record
   omissions, misrecognitions, mispronunciations, unnatural pauses and cold
   versus warm delay. Unsupported characters or phonemes should produce an
   explicit error, not be silently skipped. These packs are English, not a
   multilingual support claim.

## Interruption, accessibility and resilience

1. Test both **When I interrupt** choices: stop speaking and steer current
   work, and stop speaking and cancel current work. Interrupt a long answer
   during generation and audible playback; test **Stop Speaking** separately.
   Speech must stop, session behavior must match the selected option, the new
   words must be retained once, and stale audio must not resume. Repeat at the
   beginning, middle and end of replies.
2. Repeat representative combinations with NVDA, JAWS and Narrator where
   available, using headphones and speakers. Tab and Shift+Tab through the
   dialog and operate all controls without a mouse. Check visible focus,
   meaningful names and values, focus return, reading order, announcements for
   progress, recording and errors, and readability at 200% zoom. Note false
   microphone triggers caused by screen-reader or speaker audio.
3. Check noisy and quiet environments, device unplug and reconnect,
   sleep and resume, offline operation after installation, and a lower-spec
   x64 machine if available. Record blocked cases. Local previews and
   microphone tests must not be sent to the conversation. Voice Mode prompts
   go to the configured model provider under its privacy and billing rules.
4. Before release, run at least 20 real interruption trials per candidate
   configuration with multiple participants. Suggested targets are median
   audible speech-onset-to-silence below 300 ms and at least 95% within 500 ms,
   measured acoustically with consent. These are targets, not guarantees.

## Record results

Record setup, steps, expected and actual behavior, pass/fail or blocked,
reproducibility and a short error message with credentials, private paths and
conversation content removed. Do not share recordings or private prompts
without consent. Treat crashes, incorrect interruption, silent substitution,
inaccessible controls and privacy surprises as release blockers.

Automated tests verified downloads, prerecorded recognition and generated
audio; they do not establish audible quality or usability. Live microphone,
listening, installation, human interruption and screen-reader testing remain
outstanding. Model terms, attribution and runtime notice completeness require
qualified review before public release.
