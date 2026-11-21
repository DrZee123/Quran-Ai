#!/usr/bin/env bash
# Benchmarks Quran speech models with whisper.cpp on real recitations:
# speed (seconds per ayah) and word accuracy for several audio_ctx sizes.
set -euo pipefail
ROOT="$(pwd)"
WORK="${WORK:-$ROOT/.bench-work}"
mkdir -p "$WORK/audio"
cd "$WORK"

python3 -m pip install --quiet --extra-index-url https://download.pytorch.org/whl/cpu torch transformers huggingface_hub numpy safetensors

[ -d whisper ] || git clone --depth 1 https://github.com/openai/whisper.git whisper
[ -d whisper.cpp ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp
cmake -S whisper.cpp -B whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
cmake --build whisper.cpp/build --target whisper-cli whisper-quantize -j"$(nproc)" >/dev/null
CLI="$(find whisper.cpp/build -type f -name whisper-cli -perm -u+x | head -1)"
QUANT="$(find whisper.cpp/build -type f -name whisper-quantize -perm -u+x | head -1)"

convert () { # $1 = HF id, $2 = out name
  python3 - "$1" <<'PY'
import os, shutil, sys
from huggingface_hub import snapshot_download
m = snapshot_download(sys.argv[1], local_dir="hf-" + sys.argv[1].replace("/", "_"))
b = snapshot_download("openai/whisper-base", local_dir="hf-base", allow_patterns=["*.json", "*.txt"])
for n in ["vocab.json", "added_tokens.json", "merges.txt", "normalizer.json"]:
    if not os.path.exists(os.path.join(m, n)):
        shutil.copy(os.path.join(b, n), os.path.join(m, n))
PY
  python3 whisper.cpp/models/convert-h5-to-ggml.py "hf-${1//\//_}" whisper . >/dev/null
  "$QUANT" ggml-model.bin "$2" q8_0 >/dev/null
  rm -f ggml-model.bin
}

MODELS=()
for id in tarteel-ai/whisper-base-ar-quran tarteel-ai/whisper-tiny-ar-quran; do
  out="ggml-${id##*/}-q8_0.bin"
  if [ -f "$out" ] || convert "$id" "$out"; then MODELS+=("$out"); ls -lh "$out"; else echo "skip $id"; fi
done

# Recitations (everyayah.com): Alafasy + Husary, a few ayahs of different lengths.
AYAHS="001001 001002 001005 001007 002002 002005 112001 112002 112004 036001 036002 067001 067002"
for r in Alafasy_128kbps Husary_128kbps; do
  for a in $AYAHS; do
    f="audio/${r}_${a}.wav"
    [ -f "$f" ] && continue
    curl -sfL "https://everyayah.com/data/$r/$a.mp3" -o /tmp/a.mp3 && ffmpeg -loglevel error -y -i /tmp/a.mp3 -ar 16000 -ac 1 -c:a pcm_s16le "$f" || echo "no audio $r $a"
  done
done

python3 "$ROOT/scripts/bench_eval.py" "$CLI" "$ROOT/src/data/quran.json" audio "${MODELS[@]}"
