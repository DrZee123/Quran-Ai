#!/usr/bin/env bash
# Converts a Quran-tuned Whisper model (default: tarteel-ai/whisper-tiny-ar-quran, Apache-2.0)
# Note: whisper-base-ar-quran has a non-standard text context (1024) and produces no output
# in whisper.cpp, so the tiny model is used (benchmark: ~5% word error, fast on phones).
# to whisper.cpp GGML format and quantises it to q8_0 so it can run on phones.
#
# Requires: python3, git, cmake, a C++ compiler. Output: out/$OUT_NAME
set -euo pipefail

WORK="${WORK:-$(pwd)/.model-work}"
OUT="${OUT:-$(pwd)/out}"
HF_MODEL="${HF_MODEL:-tarteel-ai/whisper-tiny-ar-quran}"
OUT_NAME="${OUT_NAME:-ggml-quran-tiny-q8_0.bin}"
BASE_MODEL="openai/whisper-base"
mkdir -p "$WORK" "$OUT"
cd "$WORK"

python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet --extra-index-url https://download.pytorch.org/whl/cpu \
  torch transformers huggingface_hub numpy safetensors

python3 - "$HF_MODEL" "$BASE_MODEL" <<'PY'
import os, shutil, sys
from huggingface_hub import snapshot_download
model, base = sys.argv[1], sys.argv[2]
m = snapshot_download(model, local_dir="hf-model")
b = snapshot_download(base, local_dir="hf-base", allow_patterns=["*.json", "*.txt"])
# The converter needs tokenizer files; fall back to the base model's if the fine-tune lacks them.
for name in ["vocab.json", "added_tokens.json", "merges.txt", "normalizer.json"]:
    if not os.path.exists(os.path.join(m, name)) and os.path.exists(os.path.join(b, name)):
        shutil.copy(os.path.join(b, name), os.path.join(m, name))
        print("copied", name, "from", base)
PY

[ -d whisper ] || git clone --depth 1 https://github.com/openai/whisper.git whisper
[ -d whisper.cpp ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp

python3 whisper.cpp/models/convert-h5-to-ggml.py hf-model whisper .
cmake -S whisper.cpp -B whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
cmake --build whisper.cpp/build --target whisper-quantize -j"$(nproc)"
QUANT="$(find whisper.cpp/build -type f -name whisper-quantize -perm -u+x | head -1)"
"$QUANT" ggml-model.bin "$OUT/$OUT_NAME" q8_0
ls -lh "$OUT"
