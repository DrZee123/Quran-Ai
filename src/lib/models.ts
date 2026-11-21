import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { GITHUB_REPO } from '../config';

export interface SpeechModel {
  id: string;
  title: string;
  description: string;
  url: string;
  fileName: string;
  approxMB: number;
}

export const MODELS: SpeechModel[] = [
  {
    id: 'quran-tiny',
    title: 'Quran model (tavsiya)',
    description:
      'Whisper tiny, Quran tilawat par train kiya hua (tarteel-ai/whisper-tiny-ar-quran, Apache-2.0). Tez aur durust: test mein 100 mein se ~95 lafz sahih.',
    url: `https://github.com/${GITHUB_REPO}/releases/download/model-v2/ggml-quran-tiny-q8_0.bin`,
    fileName: 'ggml-quran-tiny-q8_0.bin',
    approxMB: 42,
  },
  {
    id: 'general-base',
    title: 'General Arabic model',
    description: 'OpenAI Whisper base (MIT). Sirf backup: Quran tilawat par kaafi kam durust aur dheema.',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q8_0.bin',
    fileName: 'ggml-base-q8_0.bin',
    approxMB: 80,
  },
];

const SELECTED_KEY = 'selectedModel';

function modelsDir(): Directory {
  const dir = new Directory(Paths.document, 'models');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function modelFile(model: SpeechModel): File {
  return new File(modelsDir(), model.fileName);
}

export function isDownloaded(model: SpeechModel): boolean {
  const f = modelFile(model);
  return f.exists && (f.size ?? 0) > 1_000_000;
}

export async function getSelectedModelId(): Promise<string> {
  const id = await AsyncStorage.getItem(SELECTED_KEY);
  return id && MODELS.some((m) => m.id === id) ? id : MODELS[0].id;
}

export async function setSelectedModelId(id: string): Promise<void> {
  await AsyncStorage.setItem(SELECTED_KEY, id);
}

export async function getActiveModel(): Promise<SpeechModel | null> {
  const id = await getSelectedModelId();
  // An id from an older app version (e.g. 'quran-base') falls back to the recommended model.
  const preferred = MODELS.find((m) => m.id === id) ?? MODELS[0];
  if (preferred && isDownloaded(preferred)) return preferred;
  return MODELS.find(isDownloaded) ?? null;
}

/** Download a model, reporting progress 0..1. Writes to a temp file first so a failed download leaves nothing half-done. */
export async function downloadModel(
  model: SpeechModel,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const target = modelFile(model);
  const temp = new File(modelsDir(), `${model.fileName}.part`);
  if (temp.exists) temp.delete();
  try {
    await File.downloadFileAsync(model.url, temp, {
      idempotent: true,
      signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : model.approxMB * 1024 * 1024;
        onProgress(Math.min(1, bytesWritten / total));
      },
    });
    if (target.exists) target.delete();
    temp.move(target);
  } catch (e) {
    if (temp.exists) temp.delete();
    throw e;
  }
}

export function deleteModel(model: SpeechModel): void {
  const f = modelFile(model);
  if (f.exists) f.delete();
}

/** Remove files of models that are no longer offered (e.g. the old base Quran model that didn't work). */
export function cleanupOldModels(): void {
  const keep = new Set(MODELS.map((m) => m.fileName));
  for (const name of ['ggml-quran-base-q8_0.bin']) {
    if (keep.has(name)) continue;
    const f = new File(modelsDir(), name);
    if (f.exists) f.delete();
  }
}
