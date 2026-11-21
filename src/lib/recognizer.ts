import { PermissionsAndroid, Platform } from 'react-native';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { AudioPcmStreamAdapter } from 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter';
import { getActiveModel, modelFile, type SpeechModel } from './models';
import { SAMPLE_RATE, Segmenter } from './segmenter';

export interface RecognizerCallbacks {
  /**
   * Text heard in audio segment `segment`. Called repeatedly while the segment grows
   * (`final` = false) and once more when the reciter pauses (`final` = true).
   */
  onText: (segment: number, text: string, final: boolean) => void;
  onError: (message: string) => void;
  onActiveChange: (active: boolean) => void;
  /** Debug: how long the last model run took (ms) and the audio length (s). */
  onTiming?: (ms: number, audioSec: number) => void;
}

let context: WhisperContext | null = null;
let contextModelId: string | null = null;

export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'Tilawat sunne ke liye microphone ki ijazat chahiye. Awaz phone se bahar nahi jati.',
    buttonPositive: 'Theek hai',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

async function loadContext(model: SpeechModel): Promise<WhisperContext> {
  if (context && contextModelId === model.id) return context;
  if (context) await context.release();
  context = await initWhisper({ filePath: modelFile(model).uri });
  contextModelId = model.id;
  return context;
}

/** Minimum new audio before re-running the model on a growing segment. */
const PARTIAL_STEP_SEC = 0.8;
const MIN_PARTIAL_SEC = 0.6;

/**
 * On-device, offline streaming recognition tuned for recitation:
 * - only the audio since the last pause is sent to the model (a few seconds, never 30 s);
 * - leading silence is dropped, so the model doesn't invent words on silence;
 * - one model run at a time; finished segments always go first.
 */
export class Recognizer {
  private stream: AudioPcmStreamAdapter | null = null;
  private seg = new Segmenter();
  private segIndex = 0;
  private finals: { index: number; audio: Int16Array }[] = [];
  private busy = false;
  private lastPartialLen = 0;
  private running = false;
  private ctx: WhisperContext | null = null;

  constructor(private cb: RecognizerCallbacks) {}

  async start(): Promise<void> {
    const model = await getActiveModel();
    if (!model) throw new Error('NO_MODEL');
    if (!(await requestMicPermission())) throw new Error('NO_MIC');
    this.ctx = await loadContext(model);
    this.seg = new Segmenter();
    this.segIndex = 0;
    this.finals = [];
    this.lastPartialLen = 0;

    const stream = new AudioPcmStreamAdapter();
    this.stream = stream;
    await stream.initialize({ sampleRate: SAMPLE_RATE, channels: 1, bitsPerSample: 16, bufferSize: 3200 });
    stream.onData(({ data }) => {
      const copy = data.slice();
      const pcm = new Int16Array(copy.buffer, 0, Math.floor(copy.byteLength / 2));
      const ev = this.seg.push(pcm);
      if (ev.type === 'close') {
        this.finals.push({ index: this.segIndex, audio: ev.audio });
        this.segIndex++;
        this.lastPartialLen = 0;
      }
      this.pump();
    });
    stream.onError((e) => this.cb.onError(e));
    stream.onStatusChange((r) => this.cb.onActiveChange(r));
    this.running = true;
    await stream.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    const stream = this.stream;
    this.stream = null;
    if (stream) {
      await stream.stop();
      await stream.release();
    }
    // Whatever is left is final.
    if (this.seg.hasSpeech && this.seg.seconds > 0.3) {
      this.finals.push({ index: this.segIndex, audio: this.seg.audio() });
      this.segIndex++;
    }
    while (this.busy) await new Promise((r) => setTimeout(r, 50));
    while (this.finals.length) await this.runFinal(this.finals.shift()!);
  }

  private pump() {
    if (this.busy || !this.ctx) return;
    const job = this.finals.shift();
    if (job) {
      this.busy = true;
      this.runFinal(job).finally(() => {
        this.busy = false;
        this.pump();
      });
      return;
    }
    if (!this.running || !this.seg.hasSpeech) return;
    const audio = this.seg.audio();
    if (audio.length < MIN_PARTIAL_SEC * SAMPLE_RATE) return;
    if (audio.length - this.lastPartialLen < PARTIAL_STEP_SEC * SAMPLE_RATE) return;
    this.lastPartialLen = audio.length;
    const index = this.segIndex;
    this.busy = true;
    this.transcribe(audio)
      .then((text) => {
        // Ignore if the segment was closed meanwhile (its final result will come).
        if (index === this.segIndex) this.cb.onText(index, text, false);
      })
      .catch((e) => this.cb.onError(String(e)))
      .finally(() => {
        this.busy = false;
        this.pump();
      });
  }

  private async runFinal(job: { index: number; audio: Int16Array }) {
    try {
      const text = await this.transcribe(job.audio);
      this.cb.onText(job.index, text, true);
    } catch (e) {
      this.cb.onError(String(e));
    }
  }

  private async transcribe(audio: Int16Array): Promise<string> {
    if (!this.ctx) return '';
    const t0 = Date.now();
    // No prompt: giving the model the previous words made it repeat them
    // instead of transcribing what was said (tested on real recitations).
    const options = {
      language: 'ar',
      maxThreads: 4,
      temperature: 0,
      temperatureInc: 0, // no slow re-decoding fallbacks
    };
    const { promise } = this.ctx.transcribeData(audio.buffer as ArrayBuffer, options);
    const res = await promise;
    this.cb.onTiming?.(Date.now() - t0, audio.length / SAMPLE_RATE);
    return res.result ?? '';
  }
}
