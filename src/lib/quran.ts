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

// ---------------------------------------------------------------------------
// Mushaf pages (Madani layout, 604 pages)

import pageStarts from '../data/pages.json';

export const PAGE_COUNT = 604;
const PAGE_STARTS = pageStarts as number[]; // global 1-based ayah id of each page's first ayah (+ sentinel)

export interface GlobalWord extends QuranWord {
  surah: number;
  /** Index in the flattened word list of the whole Quran. */
  gIndex: number;
}

let allWords: GlobalWord[] | null = null;
let ayahFirstWord: number[] | null = null; // global ayah id (1-based) -> first gIndex

/** Every word of the Quran in order (built once, ~78k words). */
export function getAllWords(): GlobalWord[] {
  if (!allWords) {
    allWords = [];
    ayahFirstWord = [0];
    for (const s of SURAHS) {
      for (const a of getSurah(s.id).ayahs) {
        ayahFirstWord.push(allWords.length);
        for (const w of a.words) allWords.push({ ...w, surah: s.id, gIndex: allWords.length });
      }
    }
    ayahFirstWord.push(allWords.length); // sentinel for ayah 6237
  }
  return allWords;
}

export interface PageSection {
  surah: SurahMeta;
  /** True when the surah starts on this page (show its title and basmala). */
  starts: boolean;
  ayahs: { number: number; words: GlobalWord[] }[];
}

export interface MushafPage {
  page: number;
  sections: PageSection[];
  /** Global word range [first, end). */
  first: number;
  end: number;
}

/** Page number (1..604) that contains a surah's ayah. */
export function pageOf(surah: number, ayah = 1): number {
  getAllWords();
  let id = ayah;
  for (let s = 1; s < surah; s++) id += SURAHS[s - 1].verseCount;
  let p = 1;
  while (p < PAGE_COUNT && PAGE_STARTS[p] <= id) p++;
  return p;
}

const pageCache = new Map<number, MushafPage>();

export function getPage(page: number): MushafPage {
  const cached = pageCache.get(page);
  if (cached) return cached;
  const words = getAllWords();
  const first = ayahFirstWord![PAGE_STARTS[page - 1]];
  const end = ayahFirstWord![PAGE_STARTS[page]];
  const sections: PageSection[] = [];
  for (let i = first; i < end; i++) {
    const w = words[i];
    let sec = sections[sections.length - 1];
    if (!sec || sec.surah.id !== w.surah) {
      sec = { surah: SURAHS[w.surah - 1], starts: w.ayah === 1 && w.index === 0, ayahs: [] };
      sections.push(sec);
    }
    let ay = sec.ayahs[sec.ayahs.length - 1];
    if (!ay || ay.number !== w.ayah) {
      ay = { number: w.ayah, words: [] };
      sec.ayahs.push(ay);
    }
    ay.words.push(w);
  }
  const result = { page, sections, first, end };
  pageCache.set(page, result);
  return result;
}

/** Normalised words of the whole Quran (for tracking a recitation across pages). */
let allNorm: string[] | null = null;
export function getAllNormalized(): string[] {
  if (!allNorm) allNorm = getAllWords().map((w) => w.norm);
  return allNorm;
}
