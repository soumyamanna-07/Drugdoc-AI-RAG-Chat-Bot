# Colab: apply, push, install, test

## Cell 1 — upload the calibration patch and push it

```python
%cd /content/CTS-hackathon

from google.colab import files
import os, zipfile, shutil, subprocess

uploaded = files.upload()
zips = [f for f in uploaded if f.lower().endswith('.zip')]
if not zips:
    raise FileNotFoundError('Upload the CTS calibration ZIP.')
patch_zip = zips[0]

extract = '/tmp/cts_calibration_patch'
shutil.rmtree(extract, ignore_errors=True)
os.makedirs(extract, exist_ok=True)
with zipfile.ZipFile(patch_zip) as z:
    z.extractall(extract)

root = extract
if not os.path.exists(os.path.join(root, 'calib')):
    dirs = [os.path.join(extract, d) for d in os.listdir(extract)
            if os.path.isdir(os.path.join(extract, d))]
    root = next((d for d in dirs if os.path.exists(os.path.join(d, 'calib'))), None)
if not root:
    raise FileNotFoundError('Could not find calib/ in the patch.')

repo = '/content/CTS-hackathon'
shutil.copytree(os.path.join(root, 'calib'), os.path.join(repo, 'calib'), dirs_exist_ok=True)
for name in ['ARCHITECTURE.md', '.gitignore']:
    src = os.path.join(root, name)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(repo, name))

subprocess.run(['git', 'add', '-A'], cwd=repo, check=True)
subprocess.run(['git', 'diff', '--cached', '--name-status'], cwd=repo, check=True)

subprocess.run([
    'git', 'commit', '-m',
    'Add current LanceDB RAG calibration and mentor validation tooling'
], cwd=repo, check=False)
subprocess.run(['git', 'push'], cwd=repo, check=True)
print('Pushed calibration tooling.')
```

## Cell 2 — install the repository dependencies

```python
%cd /content/CTS-hackathon
!pip install -q -r requirements.txt
```

If the runtime already has compatible packages, pip may report them as satisfied.

## Cell 3 — make sure the current LanceDB corpus exists

The calibration uses the same `data/lancedb_data` corpus as the application. It does not create a separate index.

```python
%cd /content/CTS-hackathon

from backend.rag.vector_store import get_table

table = get_table()
if table is None or table.count_rows() == 0:
    raise RuntimeError(
        'No LanceDB corpus found. Ingest the same label corpus used by the demo first.'
    )
print('LanceDB rows:', table.count_rows())
```

## Cell 4 — generate questions

The exact mentor suite is `calib/mentor_100_questions.json`. `calib.make_questions` now imports all 100 cases into the generated calibration CSV.

```python
%cd /content/CTS-hackathon
!python -m calib.make_questions
```

## Cell 5 — retrieval/routing calibration

```python
%cd /content/CTS-hackathon
!python -m calib.calibrate
```

Review `calib/calibration_report.json` before changing any production threshold.

## Cell 6 — full pipeline / LLM validation

```python
%cd /content/CTS-hackathon
!python -m calib.calibrate --llm 150
```

This calls the actual `backend.rag.pipeline.answer()` path. It can take time and may consume the configured LLM/API quota.

## Cell 7 — inspect the report

```python
%cd /content/CTS-hackathon
import json
from pathlib import Path

report = json.loads(Path('calib/calibration_report.json').read_text())
print(json.dumps(report, indent=2))
```

Do not automatically apply the recommended values. Use the report to decide whether `TOP_K`, `MIN_RELEVANCE`, `MIN_RELEVANCE_NO_DRUG`, `MIN_SUPPORT`, `SECTION_BOOST`, or confidence cutoffs should change.

## Cell 8 — optionally commit the final report-derived production changes

Only after reviewing the results and manually changing production configuration:

```python
%cd /content/CTS-hackathon
!git status --short
!git add backend/rag/config.py backend/rag/retriever.py backend/rag/confidence.py ARCHITECTURE.md
!git commit -m "Calibrate RAG retrieval and confidence thresholds from evaluation"
!git push
```

The generated CSV/JSON calibration artifacts are intentionally ignored by Git unless you explicitly decide to version them.
