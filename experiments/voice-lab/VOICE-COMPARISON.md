# Windows voice lab: results and testing order

## Access Code test branch status

The `windows-voice` branch currently provides Windows SAPI voices and recognition,
plus optional, independently selected Whisper Tiny English and Moonshine Tiny
English recognition downloads. Both verified downloads and transcription of
a prerecorded sample through the latest packaged x64 portable executable have
been tested. Its SAPI helper also enumerated installed voices and generated a
nonempty WAV. These checks did not use a live microphone or test playback. The
[previous x64 test build](https://github.com/Community-Access/access-code/actions/runs/44981642307)
produced unsigned installer and portable artifacts. A
[new x64 build](https://github.com/Community-Access/access-code/actions/runs/44983007534)
includes the flag and bundled notices and produced unsigned installer and portable
artifacts. A [newer x64 build](https://github.com/Community-Access/access-code/actions/runs/45070273500)
includes Moonshine and produced unsigned installer and portable artifacts.
The [previous Kokoro x64 test build](https://github.com/Community-Access/access-code/actions/runs/45075025842)
also includes experimental Kokoro speech.

An experimental Kokoro English pack is available in that test build.
Its verified on-demand download and
synthesis were tested with the downloaded Windows x64 portable artifact. It uses
a phonemizer with a neural fallback; unsupported characters produce an error
instead of being omitted. Pronunciation and live playback still need human
testing. The newer test-branch implementation adds an optional Piper LibriTTS
English pack; the linked Kokoro build above does **not** contain it. The
[Piper x64 build run](https://github.com/Community-Access/access-code/actions/runs/45078882712)
successfully produced unsigned installer and portable artifacts for commit
`73130c4690`. The [public test prerelease](https://github.com/Community-Access/access-code/releases/tag/windows-voice-test-20261122)
provides the same builds without requiring GitHub sign-in. The test
branch includes the experimental `windows_voice` flag. Live microphone,
interruption, and screen-reader testing remain release gates. Windows ARM64
builds are paused until supported.

## Clear-cut recommendations

**Yes: aim to offer all compatible, license-cleared local options on demand.**
People should be able to choose recognition and reply voices independently,
without downloading the whole catalog or needing a paid cloud account. The
current lab demonstrates candidates, not a finished AccessCode integration or
proof that every option is ready to ship.

| Option | Recommendation | Cost and conditions |
|---|---|---|
| Windows SAPI | Offer installed voices as the zero-download baseline and fallback. | Uses voices already installed in Windows; availability varies by device. |
| Kokoro | Offer as an optional quality candidate; let users choose its voices. | Download its pack only on request, about 152 MB; listening tests must determine quality. |
| Phonon S English | Offer as another optional local voice family. | Review model, runtime, and voice licenses and hardware compatibility. |
| Piper | Offer individual compatible voice packs on demand, with searchable model and speaker selection. | Download only the selected pack; check each voice's license. |
| Moonshine and Whisper Tiny | Offer the small local recognizers as starting choices. | The lab has these prepared; final installer and download sizes need measurement. |
| Nemotron streaming | Offer as an explicitly selected on-demand recognition option. | About 682 MB download; streaming behavior and performance need human testing on different PCs. |
| Other Whisper, Parakeet, and Moonshine models | Offer compatible, validated models as advanced on-demand choices. | Show download size, supported languages, disk space, and device requirements first. |
| VS Code-inspired path | Offer compatible local models without requiring VS Code. Investigate extension integration separately. | The lab does not integrate the VS Code extension. |

### Speech-engine implementation decision

**Recommendation: evaluate the experimental Kokoro and Piper paths separately.**
The [Misaki ONNX phonemizer candidate](https://huggingface.co/nekwo/misaki-en-us-g2p-onnx)
declares Apache-2.0 components and includes a neural fallback for words not in
its lexicons. The experimental integration normalizes common English text,
numbers, paths, and code symbols, and reports unsupported characters. It does
not implement all of Misaki's linguistic processing, so pronunciation and
coverage need further evaluation.

An isolated Windows x64 experiment verified the pinned Misaki files and used
ONNX Runtime Node 1.30.0 and Sherpa in separate Electron child processes, avoiding
a conflict between their different ONNX Runtime versions. In an isolated
electron-builder payload and downloaded portable artifact, both recognizers transcribed the prerecorded sample,
two Kokoro speakers produced different WAVs, and long speech crossed a chunk
boundary without apparent truncation. An unfamiliar word exercised the neural
fallback. These checks do not establish natural pronunciation or playback quality.
The ONNX Runtime Node third-party notices came from the official Python wheel
of the same version; its DLL differs from the npm DLL, so notice completeness
for the npm distribution still needs a qualified review before release.

The established Piper path uses eSpeak NG for phonemization. Sherpa 2.x removed
that dependency and supports external phonemization instead; see the
[Sherpa migration guidance](https://k2-fsa.github.io/sherpa/onnx/faqs/update-v1.x-to-v2.x-espeak-ng.html).
An alternative, [OpenPhonemizer ONNX](https://huggingface.co/nekwo/openphonemizer-en-us-onnx),
declares BSD-3-Clause-Clear for its model and dictionary and targets English
Piper voices. Its sample runner also filters unsupported symbols, so it needs
the same normalization and no-silent-omission work before use. It does not
establish support for Piper's other languages.

An isolated Windows x64 prototype now generates nonempty audio using the
OpenPhonemizer neural model and Sherpa's Piper/VITS path. The phonemizer also
produced a pronunciation for the unfamiliar word "frobnication." A
US-English-trained LibriTTS voice avoids the accent mismatch of the
LJSpeech model, whose phonemes are trained for eSpeak's British `en`.
The [LibriTTS model card](https://huggingface.co/rhasspy/piper-voices/blob/375a0fe641dea077c2a47b4e9a056d6da521eed3/en/en_US/libritts/high/MODEL_CARD)
reports training from scratch on a CC BY 4.0 dataset; the dataset attribution
and model and runtime terms still need review.

The experimental branch integrates this as an optional download with 904
numbered speakers and a numeric speaker selector rather than a 904-item menu.
Common contractions and acronyms are handled, unfamiliar words use the neural
model, and a syllabic-n phoneme is expanded to an explicit schwa plus n.
Unsupported text and other unsupported phonemes produce errors, not silent
omissions. Unrecognized apostrophe forms are spoken with the word
"apostrophe", so names such as O'Connor need listening evaluation.
The verified download, cancellation and pack protections use the shared
voice-pack infrastructure. Real-model tests and an isolated packaged
executable produced nonempty audio. Audio generation does not establish that
any speaker sounds good or pronounces words correctly.

eSpeak NG is GPL-3.0-or-later. Evaluate the distribution and source obligations
with a qualified license reviewer before including or distributing that engine;
an optional download does not by itself resolve the question. Review each
voice's model and training-data terms separately: for example, the
[Piper Amy model card](https://huggingface.co/rhasspy/piper-voices/blob/refs%2Fpr%2F98/en/en_US/amy/medium/MODEL_CARD)
refers to its dataset rather than granting blanket rights for all voices.

The experimental Kokoro voice is for evaluation, not release readiness.
Pronunciation, live interruption, accessibility behavior, and the bundled
runtime notices still need review. Piper also needs listening, accessibility,
interruption and qualified license review before public release.

Use a local pipeline with speech detection, recognition, an AccessCode session,
and cancellable speech output. **Interruption is a release gate**, not an
optional enhancement. Provide a manual interrupt, a selectable microphone,
and clear status when a selected engine is unavailable or changes.

Broad choice is a good goal, but availability must be honest: verify Windows
support, model and voice licenses, redistribution rights, notices, provenance,
and integrity before offering each download. Show progress and errors, support
removal, and never silently substitute another model. A large catalog needs
search and sensible defaults, not thousands of flat choices. No model is
automatically downloaded just because the user opens voice settings.

Local inference has no per-request cloud fee, but downloads, disk space,
electricity, and the user's hardware still have costs. Taylor's Apple MLX path
is not a Windows implementation. The Phonon S English model card in this lab
says Apache 2.0; do not assume other Phonon models or Piper voices have the
same license.

### Fresh SAPI and Kokoro results

On this Windows 11 machine, both installed SAPI voices (David and Zira) and
three Kokoro voices (Heart, Bella, and Adam) each completed three playback
interruption trials: **15 of 15 reported cancellation**. The first Kokoro
Heart trial reported playback starting after 2,687 ms; subsequent Kokoro
trials reported 781–844 ms. SAPI reported 62–250 ms. Cancellation callbacks
arrived 78–188 ms after the stop request for SAPI and 31–47 ms for Kokoro.

These are a few local worker-event timings, not guaranteed startup times or
measurements of audible silence. A synthetic speech sample through Nemotron's
voice activity detection also triggered playback cancellation once for SAPI
and once for Kokoro. This did not test a human speaker, echo cancellation, or
screen-reader interaction. All 2 installed SAPI voices and all 54 Kokoro
voice IDs also passed the earlier nonempty-audio check. The numbers do not
establish which voice sounds better.

The [SAPI and Kokoro playback results](./models/sapi-kokoro-playback-20261121.json)
contain the individual trial timings. Ask people to listen, interrupt
naturally, and use screen readers before selecting a default.

## What was tested

Date: 21 November 2026. Tested on Windows 11 with an Intel Core Ultra 7 265H
(16 logical processors). This is a local experiment, not an AccessCode voice
mode or a production benchmark. It uses canned responses and Quill's local
speech implementation.

Every listed recognizer received the same short synthetic English phrase,
“Please check the project settings.” Each was loaded from this lab's isolated
model folder and returned text. This is a **single functional check**, not an
accuracy benchmark. It does not evaluate accents, noise, Spanish, live
microphone use for every engine, memory use, or sustained streaming.

| Recognizer | Same-sample result | Optional catalog download |
|---|---|---:|
| Moonshine Tiny | Exact words | Built in to the lab |
| Whisper Tiny English | Exact words | Built in to the lab |
| Whisper Tiny multilingual, Spanish mode | Returned “PLEASE CHEC THE PROJEC SETTINGS!” with a replacement character | Built in to the lab |
| Nemotron streaming 0.6B | Exact words | ~682 MB |
| Parakeet Unified 0.6B | Exact words | ~663 MB |
| Parakeet TDT 0.6B v3 | “Pleck the project settings.” | ~670 MB |
| Whisper small | Exact words | ~375 MB |
| Whisper base | Exact words | ~161 MB |
| Whisper base.en | Exact words | ~161 MB |
| Whisper medium | Exact words | ~946 MB |
| Whisper large-v3-turbo | Exact words | ~1,037 MB |
| Whisper large-v3 | Exact words | ~1,776 MB |
| Moonshine base | Exact words | ~141 MB |

“Exact words” ignores capitalization and punctuation. One synthetic sentence
cannot establish a ranking: the Parakeet TDT result is an observation to
investigate, not evidence that the model is generally inferior. The
multilingual model was tested in Spanish mode using the same English sample,
so its result does not measure Spanish recognition. A Spanish sample is still
needed.

For voices, the same English sentence was synthesized separately for every
discovered selection. The automated check verifies that a nonempty, nonzero
WAV was produced; it does **not** judge intelligibility, naturalness, accent,
correct pronunciation, playback quality, or interruption. Piper speakers were
batched by model for speed using Piper's JSON input; the lab's playback path
starts Piper separately and was checked independently.

| Voice engine | Available selections | Functional result |
|---|---:|---|
| Installed Windows SAPI | 2 | 2 passed |
| Phonon | 38 | 38 passed |
| Kokoro | 54 | 54 passed |
| Piper | 2,007 speakers across 39 models | 2,007 passed |

The English sentence is not a native-language evaluation of the two Italian
Piper models or Kokoro's Japanese and Mandarin voice IDs. Quill's current
Kokoro path labels those 13 IDs **English phonemes only**. Some recognizers
support Spanish, but this lab's Phonon model is English; recognition language
and reply voice language should be evaluated separately.

The common-sample raw per-voice results are in the lab's ignored `models`
folder: [Windows SAPI results](./models/voice-check-20261121-sapi.jsonl),
[Phonon results](./models/voice-check-20261121-phonon.jsonl),
[Kokoro results](./models/voice-check-20261121-kokoro.jsonl), and
[Piper results](./models/voice-check-20261121-piper.jsonl). They contain
only the fixed test sentence's output metadata, not human speech. Results are
specific to this machine and available voices. Re-run a group from the lab
directory, using a new output filename:

```powershell
.\.venv\Scripts\python.exe compare_voices.py --group piper --output models\voice-check-piper-new.jsonl
```

Replace `piper` with `sapi`, `phonon`, or `kokoro` to run the other groups.
The runner refuses to overwrite an existing results file. The Piper sweep can
take tens of minutes and use substantial CPU and temporary disk space.

## Interruption: evidence and gaps

- Automated lab tests cover the barge-in decision, half-duplex behavior, and
  stale callbacks. Real playback cancellation was exercised for SAPI, Phonon,
  Kokoro, and Piper; Piper was also stopped during synthesis.
- Synthetic speech through Nemotron's voice activity detection triggered a
  real SAPI playback interruption. This is not a test of a human speaking,
  every recognizer and voice combination, or actual audible stop latency.
- Phonon and Kokoro synthesize in chunks. Current in-progress synthesis cannot
  be stopped immediately, although its result is discarded; Piper's child
  process is terminated. Output playback can be aborted.
- No acoustic echo cancellation is provided. Speaker output or screen-reader
  speech can trigger false interruptions. Start with headphones and then test
  speakers deliberately. The prototype bypasses Quill's screen-reader speech
  gate to allow barge-in, so this needs particular care.
- The lab logs event timings, not measured acoustic silence. Do not equate an
  interruption event with proof of when the user stopped hearing audio.

## Access Code desktop: hands-on test plan

This plan is for the Windows x64 Access Code desktop test build, not the
separate lab below. It is not a release approval. The older linked build
contains Kokoro but not Piper; the updated branch adds Piper. Phonon,
Nemotron and the other lab-only choices are **not** available. Windows ARM64
is paused. Report a result as **pass**, **fail**, or **blocked**; do not treat
a missing feature or an untested scenario as a pass.

### Prepare a safe test

1. Download the unsigned [installer](https://github.com/Community-Access/access-code/releases/download/windows-voice-test-20261122/accesscode-desktop-win-x64.exe)
   or [portable edition](https://github.com/Community-Access/access-code/releases/download/windows-voice-test-20261122/accesscode-portable-windows-x64.zip)
   from the [public test prerelease](https://github.com/Community-Access/access-code/releases/tag/windows-voice-test-20261122).
   No GitHub account is required. The older Kokoro-only build does not include
   Piper. These are unsigned test builds, not a stable release; Windows may
   warn that the publisher is unknown. Verify the source
   and only run them if you trust this test build.
2. Prefer the portable edition for initial testing. Extract the complete archive
   to a **new writable folder**; keep `accesscode-portable.flag` beside
   `AccessCode Dev.exe`. Do not overwrite another portable folder or its
   `AccessCode-data` profile. The portable app creates a separate profile and
   service state in its own folder. Back up any profile you care about.
   The installed build uses normal configuration and conversation history, so
   use a disposable Windows account or a backed-up test environment for it.
   Do not stop or replace a running production app or server to run this test.
3. Use Windows x64, working speakers or headphones, a microphone, internet for
   model downloads, and enough free disk for the optional packs. Start with
   headphones in a quiet room. A configured model provider is needed for actual
   conversational replies; its normal network use and charges still apply.
4. Open a disposable project and session. The `windows_voice` experimental
   flag must be enabled **on the connected server**. It defaults on in dev
   builds; otherwise configure `experimental.windows_voice` or start that test
   server with `OPENCODE_FLAGS=windows_voice`. If controls are missing, record
   the build and server configuration rather than changing a production server.
   Find **Voice settings** by the message composer.
5. Before each test, note Windows version, machine/CPU, build and artifact,
   screen reader and version, microphone, output device, selected recognition
   engine and voice, and whether headphones or speakers are used.

### Core checks

1. **No surprise downloads.** Open **Voice settings** and inspect **Optional
   voice models** before choosing anything. Pass if Whisper Tiny English,
   Moonshine Tiny English, Kokoro English and, in a Piper build, Piper LibriTTS
   English show their status, size, license,
   source and an appropriate install control, and opening settings alone does
   not start a download. Installed Windows voices and Windows speech
   recognition depend on the machine.
2. **Microphone.** Choose **Allow microphone and refresh list**, then select a
   device under **Microphone**. Choose **Record microphone test**, speak a
   short sentence, choose **Stop recording**, and play **Microphone test
   playback**. Pass if the correct device is heard, recording stops, the
   recording is not sent to the session, and controls and status are usable
   by keyboard and screen reader. Test the Windows default and a second device
   if available. Deny microphone permission and disconnect the selected device:
   expect an understandable error or unavailable state, not silent use of a
   different device. Restore permission and retry.
3. **Voice preview and controls.** Select an installed Windows voice under
   **Reply voice**, choose **Generate voice preview**, and play **Voice
   preview playback**. Repeat with a second installed voice if available. Adjust
   **Reply volume** and **Reply speed** and verify audible changes; restore
   comfortable settings. Pass if the selected voice is heard, errors are
   reported, and the preview does not send anything to the session.
4. **Install, cancel and remove.** Install each optional pack separately.
   Confirm download progress and completion and that no other pack starts
   automatically. Cancel an in-progress download and verify it stops without
   appearing installed; retry and verify installation. Test a network failure
   and recovery. Remove a pack after use and check its unavailable selection
   is explicitly shown rather than silently replaced. Reinstall it for later
   checks. Attempt removal while the pack is actively in use and record the
   result; active work must not be corrupted or silently switch engines.
   Downloads require network access; model inference is local.
5. **Independent selections.** With Kokoro and Piper installed, choose each
   voice and preview it. For Piper, change **Piper speaker number (1 to 904)**
   and confirm the preview changes; test 1, 904 and invalid values. Switch
   **Speech recognition** among Windows speech recognition,
   Whisper Tiny English and Moonshine Tiny English while keeping the same
   reply voice. Then switch between SAPI, Kokoro and Piper voices while keeping
   the recognizer fixed. Pass if each selected combination remains selected and
   works without silently substituting another engine.
6. **Dictation versus conversation.** In a fresh message box, choose
   **Dictate**, say “Please check the project settings,” and choose
   **Stop dictation**. Pass if recognized words appear in the composer but
   are not sent automatically. Correct or clear the text. Then choose **Start
   Voice Mode**, speak a harmless prompt and pause. Pass if the phrase is sent
   once, the reply is spoken, and **End Voice Mode** stops the mode. Try
   Ctrl+Alt+V for the mode and Ctrl+Alt+S for **Stop Speaking**; verify they
   work in the desktop app without interfering with screen-reader shortcuts.
7. **Recognition and pronunciation.** Repeat the same short and long English
   phrases with each installed recognizer. Include names, a code term, a path,
   punctuation, negative and decimal numbers, and `20,000`. Listen to the
   same reply with SAPI, several Kokoro voices and several Piper speakers.
   Include contractions, `API`, “button” and an unfamiliar word. Record omissions,
   misrecognitions, mispronunciations, unnatural pauses and cold versus warm
   delay. Try an emoji and accented text with Kokoro: currently unsupported
   characters should produce an explicit error, not be silently skipped; Piper
   likewise reports unsupported text or phonemes.
   These packs are English; this is not a multilingual support claim.

### Interruption, accessibility and resilience

1. Test both **When I interrupt** choices: **Stop speaking and steer the
   current work** and **Stop speaking and cancel the current work**. Use a
   long answer, interrupt during generation and again during audible playback,
   and test **Stop Speaking** separately. Pass only if speech actually stops,
   the subsequent session behavior matches the chosen option, the new words
   are retained once, and no stale audio resumes. Repeat at the beginning,
   middle and end of replies. Record failures and false triggers.
2. Repeat representative combinations with NVDA, JAWS and Narrator where
   available, first with headphones and then speakers. Tab and Shift+Tab
   through the dialog; operate selects, sliders, buttons and audio controls
   without a mouse. Check visible focus, meaningful names and values, focus
   return on close, reading order, announcements for download progress,
   recording, completion and errors, and readability at 200% zoom. Note if
   screen-reader or speaker audio falsely triggers the microphone or makes
   spoken replies unusable. Automated checks cannot replace these trials.
3. Check quiet and noisy environments, a different microphone or output
   device, device unplug/reconnect, sleep/resume, offline operation after
   installation, and a lower-spec x64 machine if available. Explicitly record
   blocked cases. Confirm local previews and microphone tests are not sent to
   the conversation. Voice Mode prompts are sent to the configured model
   provider and follow its privacy and billing rules.
4. For a release decision, run at least 20 real interruption trials per
   candidate configuration with multiple participants. Suggested targets are
   median audible speech-onset-to-silence below 300 ms and at least 95% within
   500 ms, measured acoustically with consent. These are proposed targets,
   not guarantees; event timestamps alone do not measure audible silence.

### Record and report

For each case record the setup, steps, expected and actual behavior, pass/fail
or blocked, reproducibility, and a short error message with credentials,
private paths and conversation content removed. Include whether the problem
occurred with headphones, speakers or a screen reader. Do not share microphone
recordings or private prompts without consent. Report crashes, incorrect
interruption behavior, silent engine substitution, inaccessible controls and
privacy surprises as release blockers.

**Evidence so far:** verified model downloads, prerecorded recognition and
generated WAVs through the packaged portable executable were automated.
Live microphone, audible playback and quality, installer behavior, human
interruptions and screen-reader testing have not yet been completed. Runtime
third-party notice completeness still needs qualified review before release.

## Lab-only suggested hands-on testing order

Open the lab using the [setup instructions](./README.md). Begin with
headphones, a quiet room, and the same microphone for each comparison.

1. **Baseline and accessibility.** Select Moonshine Tiny, a Windows SAPI
   voice, and **Manual**. Speak “Please check the project settings,” then try
   **Speak reply** and **Ctrl+Shift+I**. Navigate all controls with the
   keyboard; try NVDA or another screen reader. Confirm labels, focus, status
   announcements, and that stopping listening releases the microphone.
2. **Interruption first.** Select **Barge-in**. Start a long editable reply and
   interrupt it with a new spoken sentence. Repeat at least ten times, at the
   start, middle, and end of speech; check that playback stops and the new
   phrase is recognized once. Repeat with **Half-duplex** and confirm speech
   during playback is discarded. Test manual interruption during both
   generation and playback. Do not infer success from the button alone.
3. **Voice quality.** Keep the recognizer and microphone fixed. Compare
   Windows SAPI, Phonon Default, Kokoro Heart, and Piper Amy medium, then try
   other voices and Piper speakers. Use the same short sentence and a longer
   reply with code terms, paths, numbers, and punctuation. Rate naturalness,
   intelligibility, pronunciation, startup delay, and interruption separately;
   the lab's rating button records a simple overall rating.
4. **Recognition.** Keep the preferred voice fixed. Compare Moonshine Tiny,
   Whisper Tiny, Nemotron, Whisper base, Parakeet Unified, Parakeet TDT, and
   then the remaining Whisper and Moonshine models. Use the same sentences,
   including a code phrase and a natural pause. Test supported Spanish models
   separately with a native Spanish sentence. Note errors, cold startup,
   warm response, memory, and whether streaming preview remains responsive.
   A visible engine-switch notice means the selected model did not remain in
   use; record that rather than attributing the result to the original model.
5. **Realistic accessibility and device conditions.** Repeat representative
   combinations with a screen reader, speakers, different microphones, noisy
   rooms, slow and fast speech, and lower-spec Windows hardware. Check false
   interruptions, screen-reader feedback, unplug/reconnect, sleep/resume, and
   missing-model behavior. Do not intentionally upload recordings.
6. **Optional large models.** Only after the baseline works, compare Whisper
   small, medium, turbo, and large-v3. Judge whether any quality gain justifies
   disk space, cold-start time, memory, and responsiveness.

For a prospective release gate, record at least 20 real spoken interruption
trials per candidate configuration. A suggested target is median audible
speech-onset-to-silence under 300 ms and at least 95% stopping within 500 ms;
these are proposed goals, not measured results. Measure actual sound with an
appropriate local audio setup and explicit consent; event logs alone are not
enough. Include missed interruptions, false triggers, retained user words,
screen-reader interaction, and any safety or privacy problems. Test with
multiple people before choosing a default voice.

## Privacy and limitations

Recognition and voice synthesis are local. Optional downloads use the internet.
The lab's normal JSONL event log records selected engines, timings, and ratings,
but not speech audio or recognized text. It can reveal installed voice names.
The visible transcript remains on screen until cleared or closed. The lab
stores about 9.29 GiB of prepared assets on this machine; production should
not require downloading this entire testing inventory.
