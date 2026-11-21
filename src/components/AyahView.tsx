import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Ayah } from '../lib/quran';
import { toArabicDigits } from '../lib/quran';
import type { WordState } from '../lib/recitation';
import { colors, quranFont } from '../theme';

export type WordView = WordState & { hidden: boolean; current: boolean; beforeStart: boolean };

interface Props {
  ayah: Ayah;
  words: WordView[];
  /** Stable key for memoisation: changes whenever any word view changes. */
  signature: string;
  isStart: boolean;
  showUrdu: boolean;
  onPressNumber: (ayah: number) => void;
  onPressWord: (wordIndex: number) => void;
}

function wordStyle(w: WordView) {
  if (w.hidden) return styles.hidden;
  if (w.status === 'wrong') return styles.wrong;
  if (w.status === 'skipped') return styles.skipped;
  if (w.current) return styles.current;
  if (w.status === 'correct') return styles.correct;
  if (w.beforeStart) return styles.dim;
  return null;
}

function AyahViewBase({ ayah, words, isStart, showUrdu, onPressNumber, onPressWord }: Props) {
  return (
    <View style={[styles.box, isStart && styles.startBox]}>
      <Text style={styles.arabic}>
        {ayah.words.map((w, k) => {
          const v = words[k];
          return (
            <Text key={w.index} onPress={() => onPressWord(w.index)} style={wordStyle(v)}>
              {w.text}
              {' '}
            </Text>
          );
        })}
        <Text onPress={() => onPressNumber(ayah.number)} style={styles.marker}>
          {'۝'}
          {toArabicDigits(ayah.number)}
        </Text>
      </Text>
      {showUrdu ? <Text style={styles.urdu}>{ayah.urdu}</Text> : null}
      <Pressable onPress={() => onPressNumber(ayah.number)} hitSlop={8}>
        <Text style={styles.startHint}>{isStart ? '▶ Yahan se shuru' : `Ayat ${ayah.number} se shuru karein`}</Text>
      </Pressable>
    </View>
  );
}

export const AyahView = memo(
  AyahViewBase,
  (a, b) => a.signature === b.signature && a.isStart === b.isStart && a.showUrdu === b.showUrdu && a.ayah === b.ayah,
);

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startBox: { borderColor: colors.primary, borderWidth: 2 },
  arabic: {
    fontFamily: quranFont,
    fontSize: 26,
    lineHeight: 58,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  marker: { color: colors.primary, fontSize: 24 },
  correct: { color: colors.correct },
  wrong: { color: colors.wrong, backgroundColor: colors.wrongBg },
  skipped: { color: colors.skipped, textDecorationLine: 'underline' },
  current: { backgroundColor: '#FFF3C4' },
  dim: { color: colors.muted },
  hidden: { color: 'transparent', backgroundColor: colors.hidden },
  urdu: { marginTop: 6, fontSize: 15, lineHeight: 26, color: colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  startHint: { marginTop: 6, fontSize: 12, color: colors.primary },
});
