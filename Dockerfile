# CTS Hackathon — backend dev container.
# Pinned to 3.11 for the same reason as .python-version: numpy==1.26.4 and
# pyarrow==18.1.0 have no wheels for 3.12+/3.13, so anything newer forces a
# source build that's slow at best and fails at worst.
FROM python:3.11-slim

WORKDIR /app

# tesseract-ocr: required by pytesseract at runtime, not just import time.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends tesseract-ocr build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip -q \
    && pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
