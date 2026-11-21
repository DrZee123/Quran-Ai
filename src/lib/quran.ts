import data from '../data/quran.json';
import { normalizeArabic } from './arabic';

export interface SurahMeta {
  id: number;
  name: string; // Arabic name
  tr: string; // transliteration
  meaning: string; // Urdu meaning
  type: 'meccan' | 'medinan';
  verseCount: number;
}

export interface QuranWord {
  /** Index in the flattened word list of the surah. */
  index: number;
  ayah: number; // 1-based
  text: string; // Uthmani text for display
  norm: string; // normalised text for matching
}

export interface Ayah {
  number: number;
  text: string;
  urdu: string;
  words: QuranWord[];
}

type RawSurah = {
  id: number;
  name: string;
  tr: string;
  meaning: string;
  type: 'meccan' | 'medinan';
  verses: [string, string][];
};

const raw = data as unknown as RawSurah[];

export const SURAHS: SurahMeta[] = raw.map((s) => ({
  id: s.id,
  name: s.name,
  tr: s.tr,
  meaning: s.meaning,
  type: s.type,
  verseCount: s.verses.length,
}));

const cache = new Map<number, { ayahs: Ayah[]; words: QuranWord[] }>();

/** Ayahs of a surah with word-level data (cached). */
export function getSurah(id: number): { meta: SurahMeta; ayahs: Ayah[]; words: QuranWord[] } {
  const meta = SURAHS[id - 1];
  if (!meta) throw new Error(`Unknown surah ${id}`);
  let entry = cache.get(id);
  if (!entry) {
    const words: QuranWord[] = [];
    const ayahs: Ayah[] = raw[id - 1].verses.map(([text, urdu], i) => {
      const ayahWords: QuranWord[] = [];
      for (const w of text.split(' ')) {
        const norm = normalizeArabic(w);
        if (!norm) continue;
        const word: QuranWord = { index: words.length, ayah: i + 1, text: w, norm };
        words.push(word);
        ayahWords.push(word);
      }
      return { number: i + 1, text, urdu, words: ayahWords };
    });
    entry = { ayahs, words };
    cache.set(id, entry);
  }
  return { meta, ...entry };
}

/** Convert 1-based number to Arabic-Indic digits for ayah markers. */
export function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
