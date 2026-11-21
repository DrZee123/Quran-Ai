/**
 * Arabic text normalisation for comparing recited words with Quran text.
 *
 * The Quran text we display is Uthmani script (full tashkeel + Quranic marks),
 * while the speech model outputs plain Arabic (no diacritics, "imla'i" spelling).
 * Both sides are reduced to the same bare form before comparing.
 */

// Tashkeel, Quranic annotation marks, superscript alef, tatweel, thin space.
const STRIP_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ ‌‍‏‎]/g;

const LETTER_MAP: Record<string, string> = {
  'ٱ': 'ا', // ٱ alef wasla -> ا
  'أ': 'ا', // أ
  'إ': 'ا', // إ
  'آ': 'ا', // آ
  'ٲ': 'ا',
  'ٳ': 'ا',
  'ى': 'ي', // ى -> ي
  'ی': 'ي', // Farsi/Urdu yeh -> ي
  'ة': 'ه', // ة -> ه
  'ؤ': 'و', // ؤ -> و
  'ئ': 'ي', // ئ -> ي
  'ک': 'ك', // Urdu kaf -> ك
};

/** Reduce a word (or text) to bare Arabic letters. */
export function normalizeArabic(text: string): string {
  let s = text.normalize('NFC').replace(STRIP_RE, '');
  s = s.replace(/[ٱأإآٲٳىیةؤئک]/g, (c) => LETTER_MAP[c] ?? c);
  s = s.replace(/ء/g, ''); // standalone hamza: spelled very inconsistently
  s = s.replace(/[^ء-ي\s]/g, ''); // drop punctuation, digits, latin
  return s.replace(/\s+/g, ' ').trim();
}

/** Same as normalizeArabic but also drops alef/waw/yeh "long vowel" spellings that differ between scripts. */
export function skeleton(word: string): string {
  const n = normalizeArabic(word);
  // Keep first letter so a word like "و" / "ا" still has content.
  return n.length <= 2 ? n : n[0] + n.slice(1).replace(/[اوي]/g, '');
}

/** Split text into normalised, non-empty words. */
export function tokenize(text: string): string[] {
  return normalizeArabic(text)
    .split(' ')
    .filter((w) => w.length > 0);
}

/** Classic Levenshtein distance on code units. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Similarity between 0 and 1. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Score how well a heard word matches an expected word (both already normalised).
 * 1 = same word, 0 = unrelated.
 */
function rawScore(heard: string, expected: string): number {
  if (heard === expected) return 1;
  const sk1 = skeleton(heard);
  const sk2 = skeleton(expected);
  if (sk1 === sk2) return 0.95;
  return Math.max(similarity(heard, expected), similarity(sk1, sk2) * 0.95);
}

export function wordScore(heard: string, expected: string): number {
  let score = rawScore(heard, expected);
  // Taa marbuta is pronounced "t" when joined to the next word: "صلاة" may be heard as "صلات".
  if (score < 1 && heard.endsWith('ت') && expected.endsWith('ه')) {
    heard = heard.slice(0, -1) + 'ه';
    score = Math.max(score, rawScore(heard, expected));
  }
  // In joined speech the article "ال" is silent ("يقيمون الصلاة" -> "...مونصّلاة"),
  // so the model often writes the word without it.
  if (score < 1 && expected.length > 4 && expected.startsWith('ال') && !heard.startsWith('ال')) {
    return Math.max(score, rawScore(heard, expected.slice(2)) * 0.95);
  }
  return score;
}

/** Threshold above which a heard word counts as correctly recited. */
export const MATCH_THRESHOLD = 0.8;

/** Long words get a little more tolerance: the speech model often drops one letter of them. */
export function thresholdFor(expected: string): number {
  return expected.length >= 6 ? 0.72 : MATCH_THRESHOLD;
}

export function isMatch(score: number, expected: string): boolean {
  return score >= thresholdFor(expected);
}

export function wordsMatch(heard: string, expected: string): boolean {
  return isMatch(wordScore(heard, expected), expected);
}
