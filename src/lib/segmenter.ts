/**
 * Pure audio bookkeeping for live recitation (no native code, unit-tested).
 *
 * Audio arrives as 16 kHz mono int16 chunks. We keep the audio of the current
 * "segment" (since the last committed point). A segment is closed when the
 * reciter pauses (energy drops for a while) or when it grows too long; then
 * we cut at the quietest moment so a word is not split in half.
 */

export const SAMPLE_RATE = 16000;
const FRAME = 320; // 20 ms

export interface SegmenterOptions {
  /** Silence after speech that closes a segment (ms). Reciters pause at ayah ends. */
  pauseMs: number;
  /** Segment length that forces a cut (s). Short segments keep the model fast. */
  maxSec: number;
  /** Keep this much audio before speech starts (ms). */
  preRollMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = { pauseMs: 450, maxSec: 7, preRollMs: 250 };

export type SegmentEvent =
  | { type: 'none' }
  /** Close the segment: `audio` is final; `rest` starts the next segment. */
  | { type: 'close'; audio: Int16Array; rest: Int16Array };

function rms(buf: Int16Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

export class Segmenter {
  private buf = new Int16Array(SAMPLE_RATE * 12);
  private len = 0;
  private noise = 300; // adaptive noise floor (int16 RMS)
  private voiced = false; // speech seen in this segment
  private silentFrames = 0;
  private frameEnergy: number[] = [];

  constructor(private opts: SegmenterOptions = DEFAULT_SEGMENTER) {}

  get seconds(): number {
    return this.len / SAMPLE_RATE;
  }

  get hasSpeech(): boolean {
    return this.voiced;
  }

  /** Current segment audio (copy). */
  audio(): Int16Array {
    return this.buf.slice(0, this.len);
  }

  private append(chunk: Int16Array) {
    if (this.len + chunk.length > this.buf.length) {
      const bigger = new Int16Array(Math.max(this.buf.length * 2, this.len + chunk.length));
      bigger.set(this.buf.subarray(0, this.len));
      this.buf = bigger;
    }
    this.buf.set(chunk, this.len);
    this.len += chunk.length;
  }

  private reset(rest: Int16Array) {
    this.len = 0;
    this.frameEnergy = [];
    this.voiced = false;
    this.silentFrames = 0;
    this.push(rest, true);
  }

  /** Feed microphone samples. Returns 'close' when the segment should be finalised. */
  push(chunk: Int16Array, replay = false): SegmentEvent {
    const start = this.len;
    this.append(chunk);
    let event: SegmentEvent = { type: 'none' };
    // Analyse complete 20 ms frames that were added.
    for (let f = Math.floor(start / FRAME); (f + 1) * FRAME <= this.len; f++) {
      if (f < this.frameEnergy.length) continue;
      const e = rms(this.buf, f * FRAME, (f + 1) * FRAME);
      this.frameEnergy.push(e);
      const speech = e > Math.max(this.noise * 2.5, 500);
      if (!speech) this.noise = this.noise * 0.98 + e * 0.02;
      if (speech) {
        this.voiced = true;
        this.silentFrames = 0;
      } else {
        this.silentFrames++;
      }
    }
    if (replay) return event;

    if (!this.voiced) {
      // Only silence so far: keep just a little pre-roll so the model never sees long silence.
      const keep = Math.round((this.opts.preRollMs / 1000) * SAMPLE_RATE);
      if (this.len > keep * 4) {
        const tail = this.buf.slice(this.len - keep, this.len);
        this.reset(tail);
      }
      return event;
    }

    if (this.silentFrames * 20 >= this.opts.pauseMs) {
      event = { type: 'close', audio: this.buf.slice(0, this.len), rest: new Int16Array(0) };
      this.reset(new Int16Array(0));
      return event;
    }

    if (this.seconds >= this.opts.maxSec) {
      // Cut at the quietest 100 ms in the last 1.5 s.
      const frames = this.frameEnergy.length;
      const from = Math.max(0, frames - 75);
      let best = frames - 1;
      let bestE = Infinity;
      for (let f = from; f < frames - 5; f++) {
        let e = 0;
        for (let k = 0; k < 5; k++) e += this.frameEnergy[f + k];
        if (e < bestE) {
          bestE = e;
          best = f + 2;
        }
      }
      const cut = best * FRAME;
      event = { type: 'close', audio: this.buf.slice(0, cut), rest: this.buf.slice(cut, this.len) };
      this.reset(event.rest);
      this.voiced = true; // we are mid-recitation
    }
    return event;
  }
}
