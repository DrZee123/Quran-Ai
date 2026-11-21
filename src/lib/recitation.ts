import { tokenize, wordsMatch } from './arabic';
import { align, WordStatus } from './matcher';

export interface WordState {
  status: WordStatus;
  heard?: string;
}

// Phrases a reciter says before starting (ta'awwudh, basmala) - not part of most surahs.
const OPENINGS = [tokenize('أعوذ بالله من الشيطان الرجيم'), tokenize('بسم الله الرحمن الرحيم')];

// Whisper sometimes "hears" these on silence/noise.
const HALLUCINATIONS = [tokenize('اشتركوا في القناة'), tokenize('ترجمة نانسي قنقر'), tokenize('شكرا للمشاهدة')];

function startsWithPhrase(words: string[], phrase: string[]): boolean {
  if (words.length < phrase.length) return false;
  let hits = 0;
  for (let k = 0; k < phrase.length; k++) if (wordsMatch(words[k], phrase[k])) hits++;
  return hits >= Math.ceil(phrase.length * 0.75);
}

function removePhrase(words: string[], phrase: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    if (startsWithPhrase(words.slice(i), phrase)) i += phrase.length;
    else out.push(words[i++]);
  }
  return out;
}

/** Remove ta'awwudh / basmala at the very start (unless the expected text itself starts with them). */
export function stripOpenings(heard: string[], expectedHead: string[]): string[] {
  let words = heard;
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of OPENINGS) {
      if (startsWithPhrase(words, phrase) && !startsWithPhrase(expectedHead, phrase)) {
        words = words.slice(phrase.length);
        changed = true;
      }
    }
  }
  return words;
}

export function cleanHypothesis(text: string): string[] {
  let words = tokenize(text);
  for (const h of HALLUCINATIONS) words = removePhrase(words, h);
  return words;
}

/**
 * Tracks a live recitation against the expected words of a surah.
 *
 * The speech engine delivers text per audio "slice". The text of the current
 * slice keeps changing while the user speaks; once a newer slice starts, the
 * older one is final and its result is committed.
 */
export class RecitationTracker {
  readonly expected: string[];
  readonly startIndex: number;
  private committed: WordState[];
  private cursor: number;
  private openingHandled = false;
  private sliceIndex = -1;
  private sliceText = '';
  private live: { states: Map<number, WordState>; cursor: number } | null = null;

  constructor(expected: string[], startIndex = 0) {
    this.expected = expected;
    this.startIndex = startIndex;
    this.cursor = startIndex;
    this.committed = expected.map(() => ({ status: 'pending' as WordStatus }));
  }

  /** Feed the latest text of slice `sliceIndex`. */
  update(sliceIndex: number, text: string): void {
    if (sliceIndex !== this.sliceIndex) {
      if (this.sliceIndex >= 0) this.commit(this.sliceText);
      this.sliceIndex = sliceIndex;
    }
    this.sliceText = text;
    this.live = this.evaluate(text, false);
  }

  /** Recording stopped: everything heard so far is final. */
  finish(): void {
    if (this.sliceIndex >= 0) this.commit(this.sliceText);
    this.sliceIndex = -1;
    this.sliceText = '';
    this.live = null;
  }

  private window(from: number, heardCount: number): string[] {
    return this.expected.slice(from, from + heardCount * 2 + 20);
  }

  private prepare(text: string, mutateOpening: boolean): string[] {
    let words = cleanHypothesis(text);
    if (!this.openingHandled) {
      words = stripOpenings(words, this.expected.slice(this.startIndex, this.startIndex + 8));
      if (mutateOpening && words.length > 0) this.openingHandled = true;
    }
    return words;
  }

  private evaluate(text: string, final: boolean) {
    const heard = this.prepare(text, final);
    const res = align(heard, this.window(this.cursor, heard.length));
    const states = new Map<number, WordState>();
    res.words.forEach((w, k) => states.set(this.cursor + k, { status: w.status, heard: w.heard }));
    return { states, cursor: this.cursor + res.consumed };
  }

  private commit(text: string): void {
    const { states, cursor } = this.evaluate(text, true);
    states.forEach((s, idx) => (this.committed[idx] = s));
    this.cursor = cursor;
  }

  /** Index of the next word the reciter is expected to say. */
  get position(): number {
    return this.live?.cursor ?? this.cursor;
  }

  /** Current state of every expected word (committed + live slice overlay). */
  states(): WordState[] {
    if (!this.live) return this.committed.slice();
    const out = this.committed.slice();
    this.live.states.forEach((s, idx) => (out[idx] = s));
    // The word being spoken right now may be half-heard: don't flag it yet.
    const last = this.live.cursor - 1;
    if (last >= 0 && out[last] && out[last].status === 'wrong') out[last] = { status: 'pending' };
    return out;
  }

  get mistakes(): number {
    return this.states().filter((s) => s.status === 'wrong' || s.status === 'skipped').length;
  }

  get done(): boolean {
    return this.position >= this.expected.length;
  }
}
