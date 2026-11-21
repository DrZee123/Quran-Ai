import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { colors, quranFont } from '../theme';

export type MushafWordState = 'hidden' | 'plain' | 'correct' | 'wrong' | 'skipped' | 'current';

interface Props {
  text: string;
  state: MushafWordState;
  fontSize: number;
  onPress?: () => void;
}

/**
 * One word on the mushaf page. Hidden words keep their place on the line (opacity 0),
 * so revealing a word never moves the rest of the page.
 */
function MushafWordBase({ text, state, fontSize, onPress }: Props) {
  const visible = state !== 'hidden';
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const color = state === 'wrong' || state === 'skipped' ? colors.wrong : colors.text;
  return (
    <Pressable onPress={onPress} hitSlop={2}>
      <Animated.Text
        style={[
          styles.word,
          { fontSize, lineHeight: fontSize * 2.05, color },
          state === 'wrong' && styles.wrongBg,
          state === 'skipped' && styles.skipped,
          state === 'current' && styles.current,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }],
          },
        ]}
      >
        {text}
      </Animated.Text>
    </Pressable>
  );
}

export const MushafWord = memo(MushafWordBase);

const styles = StyleSheet.create({
  word: { fontFamily: quranFont, paddingHorizontal: 3, writingDirection: 'rtl' },
  wrongBg: { backgroundColor: colors.wrongBg, borderRadius: 6 },
  skipped: { textDecorationLine: 'underline' },
  current: { backgroundColor: '#FFF3C4', borderRadius: 6 },
});
