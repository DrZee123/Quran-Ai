/**
 * End-to-end simulation of the app's live pipeline on a real recitation:
 * audio -> Segmenter (same code as the app) -> whisper.cpp -> RecitationTracker.
 * Prints every segment so we can see where correct words turn red.
 *
 * usage: node sim.js <whisper-cli> <model> <wav 16k mono s16> <startPage|surah:ayah> [prompt=0|1]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { getAllNormalized, getAllWords, getSurah } from '../src/lib/quran';
import { RecitationTracker } from '../src/lib/recitation';
import { DEFAULT_SEGMENTER, SAMPLE_RATE, Segmenter } from '../src/lib/segmenter';

const [cli, model, wavPath, start, promptArg] = process.argv.slice(2);
const usePrompt = promptArg === '1';

function readWav(p: string): Int16Array {
  const b = readFileSync(p);
  let off = 12;
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'data') return new Int16Array(b.buffer.slice(b.byteOffset + off + 8, b.byteOffset + off + 8 + size));
    off += 8 + size;
  }
  throw new Error('no data chunk');
}

function writeWav(p: string, pcm: Int16Array) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.byteLength, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(p, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]));
}

function transcribe(pcm: Int16Array, prompt: string): string {
  writeWav('/tmp/seg.wav', pcm);
  const args = ['-m', model, '-f', '/tmp/seg.wav', '-l', 'ar', '-nt', '-np', '-t', '4', '-tp', '0', '-nf'];
  if (prompt) args.push('--prompt', prompt);
  return execFileSync(cli, args, { encoding: 'utf8' }).replace(/\s+/g, ' ').trim();
}

const [s, a] = start.split(':').map(Number);
const startWord = getSurah(s).ayahs[a - 1].words[0];
const words = getAllWords();
const norm = getAllNormalized();
const gStart = words.findIndex((w) => w.surah === s && w.ayah === a);
void startWord;

const opts = {
  ...DEFAULT_SEGMENTER,
  ...(process.env.PAUSE_MS ? { pauseMs: Number(process.env.PAUSE_MS) } : {}),
  ...(process.env.MAX_SEC ? { maxSec: Number(process.env.MAX_SEC) } : {}),
  ...(process.env.MIN_SEC ? { minSec: Number(process.env.MIN_SEC) } : {}),
};
const seg = new Segmenter(opts);
const tracker = new RecitationTracker(getAllNormalized(), gStart);
const audio = readWav(wavPath);
let index = 0;
const segments: Int16Array[] = [];
for (let i = 0; i < audio.length; i += 1600) {
  const ev = seg.push(audio.subarray(i, Math.min(audio.length, i + 1600)));
  if (ev.type === 'close') segments.push(ev.audio);
}
if (seg.hasSpeech) segments.push(seg.audio());

for (const pcm of segments) {
  const t0 = Date.now();
  const text = transcribe(pcm, usePrompt ? tracker.recentText() : '');
  const ms = Date.now() - t0;
  const before = tracker.position;
  tracker.update(index, text);
  tracker.endSlice();
  const after = tracker.position;
  const st = tracker.states();
  const span = [];
  for (let k = before; k < after; k++) span.push(`${norm[k]}${st[k].status === 'correct' ? '' : st[k].status === 'wrong' ? `[X:${st[k].heard}]` : '[SKIP]'}`);
  console.log(`seg ${index} ${(pcm.length / SAMPLE_RATE).toFixed(1)}s ${ms}ms | heard: ${text} | -> ${span.join(' ')}`);
  index++;
}
const st = tracker.states().slice(gStart, tracker.position);
const red = st.filter((x) => x.status === 'wrong' || x.status === 'skipped').length;
console.log(`RESULT opts=${JSON.stringify(opts)} prompt=${usePrompt} segments=${segments.length} words=${st.length} red=${red} (${((100 * red) / Math.max(1, st.length)).toFixed(1)}%)`);
