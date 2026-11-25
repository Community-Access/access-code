from __future__ import annotations

import json
import queue
import subprocess
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Callable

from lab_paths import KOKORO, PHONON, PIPER, PIPER_ENGINE


@dataclass(frozen=True)
class Voice:
    engine: str
    id: str
    name: str
    speaker: int | None = None


def voices() -> list[Voice]:
    from quill.platform.windows.sapi5 import list_voices

    return [Voice("Windows SAPI", voice.id, voice.name) for voice in list_voices()]


def phonon_voices() -> list[Voice]:
    from quill.core.speech.phonon_tts import list_phonon_voices, phonon_status

    status = phonon_status(PHONON)
    if status != "ready":
        raise RuntimeError(f"Phonon is unavailable: {status}. Check its model, engine, and CPU support.")
    return [Voice("Phonon", voice.id, voice.name) for voice in list_phonon_voices(PHONON)]


def kokoro_voices() -> list[Voice]:
    import numpy as np
    from quill.core.read_aloud import kokoro_engine_ready, list_kokoro_voices

    if not kokoro_engine_ready(KOKORO):
        return []
    voices = [Voice("Kokoro", voice.id, f"{voice.name} ({voice.accent})") for voice in list_kokoro_voices()]
    with np.load(KOKORO / "voices-v1.0.bin") as pack:
        known = {voice.id for voice in voices}
        voices.extend(
            Voice("Kokoro", voice_id, f"{voice_id} (English phonemes only)")
            for voice_id in sorted(set(pack.files) - known)
        )
    return voices


def piper_voices() -> list[Voice]:
    from quill.core.voice_catalog import PIPER_VOICES

    if not PIPER_ENGINE.is_file():
        return []
    voices = []
    for voice_id, name in PIPER_VOICES:
        model = PIPER / f"{voice_id}.onnx"
        config = PIPER / f"{voice_id}.onnx.json"
        if not model.is_file() or not config.is_file():
            continue
        speakers = json.loads(config.read_text(encoding="utf-8")).get("speaker_id_map", {})
        if len(speakers) <= 1:
            speaker = int(next(iter(speakers.values()))) if speakers else None
            voices.append(Voice("Piper", voice_id, name, speaker))
            continue
        voices.extend(Voice("Piper", voice_id, f"{name}: {label}", int(speaker)) for label, speaker in speakers.items())
    return voices


class Player:
    """A single speech worker; cancellation also discards unfinished synthesis."""

    def __init__(self, notify: Callable[[int, str, float, str], None]) -> None:
        self.notify = notify
        self.requests: queue.Queue[tuple[int, Voice, str, threading.Event] | None] = queue.Queue()
        self.current: threading.Event | None = None
        self.serial = 0
        self.thread = threading.Thread(target=self._run, daemon=True, name="voice-lab-player")
        self.thread.start()

    def play(self, voice: Voice, text: str) -> int:
        self.stop()
        self.serial += 1
        self.current = threading.Event()
        self.requests.put((self.serial, voice, text, self.current))
        return self.serial

    def stop(self) -> None:
        if self.current:
            self.current.set()

    def close(self) -> None:
        self.stop()
        self.requests.put(None)

    def _run(self) -> None:
        import pythoncom

        pythoncom.CoInitialize()
        try:
            while True:
                request = self.requests.get()
                if request is None:
                    return
                serial, voice, text, cancelled = request
                if cancelled.is_set():
                    continue
                start = time.monotonic()
                try:
                    if voice.engine == "Windows SAPI":
                        self._sapi(serial, voice, text, cancelled, start)
                    elif voice.engine in ("Phonon", "Kokoro", "Piper"):
                        self._neural(serial, voice, text, cancelled, start)
                    else:
                        raise ValueError(f"Unknown voice engine: {voice.engine}")
                    self.notify(serial, "cancelled" if cancelled.is_set() else "done", time.monotonic() - start, "")
                except Exception as error:
                    self.notify(serial, "error", time.monotonic() - start, str(error))
        finally:
            pythoncom.CoUninitialize()

    def _sapi(self, serial: int, voice: Voice, text: str, cancelled: threading.Event, start: float) -> None:
        import win32com.client

        speaker = win32com.client.Dispatch("SAPI.SpVoice")
        tokens = speaker.GetVoices()
        selected = next((tokens.Item(i) for i in range(tokens.Count) if tokens.Item(i).Id == voice.id), None)
        if selected is None:
            raise RuntimeError("The selected Windows voice is no longer available.")
        speaker.Voice = selected
        if cancelled.is_set():
            return
        speaker.Speak(text, 1)
        self.notify(serial, "playing", time.monotonic() - start, "")
        while not speaker.WaitUntilDone(50):
            if cancelled.is_set():
                speaker.Speak("", 3)
                return

    def _neural(self, serial: int, voice: Voice, text: str, cancelled: threading.Event, start: float) -> None:
        import numpy as np
        import sounddevice as sd
        from quill.core.ai.tts_chunk import chunk_text
        from quill.core.read_aloud import _synthesize_with_kokoro_onnx
        from quill.core.speech.phonon_tts import synthesize_with_phonon

        with TemporaryDirectory(prefix="accesscode-voice-lab-") as directory:
            path = Path(directory) / "speech.wav"
            for index, text_chunk in enumerate(chunk_text(text, 150)):
                if cancelled.is_set():
                    return
                if voice.engine == "Kokoro":
                    _synthesize_with_kokoro_onnx(text_chunk, path, KOKORO, voice=voice.id, speed=1.0)
                elif voice.engine == "Piper":
                    command = [str(PIPER_ENGINE), "--model", str(PIPER / f"{voice.id}.onnx"), "--output_file", str(path)]
                    if voice.speaker is not None:
                        command.extend(["--speaker", str(voice.speaker)])
                    with subprocess.Popen(
                        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    ) as process:
                        self.notify(serial, "synthesizing", time.monotonic() - start, "")
                        deadline = time.monotonic() + 120
                        try:
                            stdout, stderr = process.communicate(text_chunk.encode("utf-8"), timeout=0.05)
                        except subprocess.TimeoutExpired:
                            while True:
                                if cancelled.is_set():
                                    process.terminate()
                                    process.communicate()
                                    return
                                if time.monotonic() >= deadline:
                                    process.terminate()
                                    process.communicate()
                                    raise RuntimeError("Piper synthesis timed out after 120 seconds.")
                                try:
                                    stdout, stderr = process.communicate(timeout=0.05)
                                    break
                                except subprocess.TimeoutExpired:
                                    continue
                        if process.returncode:
                            detail = (stderr or stdout).decode(errors="replace").strip()
                            raise RuntimeError(f"Piper failed ({process.returncode}): {detail}")
                else:
                    synthesize_with_phonon(text_chunk, path, voice=voice.id, model_dir=PHONON)
                if cancelled.is_set():
                    return
                with wave.open(str(path), "rb") as audio:
                    if audio.getsampwidth() != 2 or audio.getnchannels() != 1:
                        raise RuntimeError(f"{voice.engine} produced an unsupported audio format.")
                    with sd.OutputStream(samplerate=audio.getframerate(), channels=1, dtype="int16") as output:
                        if index == 0:
                            self.notify(serial, "playing", time.monotonic() - start, "")
                        while not cancelled.is_set():
                            chunk = audio.readframes(1024)
                            if not chunk:
                                break
                            output.write(np.frombuffer(chunk, dtype="<i2").reshape(-1, 1))
                        if cancelled.is_set():
                            output.abort()
                            return
