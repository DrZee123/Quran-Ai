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
const DEL_COST = 1; // skipped expected word

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

  // dp[i][j]: min cost aligning heard[0..i) with expected[0..j)
  const dp: Float64Array[] = [];
  const bt: Uint8Array[] = []; // 0 diag, 1 up (insertion), 2 left (deletion)
  for (let i = 0; i <= m; i++) {
    dp.push(new Float64Array(n + 1));
    bt.push(new Uint8Array(n + 1));
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j * DEL_COST;
    bt[0][j] = 2;
  }
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * INS_COST;
    bt[i][0] = 1;
    for (let j = 1; j <= n; j++) {
      const score = wordScore(heard[i - 1], expected[j - 1]);
      const diag = dp[i - 1][j - 1] + (isMatch(score, expected[j - 1]) ? 1 - score : SUB_COST);
      const up = dp[i - 1][j] + INS_COST;
      const left = dp[i][j - 1] + DEL_COST;
      // Prefer diagonal on ties: it keeps the reading position moving forward.
      if (diag <= up && diag <= left) {
        dp[i][j] = diag;
        bt[i][j] = 0;
      } else if (up <= left) {
        dp[i][j] = up;
        bt[i][j] = 1;
      } else {
        dp[i][j] = left;
        bt[i][j] = 2;
      }
    }
  }

  // Free end on the expected side: pick the cheapest end, latest on ties.
  let bestJ = 0;
  for (let j = 1; j <= n; j++) {
    if (dp[m][j] <= dp[m][bestJ] + 1e-9) bestJ = j;
  }

  const words: AlignedWord[] = new Array(bestJ);
  const extras: string[] = [];
  let i = m;
  let j = bestJ;
  while (i > 0 || j > 0) {
    const move = i === 0 ? 2 : j === 0 ? 1 : bt[i][j];
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
      j--;
    }
  }
  return { words, consumed: bestJ, extras };
}
