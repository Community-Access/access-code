from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

import wx

from lab_paths import DICTATION, DOWNLOADS, KOKORO
from voice_backend import Player, Voice, kokoro_voices, phonon_voices, piper_voices, voices

class EventLog:
    def __init__(self) -> None:
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
        self.path = base / "AccessCode" / "voice-lab" / "events.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.session = uuid.uuid4().hex

    def write(self, event: str, **fields: object) -> None:
        record = {"time": datetime.now(timezone.utc).isoformat(), "session": self.session, "event": event, **fields}
        with self.path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


class Listener:
    def __init__(self, frame: "Lab", token: int) -> None:
        self.frame = frame
        self.token = token

    def on_speech_started(self) -> None:
        self.frame.heard_start(self.token)

    def on_phrase_decoding(self) -> None:
        self.frame.decoding(self.token)

    def on_phrase(self, phrase: object) -> None:
        self.frame.heard_phrase(self.token, phrase.text)

    def on_partial(self, text: str) -> None:
        self.frame.heard_partial(self.token, text)

    def on_engine_notice(self, message: str) -> None:
        if self.token != self.frame.token or self.frame.closing:
            return
        self.frame.event("recognition_engine_switched", actual_engine="moonshine")
        self.frame.engine_notice.SetValue(message)
        self.frame.status(message)

    def on_failure(self, message: str) -> None:
        self.frame.listen_failed(self.token, message)

    def on_microphone_lost(self) -> None:
        if self.token != self.frame.token or self.frame.closing:
            return
        self.frame.status("Microphone lost; waiting for it to reconnect.")
        self.frame.event("microphone_lost")

    def on_microphone_back(self) -> None:
        if self.token != self.frame.token or self.frame.closing:
            return
        self.frame.status("Microphone reconnected.")
        self.frame.event("microphone_reconnected")


class Lab(wx.Frame):
    def __init__(self, root: Path) -> None:
        from quill.core.windows_dictation.model_catalog import CATALOGUE

        super().__init__(None, title="AccessCode Windows Voice Lab", size=(760, 760))
        self.root = root
        self.engines = (
            ("moonshine", "Moonshine Tiny (English)"),
            ("whisper", "Whisper Tiny (English or Spanish)"),
            *(
                (model.id, f"{model.name} ({'/'.join(model.languages)}, ~{round(model.download_bytes / 1_000_000)} MB)")
                for model in CATALOGUE
            ),
        )
        self.log = EventLog()
        self.playback = Player(lambda *args: wx.CallAfter(self.playback_event, *args))
        self.playing: int | None = None
        self.listening = False
        self.starting = False
        self.closing = False
        self.token = 0
        self.recognizer = None
        self.cancel_start = threading.Event()
        self.phrase_ignored = False
        self.decode_started = 0.0
        self.listen_started_at = 0.0
        self.voice_choices = []
        self.voice_models = []
        self.speaker_choices = []
        self.downloading = False
        self.cancel_download = threading.Event()

        panel = wx.ScrolledWindow(self, style=wx.VSCROLL)
        layout = wx.BoxSizer(wx.VERTICAL)

        def choice(label: str, choices: list[str]) -> wx.Choice:
            layout.Add(wx.StaticText(panel, label=label), 0, wx.LEFT | wx.RIGHT | wx.TOP, 10)
            control = wx.Choice(panel, choices=choices)
            if choices:
                control.SetSelection(0)
            layout.Add(control, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
            return control

        self.engine = choice("Speech recognition engine", [label for _, label in self.engines])
        self.language = choice("Recognition language", ["English", "Spanish"])
        layout.Add(wx.StaticText(panel, label="Recognition engine notice"), 0, wx.LEFT | wx.RIGHT | wx.TOP, 10)
        self.engine_notice = wx.TextCtrl(panel, style=wx.TE_READONLY)
        layout.Add(self.engine_notice, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        self.download_model = wx.Button(panel, label="Download selected recognition model")
        layout.Add(self.download_model, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        self.mode = choice("Scenario", ["Manual: one phrase", "Half-duplex: ignore speech during reply", "Barge-in: interrupt reply"])
        self.microphone = choice("Microphone", ["Windows default"])
        self.voice_engine = choice("Reply voice engine", [])
        self.voice = choice("Reply voice", [])
        self.speaker = choice("Piper speaker", [])
        self.refresh = wx.Button(panel, label="Refresh voices and microphones")
        layout.Add(self.refresh, 0, wx.ALL, 10)
        self.download_kokoro = wx.Button(panel, label="Download Kokoro voices (about 114 MB)")
        layout.Add(self.download_kokoro, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        self.cancel_download_button = wx.Button(panel, label="Cancel download")
        layout.Add(self.cancel_download_button, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)

        layout.Add(wx.StaticText(panel, label="Canned reply (editable; no AI request)"), 0, wx.LEFT | wx.RIGHT, 10)
        self.reply = wx.TextCtrl(
            panel,
            value="I have reviewed the request. I will check the code, make the change, and tell you what I found.",
            style=wx.TE_MULTILINE,
            size=(-1, 70),
        )
        layout.Add(self.reply, 0, wx.EXPAND | wx.ALL, 10)
        buttons = wx.BoxSizer(wx.HORIZONTAL)
        self.start_button = wx.Button(panel, label="Start listening")
        self.stop_button = wx.Button(panel, label="Stop listening")
        self.speak_button = wx.Button(panel, label="Speak reply")
        self.interrupt_button = wx.Button(panel, label="Interrupt reply")
        for button in (self.start_button, self.stop_button, self.speak_button, self.interrupt_button):
            buttons.Add(button, 0, wx.RIGHT, 8)
        layout.Add(buttons, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)

        layout.Add(wx.StaticText(panel, label="Recognized text"), 0, wx.LEFT | wx.RIGHT, 10)
        self.transcript = wx.TextCtrl(panel, style=wx.TE_MULTILINE | wx.TE_READONLY, size=(-1, 100))
        layout.Add(self.transcript, 1, wx.EXPAND | wx.ALL, 10)
        layout.Add(wx.StaticText(panel, label="Live preview (streaming models)"), 0, wx.LEFT | wx.RIGHT, 10)
        self.partial = wx.TextCtrl(panel, style=wx.TE_READONLY)
        layout.Add(self.partial, 0, wx.EXPAND | wx.ALL, 10)
        clear = wx.Button(panel, label="Clear recognized text")
        layout.Add(clear, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        self.rating = choice("Rate the last voice trial", ["Not rated", "Excellent", "Good", "Fair", "Poor"])
        rate = wx.Button(panel, label="Record rating")
        layout.Add(rate, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        self.state = wx.StaticText(panel, label="Ready.")
        layout.Add(self.state, 0, wx.ALL, 10)
        layout.Add(wx.StaticText(panel, label=f"Event log: {self.log.path}"), 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
        panel.SetSizer(layout)
        panel.SetScrollRate(0, 20)
        panel.FitInside()
        self.CreateStatusBar()
        self.refresh.Bind(wx.EVT_BUTTON, self.refresh_devices)
        self.engine.Bind(wx.EVT_CHOICE, self.engine_changed)
        self.voice_engine.Bind(wx.EVT_CHOICE, self.voice_engine_changed)
        self.voice.Bind(wx.EVT_CHOICE, self.voice_changed)
        self.download_model.Bind(wx.EVT_BUTTON, self.download_selected_model)
        self.download_kokoro.Bind(wx.EVT_BUTTON, self.download_kokoro_voices)
        self.cancel_download_button.Bind(wx.EVT_BUTTON, lambda event: self.cancel_download.set())
        self.start_button.Bind(wx.EVT_BUTTON, self.start_listening)
        self.stop_button.Bind(wx.EVT_BUTTON, lambda event: self.stop_listening())
        self.speak_button.Bind(wx.EVT_BUTTON, lambda event: self.speak())
        self.interrupt_button.Bind(wx.EVT_BUTTON, lambda event: self.interrupt("button"))
        interrupt_id = wx.NewIdRef()
        self.Bind(wx.EVT_MENU, lambda event: self.interrupt("keyboard"), id=interrupt_id)
        self.SetAcceleratorTable(wx.AcceleratorTable([(wx.ACCEL_CTRL | wx.ACCEL_SHIFT, ord("I"), interrupt_id)]))
        clear.Bind(wx.EVT_BUTTON, lambda event: self.transcript.Clear())
        rate.Bind(wx.EVT_BUTTON, self.record_rating)
        self.Bind(wx.EVT_CLOSE, self.close)
        self.refresh_devices()
        self.event("lab_started")
        self.update_buttons()

    def event(self, name: str, **fields: object) -> None:
        self.log.write(
            name,
            scenario=self.mode.GetStringSelection(),
            recognition=self.engine.GetStringSelection(),
            language=self.language.GetStringSelection(),
            **fields,
        )

    def status(self, text: str) -> None:
        if self.closing:
            return
        self.state.SetLabel(text)
        self.SetStatusText(text)

    def update_buttons(self) -> None:
        from quill.core.read_aloud import kokoro_engine_ready
        from quill.core.windows_dictation.model_catalog import downloadable
        from quill.core.windows_dictation.model_store import installed

        model = downloadable(self.engines[self.engine.GetSelection()][0])
        idle = not self.listening and not self.starting and not self.downloading
        self.start_button.Enable(idle)
        self.stop_button.Enable(self.listening or self.starting)
        self.speak_button.Enable(bool(self.voice_choices))
        self.voice_engine.Enable(bool(self.voice_choices))
        self.voice.Enable(bool(self.voice_models))
        self.speaker.Enable(len(self.speaker_choices) > 1)
        self.interrupt_button.Enable(self.playing is not None)
        self.engine.Enable(idle)
        self.language.Enable(idle)
        self.mode.Enable(idle)
        self.microphone.Enable(idle)
        self.refresh.Enable(idle)
        self.download_model.Enable(idle and model is not None and not installed(model))
        self.download_kokoro.Enable(idle and not kokoro_engine_ready(KOKORO))
        self.cancel_download_button.Enable(self.downloading)

    def refresh_devices(self, event: object = None) -> None:
        from quill.core.windows_dictation.local_recognizer import list_input_names

        problems = []
        previous_microphone = self.microphone.GetStringSelection()
        microphones = ["Windows default", *list_input_names()]
        self.microphone.Set(microphones)
        self.microphone.SetSelection(microphones.index(previous_microphone) if previous_microphone in microphones else 0)
        try:
            available = voices()
        except Exception as error:
            available = []
            problems.append(f"Windows voices: {error}")
        try:
            available.extend(phonon_voices())
        except Exception as error:
            problems.append(str(error))
        try:
            available.extend(kokoro_voices())
        except Exception as error:
            problems.append(f"Kokoro voices: {error}")
        try:
            available.extend(piper_voices())
        except Exception as error:
            problems.append(f"Piper voices: {error}")
        previous = self.selected_voice()
        self.voice_choices = available
        engines = list(dict.fromkeys(voice.engine for voice in available))
        self.voice_engine.Set(engines)
        if engines:
            self.voice_engine.SetSelection(engines.index(previous.engine) if previous and previous.engine in engines else 0)
        self.voice_engine_changed(preferred=previous)
        self.status("; ".join(problems) if problems else "Ready. Choose a voice and scenario.")
        self.event("devices_refreshed", voice_count=len(available), microphone_count=self.microphone.GetCount(), warnings=len(problems))
        self.update_buttons()

    def selected_voice(self) -> Voice | None:
        index = self.speaker.GetSelection()
        return self.speaker_choices[index] if index != wx.NOT_FOUND and index < len(self.speaker_choices) else None

    def voice_engine_changed(self, event: object = None, preferred: Voice | None = None) -> None:
        engine = self.voice_engine.GetStringSelection()
        models = {}
        for voice in self.voice_choices:
            if voice.engine == engine:
                models.setdefault(voice.id, voice)
        self.voice_models = list(models.values())
        self.voice.Set([
            voice.name.rsplit(": ", 1)[0] if voice.engine == "Piper" and voice.speaker is not None else voice.name
            for voice in self.voice_models
        ])
        if self.voice_models:
            index = next((i for i, voice in enumerate(self.voice_models) if preferred and voice.id == preferred.id), 0)
            self.voice.SetSelection(index)
        self.voice_changed(preferred=preferred)

    def voice_changed(self, event: object = None, preferred: Voice | None = None) -> None:
        index = self.voice.GetSelection()
        model = self.voice_models[index] if index != wx.NOT_FOUND else None
        self.speaker_choices = [
            voice for voice in self.voice_choices if model and voice.engine == model.engine and voice.id == model.id
        ]
        self.speaker.Set([
            voice.name.rsplit(": ", 1)[-1] if len(self.speaker_choices) > 1 else "Default"
            for voice in self.speaker_choices
        ])
        if self.speaker_choices:
            index = self.speaker_choices.index(preferred) if preferred in self.speaker_choices else 0
            self.speaker.SetSelection(index)
        self.update_buttons()

    def engine_changed(self, event: object = None) -> None:
        from quill.core.windows_dictation.model_catalog import downloadable
        from quill.core.windows_dictation.model_store import installed

        model = downloadable(self.engines[self.engine.GetSelection()][0])
        if model and not installed(model):
            self.status("Model not downloaded. Use Download selected recognition model to install it.")
        else:
            self.status("Recognition model selected. Start listening to try it.")
        self.update_buttons()

    def download_selected_model(self, event: object = None) -> None:
        from quill.core.windows_dictation.model_catalog import downloadable
        from quill.core.windows_dictation.model_store import download, free_space_problem, installed

        model = downloadable(self.engines[self.engine.GetSelection()][0])
        if model is None or installed(model):
            return
        problem = free_space_problem(model)
        if problem:
            self.status(problem)
            return
        self.run_download(model.name, lambda progress, cancel: download(model, progress=progress, should_cancel=cancel))

    def download_kokoro_voices(self, event: object = None) -> None:
        def download(progress: Callable, cancel: Callable) -> Path:
            from quill.core.release_assets import fetch_component

            return fetch_component("kokoro", KOKORO, progress=progress, should_cancel=cancel)

        self.run_download("Kokoro voices", download)

    def run_download(self, name: str, download: Callable) -> None:
        if self.downloading:
            return
        try:
            from quill.core.release_assets import DownloadCancelled
        except ImportError as error:
            self.event("download_failed", component=name)
            self.status(f"Cannot start download: {error}")
            return
        self.downloading = True
        self.cancel_download = threading.Event()
        cancel = self.cancel_download
        self.status(f"Downloading {name}...")
        self.event("download_started", component=name)
        self.update_buttons()

        def run() -> None:
            last_percent = -1

            def progress(fraction: float, message: str) -> None:
                nonlocal last_percent
                percent = int(fraction * 100)
                if percent != last_percent:
                    last_percent = percent
                    wx.CallAfter(self.download_progress, message, percent)

            try:
                download(progress, cancel.is_set)
            except DownloadCancelled:
                wx.CallAfter(self.download_finished, name, "cancelled", "")
            except Exception as error:
                wx.CallAfter(self.download_finished, name, "failed", str(error))
            else:
                wx.CallAfter(self.download_finished, name, "finished", "")

        threading.Thread(target=run, daemon=True, name="voice-lab-download").start()

    def download_progress(self, message: str, percent: int) -> None:
        if not self.closing:
            self.status(f"{message}: {percent}%")

    def download_finished(self, name: str, result: str, error: str) -> None:
        if self.closing:
            return
        self.downloading = False
        self.event("download_" + result, component=name)
        self.refresh_devices()
        if result == "finished" and name == "Kokoro voices":
            index = self.voice_engine.FindString("Kokoro")
            if index != wx.NOT_FOUND:
                self.voice_engine.SetSelection(index)
                self.voice_engine_changed()
        self.status(f"{name}: {result}." if not error else f"{name} download failed: {error}")
        self.update_buttons()

    def start_listening(self, event: object = None) -> None:
        from quill.core.windows_dictation.local_recognizer import LocalDictationRecognizer, _load
        from quill.core.windows_dictation.model_catalog import downloadable
        from quill.core.windows_dictation.model_store import installed

        class NoReaderGate:
            def speaking(self) -> bool:
                return False

        class LabRecognizer(LocalDictationRecognizer):
            def _reader_gate(self) -> NoReaderGate:
                return NoReaderGate()

            def _prepare_engine(self) -> None:
                _load(self._engine, self._language)
                self._prepare_live()

        engine = self.engines[self.engine.GetSelection()][0]
        language = "en" if self.language.GetSelection() == 0 else "es"
        model = downloadable(engine)
        if (model and language not in model.languages) or (engine == "moonshine" and language != "en"):
            self.status("The selected model does not support this language. Choose another model or language.")
            return
        if model and not installed(model):
            self.status("Model not downloaded. Use Download selected recognition model first.")
            return
        self.token += 1
        token = self.token
        self.cancel_start = threading.Event()
        cancel = self.cancel_start
        microphone = "" if self.microphone.GetSelection() == 0 else self.microphone.GetStringSelection()
        self.starting = True
        self.listen_started_at = time.monotonic()
        self.phrase_ignored = False
        self.partial.Clear()
        self.engine_notice.Clear()
        self.status("Loading speech model and opening microphone...")
        self.event("listening_start_requested", engine=engine)
        self.update_buttons()

        def run() -> None:
            recognizer = LabRecognizer(
                Listener(self, token), engine, language=language, post=wx.CallAfter, pause_seconds=1.5
            )
            try:
                recognizer.start(microphone)
                if cancel.is_set():
                    recognizer.stop()
                    return
                wx.CallAfter(self.started, token, recognizer)
            except Exception as error:
                recognizer.stop()
                wx.CallAfter(self.listen_failed, token, str(error))

        threading.Thread(target=run, daemon=True, name="voice-lab-start").start()

    def started(self, token: int, recognizer: object) -> None:
        if self.closing or token != self.token:
            threading.Thread(target=recognizer.stop, daemon=True).start()
            return
        self.recognizer = recognizer
        self.starting = False
        self.listening = True
        self.status("Listening. Speak, then pause.")
        self.event("listening_started", startup_ms=round((time.monotonic() - self.listen_started_at) * 1000))
        self.update_buttons()

    def stop_listening(self) -> None:
        if not self.starting and not self.listening:
            return
        self.token += 1
        self.cancel_start.set()
        recognizer = self.recognizer
        self.recognizer = None
        self.listening = self.starting = False
        self.partial.Clear()
        if recognizer:
            threading.Thread(target=recognizer.stop, daemon=True, name="voice-lab-stop").start()
        self.status("Listening stopped.")
        self.event("listening_stopped")
        self.update_buttons()

    def heard_start(self, token: int) -> None:
        if token != self.token or not self.listening:
            return
        self.phrase_ignored = self.playing is not None and self.mode.GetSelection() == 1
        self.event("speech_detected", during_reply=self.playing is not None, ignored=self.phrase_ignored)
        if self.playing is not None and self.mode.GetSelection() == 2:
            self.interrupt("speech")
        if not self.phrase_ignored:
            self.status("Speech detected.")

    def heard_partial(self, token: int, text: str) -> None:
        if token != self.token or not self.listening or self.phrase_ignored:
            return
        self.partial.SetValue(text)

    def decoding(self, token: int) -> None:
        if token != self.token or not self.listening:
            return
        self.decode_started = time.monotonic()
        self.event("transcription_started")
        if not self.phrase_ignored:
            self.status("Recognizing speech...")

    def heard_phrase(self, token: int, text: str) -> None:
        if token != self.token or not self.listening:
            return
        text = text.strip()
        if self.engines[self.engine.GetSelection()][0].startswith("whisper") and text.casefold() in ("[silence]", "[ silence ]"):
            text = ""
        self.partial.Clear()
        elapsed = round((time.monotonic() - self.decode_started) * 1000) if self.decode_started else None
        ignored = self.phrase_ignored
        self.phrase_ignored = False
        self.event("transcription_finished", duration_ms=elapsed, characters=len(text), ignored=ignored)
        if ignored:
            return
        if not text:
            self.status("No words recognized.")
            return
        self.transcript.AppendText(text + "\n")
        self.status("Phrase recognized.")
        if self.mode.GetSelection() == 0:
            self.stop_listening()
        self.speak()

    def listen_failed(self, token: int, message: str) -> None:
        if token != self.token or self.closing:
            return
        self.event("listening_failed")
        self.stop_listening()
        self.status(f"Speech recognition failed: {message}")

    def speak(self) -> None:
        selected = self.selected_voice()
        text = self.reply.GetValue().strip()
        if selected is None or not text:
            self.status("Select a voice and enter a reply.")
            return
        self.playing = self.playback.play(selected, text)
        self.event("reply_requested", playback_id=self.playing, voice_engine=selected.engine, voice=selected.name, characters=len(text))
        self.status("Preparing reply...")
        self.update_buttons()

    def interrupt(self, reason: str) -> None:
        if self.playing is None:
            return
        self.playback.stop()
        self.event("reply_interrupted", playback_id=self.playing, reason=reason)
        self.playing = None
        self.status("Reply interrupted.")
        self.update_buttons()

    def playback_event(self, serial: int, event: str, elapsed: float, error: str) -> None:
        if self.closing:
            return
        self.event("reply_" + event, playback_id=serial, elapsed_ms=round(elapsed * 1000), current=serial == self.playing)
        if serial != self.playing:
            return
        if event == "synthesizing":
            self.status("Generating reply.")
            return
        if event == "playing":
            self.status("Speaking reply.")
            return
        self.playing = None
        self.status(f"Speech failed: {error}" if event == "error" else "Reply finished.")
        self.update_buttons()

    def record_rating(self, event: object = None) -> None:
        voice = self.selected_voice()
        self.event("rating", rating=self.rating.GetStringSelection(), voice=voice.name if voice else "")
        self.status("Rating recorded.")

    def close(self, event: wx.CloseEvent) -> None:
        self.cancel_download.set()
        self.stop_listening()
        self.playback.close()
        self.event("lab_closed")
        self.closing = True
        self.Destroy()


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Windows voice experiments")
    parser.add_argument("--quill-root", type=Path, default=Path(r"D:\quill"))
    args = parser.parse_args()
    if not (args.quill_root / "quill" / "__init__.py").is_file():
        parser.error(f"Quill checkout not found: {args.quill_root}")
    sys.path.insert(0, str(args.quill_root))
    os.environ["QUILL_DICTATION_MODELS"] = str(DICTATION)
    os.environ["QUILL_DICTATION_DOWNLOADS"] = str(DOWNLOADS)
    app = wx.App(False)
    frame = Lab(args.quill_root)
    frame.Show()
    app.MainLoop()


if __name__ == "__main__":
    main()
