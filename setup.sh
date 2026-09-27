#!/usr/bin/env bash
# CTS Hackathon — one-shot environment setup.
# Replaces the manual "create venv / install / diagnose / patch pydantic"
# notebook cells. Run this once per machine (or once per Colab session).
#
# Usage:
#   bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"

PYVER=3.11
VENV_DIR=".venv311"

echo "== CTS Hackathon setup =="

# 1. Make sure Python 3.11 exists.
# Repo is pinned to 3.11 (see .python-version) because numpy==1.26.4 and
# pyarrow==18.1.0 in requirements.txt do not ship wheels for Python 3.12+/3.13.
# On a newer default interpreter, pip falls back to a source build of numpy,
# which is slow and frequently fails outright — that's the actual root cause
# of the Colab "recreate the venv" loop, not pydantic.
if ! command -v python${PYVER} >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo "python${PYVER} not found — installing via apt (Debian/Ubuntu/Colab)."
        sudo apt-get update -qq
        sudo apt-get install -y python${PYVER} python${PYVER}-venv python${PYVER}-dev
    else
        echo "python${PYVER} not found and this isn't a Debian/Ubuntu box."
        echo "Install Python 3.11 yourself (pyenv, brew, or the python.org installer)"
        echo "then re-run this script. Or use the Dockerfile instead — see README."
        exit 1
    fi
fi

# 2. Fresh venv every run — cheap, and avoids stale-package drift between teammates.
rm -rf "${VENV_DIR}"
python${PYVER} -m venv "${VENV_DIR}"
PY="${VENV_DIR}/bin/python"

"${PY}" -m pip install --upgrade pip setuptools wheel -q

# 3. Single source of truth. Do NOT install backend/*/requirements.txt
# separately — those are legacy duplicates of this file and are the reason
# the pydantic pin drifted out of sync last time (three files, one got missed).
"${PY}" -m pip install -r requirements.txt

echo
echo "== Verifying critical imports =="
"${PY}" - <<'PYEOF'
import sys
import pydantic, fastapi, lancedb, sentence_transformers, fitz, spacy
import presidio_analyzer, presidio_anonymizer

print("Python:", sys.version.split()[0])
print("Pydantic:", pydantic.__version__)
print("FastAPI:", fastapi.__version__)
print("LanceDB:", lancedb.__version__)
print("Sentence Transformers:", sentence_transformers.__version__)
print("PyMuPDF:", fitz.__doc__ and getattr(fitz, "version", "OK"))
print("spaCy:", spacy.__version__)
print("Presidio Analyzer/Anonymizer: OK")
PYEOF

echo
echo "✅ Environment ready."
echo "Activate with: source ${VENV_DIR}/bin/activate"
