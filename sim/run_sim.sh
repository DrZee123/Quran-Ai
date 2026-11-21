#!/usr/bin/env bash
# Runs the live pipeline simulation (sim/stream-sim.ts) on real recitations
# with several settings, so we can see which words turn red and why.
set -euo pipefail
ROOT="$(pwd)"
WORK="${WORK:-$ROOT/.sim-work}"
mkdir -p "$WORK/audio"
cd "$WORK"

[ -d whisper.cpp ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp
cmake -S whisper.cpp -B whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
cmake --build whisper.cpp/build --target whisper-cli -j"$(nproc)" >/dev/null
CLI="$(find whisper.cpp/build -type f -name whisper-cli -perm -u+x | head -1)"
MODEL=ggml-quran-tiny-q8_0.bin
[ -f "$MODEL" ] || curl -sfL "https://github.com/DrZee123/Quran-Ai/releases/download/model-v2/$MODEL" -o "$MODEL"

fetch () { # reciter ayah -> wav
  local f="audio/$1_$2.wav"
  [ -f "$f" ] || { curl -sfL "https://everyayah.com/data/$1/$2.mp3" -o /tmp/a.mp3 && ffmpeg -loglevel error -y -i /tmp/a.mp3 -ar 16000 -ac 1 -c:a pcm_s16le "$f"; }
  echo "$f"
}
concat () { # out reciter ayahs...
  local out="$1" r="$2"; shift 2
  : > list.txt
  for a in "$@"; do echo "file '$(fetch "$r" "$a")'" >> list.txt; done
  ffmpeg -loglevel error -y -f concat -safe 0 -i list.txt -ar 16000 -ac 1 -c:a pcm_s16le "$out"
}

concat alafasy.wav Alafasy_128kbps 002001 002002 002003 002004 002005 002006 002007
concat husary.wav Husary_128kbps 002001 002002 002003 002004 002005 002006 002007
concat minshawi.wav Minshawy_Murattal_128kbps 002001 002002 002003 002004 002005
# A real mistake: ayah 2:4 skipped -> its words must turn red.
concat skip.wav Husary_128kbps 002001 002002 002003 002005
# Phone-like: room noise + lower volume.
ffmpeg -loglevel error -y -i husary.wav -f lavfi -i "anoisesrc=color=pink:amplitude=0.03:seed=1" \
  -filter_complex "[0]volume=0.6[a];[a][1]amix=inputs=2:duration=first:normalize=0" -ar 16000 -ac 1 -c:a pcm_s16le noisy.wav

npx --yes esbuild@0.24.0 "$ROOT/sim/stream-sim.ts" --bundle --platform=node --outfile=sim.js --log-level=error

run () { # label env... -- wav prompt
  echo; echo "===== $* ====="
  env "$@"
}
for wav in alafasy husary minshawi noisy skip; do
  for cfg in "PAUSE_MS=450 P=1" "PAUSE_MS=450 P=0" "PAUSE_MS=450 MIN_SEC=2.5 P=0" "PAUSE_MS=700 MIN_SEC=2.5 P=0" "PAUSE_MS=700 MIN_SEC=2.5 P=1"; do
    echo; echo "===== $wav | $cfg ====="
    P=$(echo "$cfg" | sed 's/.*P=//')
    env $(echo "$cfg" | sed 's/ P=.//') node sim.js "$CLI" "$MODEL" "$wav.wav" 2:1 "$P" 2>/dev/null || echo "sim failed"
  done
done
