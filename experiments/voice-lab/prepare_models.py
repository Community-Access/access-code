"""Prepare the lab's local models when explicitly run by the user."""

import argparse
import hashlib
import os
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from lab_paths import DICTATION, DOWNLOADS, KOKORO, PHONON, PIPER, PIPER_ENGINE


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare all Quill voice-lab models")
    parser.add_argument("--quill-root", type=Path, default=Path(r"D:\quill"))
    args = parser.parse_args()
    if not (args.quill_root / "quill" / "__init__.py").is_file():
        parser.error(f"Quill checkout not found: {args.quill_root}")
    sys.path.insert(0, str(args.quill_root))

    from quill.core.read_aloud import default_kokoro_model_dir, kokoro_onnx_ready
    from quill.core.release_assets import fetch_component
    from quill.core.speech.phonon_tts import default_phonon_model_dir
    from quill.core.speech.piper_install import download_piper_voice, install_piper
    from quill.core.voice_catalog import PIPER_VOICES
    from quill.core.windows_dictation import model_store
    from quill.core.windows_dictation.engines import model_dir, vad_model_path
    from quill.core.windows_dictation.model_catalog import CATALOGUE

    source_downloads = model_store.downloads_root()
    for engine, language in (("moonshine", "en"), ("whisper", "en"), ("whisper", "es")):
        source = model_dir(engine, language)
        if source is None:
            raise RuntimeError(f"The Quill checkout is missing the {engine} {language} built-in model.")
        shutil.copytree(source, DICTATION / source.name, dirs_exist_ok=True)
    vad = vad_model_path()
    if vad is None:
        raise RuntimeError("The Quill checkout is missing its Silero VAD model.")
    shutil.copy2(vad, DICTATION / vad.name)
    phonon = default_phonon_model_dir()
    if phonon is None:
        raise RuntimeError("The Quill checkout is missing the Phonon model.")
    shutil.copytree(phonon, PHONON, dirs_exist_ok=True)
    kokoro = default_kokoro_model_dir()
    if kokoro_onnx_ready(kokoro):
        shutil.copytree(kokoro, KOKORO, dirs_exist_ok=True)
    elif not kokoro_onnx_ready(KOKORO):
        print("Downloading Kokoro voices...", flush=True)
        fetch_component("kokoro", KOKORO)

    os.environ["QUILL_DICTATION_DOWNLOADS"] = str(DOWNLOADS)
    failures = []
    for model in CATALOGUE:
        if model_store.installed(model):
            print(f"Ready: {model.name}", flush=True)
            continue
        source = source_downloads / model.folder
        try:
            if all((source / item.name).is_file() and (source / item.name).stat().st_size == item.size for item in model.files):
                print(f"Copying: {model.name}", flush=True)
                shutil.copytree(source, DOWNLOADS / model.folder, dirs_exist_ok=True)
            else:
                print(f"Downloading: {model.name} ({model.download_bytes / 1_000_000:.0f} MB)", flush=True)
                for item in (item for item in model.files if item.role == "tokens"):
                    target = DOWNLOADS / model.folder / item.name
                    if target.is_file() and target.stat().st_size == item.size:
                        continue
                    for folder in ("whisper-tiny", "whisper-tiny-en"):
                        candidate = DICTATION / folder / "tokens.txt"
                        if not candidate.is_file() or candidate.stat().st_size != item.size:
                            continue
                        with candidate.open("rb") as file:
                            digest = hashlib.file_digest(file, "sha256").hexdigest()
                        if digest == item.sha256:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(candidate, target)
                            break
                model_store.download(model)
            if not model_store.installed(model):
                raise RuntimeError(f"Model preparation incomplete: {model.name}")
        except Exception as error:
            failures.append(model.name)
            print(f"Recognition model failed: {model.name}: {error}", file=sys.stderr, flush=True)

    if not PIPER_ENGINE.is_file():
        print("Downloading the verified Piper engine...", flush=True)
        install_piper(dest_dir=PIPER_ENGINE.parent)

    def voice(item: tuple[str, str]) -> str:
        voice_id = item[0]
        model = PIPER / f"{voice_id}.onnx"
        config = PIPER / f"{voice_id}.onnx.json"
        if not model.is_file() or not config.is_file():
            download_piper_voice(voice_id, PIPER)
        if not model.is_file() or model.stat().st_size == 0 or not config.is_file():
            raise RuntimeError(f"Piper voice incomplete: {voice_id}")
        return voice_id

    with ThreadPoolExecutor(max_workers=3) as pool:
        tasks = {pool.submit(voice, item): item[0] for item in PIPER_VOICES}
        for task in as_completed(tasks):
            try:
                print(f"Piper ready: {task.result()}", flush=True)
            except Exception as error:
                failures.append(tasks[task])
                print(f"Piper failed: {tasks[task]}: {error}", file=sys.stderr, flush=True)
    if failures:
        raise RuntimeError(f"Models not prepared: {', '.join(failures)}")
    print("All requested catalog models are prepared.", flush=True)


if __name__ == "__main__":
    main()
