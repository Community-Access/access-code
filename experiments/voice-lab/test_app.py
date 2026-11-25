import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import wx

from app import Lab, Listener
from voice_backend import Voice


class LabTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.environ.get("QUILL_ROOT", r"D:\quill"))
        cls.app = wx.App(False)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous_localappdata = os.environ.get("LOCALAPPDATA")
        self.previous_downloads = os.environ.get("QUILL_DICTATION_DOWNLOADS")
        os.environ["LOCALAPPDATA"] = self.directory.name
        os.environ["QUILL_DICTATION_DOWNLOADS"] = str(Path(self.directory.name) / "models")
        self.frame = Lab(Path(sys.path[0]))
        self.frame.listening = True
        self.frame.token = 1

    def tearDown(self):
        self.frame.Close()
        if self.previous_localappdata is None:
            del os.environ["LOCALAPPDATA"]
        else:
            os.environ["LOCALAPPDATA"] = self.previous_localappdata
        if self.previous_downloads is None:
            del os.environ["QUILL_DICTATION_DOWNLOADS"]
        else:
            os.environ["QUILL_DICTATION_DOWNLOADS"] = self.previous_downloads
        self.directory.cleanup()

    def test_half_duplex_discards_phrase_detected_during_reply(self):
        self.frame.mode.SetSelection(1)
        self.frame.playing = 42
        self.frame.heard_start(1)
        self.frame.playing = None
        self.frame.heard_phrase(1, "private speech")
        self.assertEqual(self.frame.transcript.GetValue(), "")
        self.assertFalse(self.frame.phrase_ignored)
        events = [json.loads(line) for line in self.frame.log.path.read_text().splitlines()]
        self.assertTrue(events[-1]["ignored"])
        self.assertNotIn("private speech", json.dumps(events))

    def test_barge_in_stops_reply_on_speech(self):
        self.frame.mode.SetSelection(2)
        self.frame.playing = 42
        self.frame.heard_start(1)
        self.assertIsNone(self.frame.playing)
        self.assertFalse(self.frame.phrase_ignored)
        events = [json.loads(line) for line in self.frame.log.path.read_text().splitlines()]
        self.assertEqual(events[-1]["event"], "reply_interrupted")
        self.assertEqual(events[-1]["playback_id"], 42)

    def test_whisper_silence_does_not_trigger_reply(self):
        self.frame.engine.SetSelection(1)
        self.frame.heard_phrase(1, " [ Silence ] ")
        self.assertEqual(self.frame.transcript.GetValue(), "")
        self.assertEqual(self.frame.state.GetLabel(), "No words recognized.")
        self.assertIsNone(self.frame.playing)

    def test_cancelled_start_and_stale_callbacks_are_ignored(self):
        self.frame.listening = False
        self.frame.starting = True
        listener = Listener(self.frame, 1)
        self.frame.stop_listening()
        self.assertTrue(self.frame.cancel_start.is_set())
        listener.on_microphone_lost()
        self.assertEqual(self.frame.state.GetLabel(), "Listening stopped.")

        class Recognizer:
            stopped = threading.Event()

            def stop(self):
                self.stopped.set()

        recognizer = Recognizer()
        self.frame.started(1, recognizer)
        self.assertTrue(recognizer.stopped.wait(5))
        self.assertFalse(self.frame.listening)

    def test_all_catalog_models_are_selectable_without_auto_download(self):
        from quill.core.windows_dictation.model_catalog import CATALOGUE

        self.assertEqual({engine for engine, _ in self.frame.engines[2:]}, {model.id for model in CATALOGUE})
        self.frame.listening = False
        index = next(i for i, (engine, _) in enumerate(self.frame.engines) if engine == "whisper_large_v3")
        self.frame.engine.SetSelection(index)
        self.frame.start_listening()
        self.assertFalse(self.frame.starting)
        self.assertIn("not downloaded", self.frame.state.GetLabel())

    def test_unsupported_language_does_not_start_a_different_engine(self):
        self.frame.listening = False
        self.frame.language.SetSelection(1)
        self.frame.start_listening()
        self.assertFalse(self.frame.starting)
        self.assertIn("does not support", self.frame.state.GetLabel())

    def test_streaming_preview_does_not_leak_ignored_or_stale_speech(self):
        self.frame.mode.SetSelection(1)
        self.frame.playing = 42
        self.frame.heard_start(1)
        self.frame.heard_partial(1, "ignored words")
        self.frame.heard_partial(0, "stale words")
        self.assertEqual(self.frame.partial.GetValue(), "")
        self.frame.playing = None
        self.frame.heard_phrase(1, "ignored words")
        self.frame.heard_partial(1, "current words")
        self.assertEqual(self.frame.partial.GetValue(), "current words")
        self.assertNotIn("current words", self.frame.log.path.read_text())

    def test_explicit_download_can_be_cancelled(self):
        from quill.core.release_assets import DownloadCancelled

        self.frame.listening = False
        started = threading.Event()

        def download(progress, cancelled):
            started.set()
            self.assertTrue(self.frame.cancel_download.wait(5))
            if cancelled():
                raise DownloadCancelled("Cancelled")

        self.frame.run_download("Test model", download)
        self.assertTrue(started.wait(5))
        self.assertTrue(self.frame.downloading)
        self.frame.cancel_download.set()
        deadline = time.monotonic() + 5
        while self.frame.downloading and time.monotonic() < deadline:
            wx.YieldIfNeeded()
            time.sleep(0.01)
        self.assertFalse(self.frame.downloading)
        self.assertIn("cancelled", self.frame.state.GetLabel())
        events = [json.loads(line) for line in self.frame.log.path.read_text().splitlines()]
        self.assertIn("download_cancelled", [event["event"] for event in events])

    def test_piper_models_and_speakers_are_separately_selectable(self):
        self.frame.voice_choices = [
            Voice("Piper", "model-a", "Model A: Alice", 0),
            Voice("Piper", "model-a", "Model A: Bob", 1),
            Voice("Piper", "model-b", "Model B", None),
        ]
        self.frame.voice_engine.Set(["Piper"])
        self.frame.voice_engine.SetSelection(0)
        self.frame.voice_engine_changed()
        self.assertEqual(self.frame.voice.GetCount(), 2)
        self.assertEqual(self.frame.speaker.GetCount(), 2)
        self.frame.speaker.SetSelection(1)
        self.assertEqual(self.frame.selected_voice().speaker, 1)
        self.frame.voice.SetSelection(1)
        self.frame.voice_changed()
        self.assertEqual(self.frame.selected_voice().id, "model-b")


class PiperTests(unittest.TestCase):
    def test_available_multispeaker_model_exposes_each_speaker(self):
        sys.path.insert(0, os.environ.get("QUILL_ROOT", r"D:\quill"))
        from quill.core.voice_catalog import PIPER_VOICES
        from voice_backend import piper_voices

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "piper.exe"
            executable.touch()
            voice_id = PIPER_VOICES[0][0]
            (root / f"{voice_id}.onnx").touch()
            (root / f"{voice_id}.onnx.json").write_text(
                json.dumps({"speaker_id_map": {"A": 0, "B": 4}}), encoding="utf-8"
            )
            with patch("voice_backend.PIPER", root), patch("voice_backend.PIPER_ENGINE", executable):
                choices = piper_voices()
        self.assertEqual([(voice.id, voice.speaker) for voice in choices], [(voice_id, 0), (voice_id, 4)])


if __name__ == "__main__":
    unittest.main()
