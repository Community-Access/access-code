"""Exercise each discovered lab voice with one fixed, synthetic sample."""

import argparse
import json
import subprocess
import sys
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from lab_paths import KOKORO, PHONON, PIPER, PIPER_ENGINE
from voice_backend import kokoro_voices, phonon_voices, piper_voices, voices

SAMPLE = "Please check the project settings."


def main() -> None:
    parser = argparse.ArgumentParser(description="Test each available voice with the same sample")
    parser.add_argument("--quill-root", type=Path, default=Path(r"D:\quill"))
    parser.add_argument("--group", required=True, choices=["sapi", "phonon", "kokoro", "piper"])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if not (args.quill_root / "quill" / "__init__.py").is_file():
        parser.error(f"Quill checkout not found: {args.quill_root}")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    sys.path.insert(0, str(args.quill_root))
    choices = {"sapi": voices, "phonon": phonon_voices, "kokoro": kokoro_voices, "piper": piper_voices}
    available = choices[args.group]()
    if not available:
        raise RuntimeError(f"No {args.group} voices were discovered.")
    if args.limit:
        available = available[:args.limit]
    if args.output.exists():
        raise FileExistsError(f"Refusing to overwrite results: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def run(group):
        started = time.monotonic()
        results = [
            {"engine": voice.engine, "id": voice.id, "name": voice.name, "speaker": voice.speaker}
            for voice in group
        ]
        try:
            with TemporaryDirectory(prefix="accesscode-voice-check-") as directory:
                paths = [Path(directory) / f"{index}.wav" for index in range(len(group))]
                if args.group == "piper":
                    command = [str(PIPER_ENGINE), "--model", str(PIPER / f"{group[0].id}.onnx"), "--json-input", "--quiet"]
                    lines = []
                    for voice, path in zip(group, paths):
                        request = {"text": SAMPLE, "output_file": str(path)}
                        if voice.speaker is not None:
                            request["speaker_id"] = voice.speaker
                        lines.append(json.dumps(request))
                    process = subprocess.run(
                        command, input=("\n".join(lines) + "\n").encode("utf-8"), capture_output=True,
                        timeout=max(120, len(group) * 10),
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    )
                    if process.returncode:
                        detail = (process.stderr or process.stdout).decode(errors="replace").strip()
                        raise RuntimeError(f"Piper exited with code {process.returncode}: {detail}")
                elif args.group == "phonon":
                    from quill.core.speech.phonon_tts import synthesize_with_phonon

                    synthesize_with_phonon(SAMPLE, paths[0], voice=group[0].id, model_dir=PHONON)
                elif args.group == "kokoro":
                    from quill.core.read_aloud import _synthesize_with_kokoro_onnx

                    _synthesize_with_kokoro_onnx(SAMPLE, paths[0], KOKORO, voice=group[0].id, speed=1.0)
                else:
                    import pythoncom
                    import win32com.client

                    pythoncom.CoInitialize()
                    try:
                        speaker = win32com.client.Dispatch("SAPI.SpVoice")
                        tokens = speaker.GetVoices()
                        speaker.Voice = next(tokens.Item(i) for i in range(tokens.Count) if tokens.Item(i).Id == group[0].id)
                        stream = win32com.client.Dispatch("SAPI.SpFileStream")
                        stream.Open(str(paths[0]), 3, False)
                        try:
                            speaker.AudioOutputStream = stream
                            speaker.Speak(SAMPLE)
                        finally:
                            stream.Close()
                    finally:
                        pythoncom.CoUninitialize()
                for result, path in zip(results, paths):
                    try:
                        with wave.open(str(path), "rb") as audio:
                            width = audio.getsampwidth()
                            data = audio.readframes(audio.getnframes())
                            if not data or not any(byte != (128 if width == 1 else 0) for byte in data):
                                raise RuntimeError("The voice produced empty or silent audio.")
                            result.update(status="pass", seconds=round(audio.getnframes() / audio.getframerate(), 2))
                    except (OSError, EOFError, wave.Error, RuntimeError) as error:
                        result.update(status="fail", error=str(error))
        except Exception as error:
            for result in results:
                result.update(status="fail", error=str(error))
        for result in results:
            result["group_elapsed_seconds"] = round(time.monotonic() - started, 2)
        return results

    failures = 0
    groups = {}
    for voice in available:
        groups.setdefault(voice.id if args.group == "piper" else (voice.id, voice.speaker), []).append(voice)
    with args.output.open("x", encoding="utf-8") as file:
        with ThreadPoolExecutor(max_workers=2 if args.group == "piper" else 1) as pool:
            index = 0
            for results in pool.map(run, groups.values()):
                for result in results:
                    file.write(json.dumps(result, ensure_ascii=False) + "\n")
                    index += 1
                    failures += result["status"] != "pass"
                file.flush()
                print(f"{args.group}: {index}/{len(available)}, failures: {failures}", flush=True)
    if failures:
        raise SystemExit(f"{args.group}: {failures} voices failed; see {args.output}")
    print(f"{args.group}: all {len(available)} voices produced audio.", flush=True)


if __name__ == "__main__":
    main()
