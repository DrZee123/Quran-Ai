"""Runs whisper-cli over recitation clips and reports speed and word accuracy."""
import json, os, re, subprocess, sys, time

cli, quran_path, audio_dir, *models = sys.argv[1:]
quran = json.load(open(quran_path, encoding="utf8"))

STRIP = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ ]")
MAP = str.maketrans({"ٱ": "ا", "أ": "ا", "إ": "ا", "آ": "ا",
                     "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})

def norm(t):
    t = STRIP.sub("", t).translate(MAP).replace("ء", "")
    t = re.sub("[^ء-ي ]", " ", t)
    return t.split()

def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / max(1, len(ref))

clips = sorted(f for f in os.listdir(audio_dir) if f.endswith(".wav"))
print(f"{len(clips)} clips")
for model in models:
    for ac in [0, 512, 256]:
        for prompt in [False]:
            tot_t, tot_w, n = 0.0, 0.0, 0
            for c in clips:
                code = c.rsplit("_", 1)[1][:-4]
                s, a = int(code[:3]), int(code[3:])
                ref = norm(quran[s - 1]["verses"][a - 1][0])
                cmd = [cli, "-m", model, "-f", os.path.join(audio_dir, c), "-l", "ar", "-nt", "-np", "-t", "4", "-tp", "0", "-nf"]
                if ac:
                    cmd += ["-ac", str(ac)]
                t0 = time.time()
                out = subprocess.run(cmd, capture_output=True, text=True).stdout
                dt = time.time() - t0
                hyp = norm(out)
                w = wer(ref, hyp)
                tot_t += dt; tot_w += w; n += 1
                if ac == 0:
                    print(f"  {os.path.basename(model)} {c}: {dt:.2f}s WER {w:.2f} | {' '.join(hyp)}")
            print(f"== {os.path.basename(model)} audio_ctx={ac or 1500}: avg {tot_t/n:.2f}s/clip, WER {tot_w/n:.3f}")
