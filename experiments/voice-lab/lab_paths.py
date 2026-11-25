from pathlib import Path

MODELS = Path(__file__).resolve().parent / "models"
DICTATION = MODELS / "dictation-models"
DOWNLOADS = MODELS / "recognition"
KOKORO = MODELS / "kokoro-models"
PHONON = MODELS / "phonon"
PIPER = MODELS / "piper-models"
PIPER_ENGINE = MODELS / "piper-engine" / "piper.exe"
