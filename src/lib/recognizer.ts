import { PermissionsAndroid, Platform } from 'react-native';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { RealtimeTranscriber } from 'whisper.rn/realtime-transcription/index';
import { AudioPcmStreamAdapter } from 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter';
import { getActiveModel, modelFile, type SpeechModel } from './models';

export interface RecognizerCallbacks {
  /** Latest text for an audio slice. The same slice is reported many times while it grows. */
  onText: (sliceIndex: number, text: string) => void;
  onError: (message: string) => void;
  onActiveChange: (active: boolean) => void;
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

/** On-device, offline, streaming speech recognition (whisper.cpp). */
export class Recognizer {
  private transcriber: RealtimeTranscriber | null = null;

  constructor(private callbacks: RecognizerCallbacks) {}

  async start(): Promise<void> {
    const model = await getActiveModel();
    if (!model) throw new Error('NO_MODEL');
    if (!(await requestMicPermission())) throw new Error('NO_MIC');
    const whisperContext = await loadContext(model);

    this.transcriber = new RealtimeTranscriber(
      { whisperContext, audioStream: new AudioPcmStreamAdapter() },
      {
        audioSliceSec: 12,
        audioMinSec: 1,
        maxSlicesInMemory: 2,
        // Don't feed previous text as a prompt: it makes the model "hear" the expected words and hide mistakes.
        promptPreviousSlices: false,
        realtimeProcessingPauseMs: 250,
        transcribeOptions: { language: 'ar', maxThreads: 4, beamSize: 1 },
        audioStreamConfig: { sampleRate: 16000, channels: 1, bitsPerSample: 16 },
      },
      {
        onTranscribe: (event) => {
          if (event.type === 'transcribe' && event.data?.result != null) {
            this.callbacks.onText(event.sliceIndex, event.data.result);
          }
        },
        onError: (err) => this.callbacks.onError(err),
        onStatusChange: (active) => this.callbacks.onActiveChange(active),
      },
    );
    await this.transcriber.start();
  }

  async stop(): Promise<void> {
    const t = this.transcriber;
    this.transcriber = null;
    if (t) {
      await t.stop();
      await t.release();
    }
  }
}
