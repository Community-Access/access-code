# Windows voice lab

An experiment, not an AccessCode integration. It compares Quill's local
recognizers with installed Windows SAPI, Phonon, Kokoro, and Piper voices. It uses
canned responses; it does not connect to an AI provider or send prompts to an
AccessCode session.

## Setup

Use Python 3.12 on Windows and a local Quill checkout with the speech models
already present. From this directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe prepare_models.py --quill-root D:\quill
.\.venv\Scripts\python.exe app.py --quill-root D:\quill
```

The preparation command is an explicit, one-time request to copy existing
Quill assets and download missing models, including large recognition models
and all Piper voices in Quill's catalog. It requires many gigabytes and an
internet connection. It can be rerun to prepare missing models. Models are
stored in the ignored `models` directory here, not in Quill's model directories.
Installed Windows SAPI voices remain system-provided. The lab still uses Quill's
Python source and the isolated `.venv`.

All voice IDs in the Kokoro pack are listed. Japanese and Mandarin voice IDs
are marked **English phonemes only**: Quill's current ONNX path does not
provide the extra Japanese or Mandarin phonemizers.

The lab's
recognition selector includes the entire local Quill model catalog: Moonshine,
Whisper, streaming Nemotron, and Parakeet. Pair any supported recognizer with
any available reply voice and scenario. English and Spanish are available where
the selected model supports them. Spanish with built-in Whisper Tiny requires
Quill's multilingual Tiny model.

Optional models are **never downloaded automatically**. Select a model and
press **Download selected recognition model** when wanted; the selector shows
the approximate download size. Quill's verified recognition downloads can be
cancelled and resumed. Some models are over 1 GB. Kokoro voices have a separate
download button (about 114 MB). No model is downloaded merely by selecting it
or starting the lab. Piper voice downloads use Quill's upstream download path;
individual voice licenses vary and must be reviewed before redistribution.

## Try it

1. Select the recognizer, language, microphone, and scenario. Select a reply
   voice engine and voice; for a multispeaker Piper model, select its speaker.
   Stop listening before changing recognizer, language, microphone, or scenario.
2. Press **Start listening**, speak, and pause. The transcript appears, then
   the canned reply plays. **Stop listening** closes the microphone.
3. Use **Speak reply** to compare output voices without the microphone.
4. In **Barge-in**, speak during playback to interrupt it. Use headphones:
   this experiment does not provide acoustic echo cancellation, so speakers
   or a screen reader may trigger a false interruption. In **Half-duplex**,
   speech heard during the reply is discarded instead. **Manual** requires a
   fresh start for each phrase.
5. To interrupt manually, press **Interrupt reply** or **Ctrl+Shift+I** while
   the lab has focus. Streaming Nemotron displays provisional text separately
   from the final transcript.

The controls use standard wxPython widgets. Keyboard navigation, voice quality,
latency, live interruption, and screen reader interaction need testing on the
target machine. Phonon and Kokoro generate speech in short chunks; generation
already in progress cannot be stopped immediately, but its result is discarded.
Piper generation is stopped when interrupted.
Quill may switch an overloaded recognizer to Moonshine to keep up; the
recognition notice and log identify that switch. No echo cancellation is
provided, and the lab bypasses Quill's screen-reader speech gate specifically
to allow barge-in, so screen-reader speech can cause false interruptions.

See [Voice comparison and testing order](./VOICE-COMPARISON.md) for the
common-sample results, recommendations, and a manual test plan.

Run the focused checks from this directory with
`.\.venv\Scripts\python.exe -m unittest -v test_app`. If Quill is not at
`D:\quill`, set `QUILL_ROOT` to its checkout before running the tests.

## Logs and privacy

The app writes JSON Lines to `%LOCALAPPDATA%\AccessCode\voice-lab\events.jsonl`.
Events include engine names, language, startup and playback timings, playback
IDs, download outcomes, and ratings; speech audio, provisional text, and
transcript content are not logged. The current transcript remains visible in
the application until cleared or closed. Recognition and synthesis run locally
and do not upload audio. Explicit model downloads use the internet. Logs can
reveal installed voice names.
