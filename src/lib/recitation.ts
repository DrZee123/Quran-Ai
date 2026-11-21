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
  /** Last heard word of the previous segment when it did not match (often half a word). */
  private carry = '';

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

  /**
   * Heard words of a slice. A word left unmatched at the end of the previous
   * segment is usually cut in half by the segment boundary: join it with the
   * first word of this slice when that makes the expected word.
   */
  private heardWords(text: string, final: boolean): string[] {
    const words = this.prepare(text, final);
    if (!this.carry || words.length === 0) return words;
    const next = this.expected[this.cursor];
    const joined = this.carry + words[0];
    if (next && wordsMatch(joined, next) && !wordsMatch(words[0], next)) return [joined, ...words.slice(1)];
    return [this.carry, ...words];
  }

  private evaluate(text: string, final: boolean) {
    const heard = this.heardWords(text, final);
    const window = this.window(this.cursor, heard.length);
    const res = align(heard, window);
    const states = new Map<number, WordState>();
    res.words.forEach((w, k) => states.set(this.cursor + k, { status: w.status, heard: w.heard }));
    return { states, cursor: this.cursor + res.consumed, heard, window, res };
  }

  /**
   * Make a slice final. Only words up to the last correctly heard word are
   * decided: a mistake must be followed by a correct word before it turns red.
   * Unmatched words at the end of a slice are usually a word cut by the
   * segment boundary or noise, and the next slice decides them.
   */
  private commit(text: string): void {
    const { heard, window, res } = this.evaluate(text, true);
    if (heard.length === 0) return;
    let last = -1;
    res.words.forEach((w, k) => {
      if (w.status === 'correct') last = k;
    });
    for (let k = 0; k <= last; k++) this.committed[this.cursor + k] = res.words[k];
    const tail = heard[heard.length - 1];
    const tailMatched = last >= 0 && tail !== undefined && wordsMatch(tail, window[last]);
    this.carry = tail !== undefined && !tailMatched ? tail : '';
    this.cursor += last + 1;
  }

  /** Close the current slice now (the reciter paused): its words become final. */
  endSlice(): void {
    this.finish();
  }

  /**
   * While a slice is still being heard, only words that clearly match are shown.
   * Mistakes are decided when the slice is final, so a half-heard word never flashes red.
   */
  private liveFrontier(): number {
    if (!this.live) return this.cursor;
    let frontier = this.cursor;
    this.live.states.forEach((s, idx) => {
      if (s.status === 'correct' && idx + 1 > frontier) frontier = idx + 1;
    });
    return frontier;
  }

  /** Index of the next word the reciter is expected to say. */
  get position(): number {
    return this.liveFrontier();
  }

  /** Recently recited words (plain text), used as context for the speech model. */
  recentText(count = 12): string {
    return this.expected.slice(Math.max(this.startIndex, this.cursor - count), this.cursor).join(' ');
  }

  /** Current state of every expected word (committed + live slice overlay). */
  states(): WordState[] {
    const out = this.committed.slice();
    if (!this.live) return out;
    const frontier = this.liveFrontier();
    this.live.states.forEach((s, idx) => {
      if (idx < frontier) out[idx] = s.status === 'correct' ? s : { status: 'pending' };
    });
    return out;
  }

  get mistakes(): number {
    return this.states().filter((s) => s.status === 'wrong' || s.status === 'skipped').length;
  }

  get done(): boolean {
    return this.position >= this.expected.length;
  }
}
