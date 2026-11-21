import { isMatch, wordScore } from './arabic';

export type WordStatus = 'pending' | 'correct' | 'wrong' | 'skipped';

export interface AlignedWord {
  status: Exclude<WordStatus, 'pending'>;
  /** The word the reciter actually said (for wrong words). */
  heard?: string;
}

export interface AlignmentResult {
  /** Result for expected[0 .. consumed). */
  words: AlignedWord[];
  /** How many expected words were consumed by the hypothesis. */
  consumed: number;
  /** Heard words that did not belong anywhere (extra words / repeats). */
  extras: string[];
}

const SUB_COST = 1;
const INS_COST = 1; // extra heard word (repetition, hesitation)
// Skipped expected words: the first costs a full word, every further one in
// the same run is cheap. A reciter who skips a line skips several words in a
// row; three or more matching words after a gap mean "skipped", not "wrong".
const GAP_OPEN = 1;
const GAP_EXT = 0.15;

/**
 * Align heard words against the beginning of the expected word list.
 *
 * The whole hypothesis must be consumed; the expected list may end early (the
 * reciter has not reached the rest yet). Both lists are normalised words.
 */
export function align(heard: string[], expected: string[]): AlignmentResult {
  const m = heard.length;
  const n = expected.length;
  if (m === 0) return { words: [], consumed: 0, extras: [] };

  // H[i][j]: min cost aligning heard[0..i) with expected[0..j).
  // D[i][j]: same, but ending with a skipped expected word (gap run).
  const H: Float64Array[] = [];
  const D: Float64Array[] = [];
  const bt: Uint8Array[] = []; // best move into H: 0 diag, 1 up (insertion), 2 left (deletion)
  const ext: Uint8Array[] = []; // 1 if D[i][j] extends a gap, 0 if it opens one
  for (let i = 0; i <= m; i++) {
    H.push(new Float64Array(n + 1));
    D.push(new Float64Array(n + 1).fill(Infinity));
    bt.push(new Uint8Array(n + 1));
    ext.push(new Uint8Array(n + 1));
  }
  for (let j = 1; j <= n; j++) {
    D[0][j] = GAP_OPEN + (j - 1) * GAP_EXT;
    ext[0][j] = j > 1 ? 1 : 0;
    H[0][j] = D[0][j];
    bt[0][j] = 2;
  }
  for (let i = 1; i <= m; i++) {
    H[i][0] = i * INS_COST;
    bt[i][0] = 1;
    for (let j = 1; j <= n; j++) {
      const score = wordScore(heard[i - 1], expected[j - 1]);
      const diag = H[i - 1][j - 1] + (isMatch(score, expected[j - 1]) ? 1 - score : SUB_COST);
      const up = H[i - 1][j] + INS_COST;
      const open = H[i][j - 1] + GAP_OPEN;
      const extend = D[i][j - 1] + GAP_EXT;
      if (extend < open) {
        D[i][j] = extend;
        ext[i][j] = 1;
      } else {
        D[i][j] = open;
      }
      const left = D[i][j];
      // Prefer diagonal on ties: it keeps the reading position moving forward.
      if (diag <= up && diag <= left) {
        H[i][j] = diag;
        bt[i][j] = 0;
      } else if (up <= left) {
        H[i][j] = up;
        bt[i][j] = 1;
      } else {
        H[i][j] = left;
        bt[i][j] = 2;
      }
    }
  }

  // Free end on the expected side: pick the cheapest end, latest on ties.
  let bestJ = 0;
  for (let j = 1; j <= n; j++) {
    if (H[m][j] <= H[m][bestJ] + 1e-9) bestJ = j;
  }

  const words: AlignedWord[] = new Array(bestJ);
  const extras: string[] = [];
  let i = m;
  let j = bestJ;
  let inGap = false;
  while (i > 0 || j > 0) {
    const move = inGap ? 2 : i === 0 ? 2 : j === 0 ? 1 : bt[i][j];
    if (move === 0) {
      const h = heard[i - 1];
      const ok = isMatch(wordScore(h, expected[j - 1]), expected[j - 1]);
      words[j - 1] = ok ? { status: 'correct' } : { status: 'wrong', heard: h };
      i--;
      j--;
    } else if (move === 1) {
      extras.unshift(heard[i - 1]);
      i--;
    } else {
      words[j - 1] = { status: 'skipped' };
      inGap = ext[i][j] === 1;
      j--;
    }
  }
  return { words, consumed: bestJ, extras };
}
