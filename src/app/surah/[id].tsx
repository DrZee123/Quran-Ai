import { useKeepAwake } from 'expo-keep-awake';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AyahView, type WordView } from '../../components/AyahView';
import { getSurah } from '../../lib/quran';
import { Recognizer } from '../../lib/recognizer';
import { RecitationTracker, type WordState } from '../../lib/recitation';
import { colors, quranFont } from '../../theme';

type Mode = 'read' | 'hifz';

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function SurahScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const surah = useMemo(() => getSurah(Number(id)), [id]);
  const expected = useMemo(() => surah.words.map((w) => w.norm), [surah]);

  const [mode, setMode] = useState<Mode>('read');
  const [showUrdu, setShowUrdu] = useState(false);
  const [startAyah, setStartAyah] = useState(1);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<WordState[]>(() => expected.map(() => ({ status: 'pending' })));
  const [position, setPosition] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);

  const trackerRef = useRef<RecitationTracker | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const listRef = useRef<FlatList>(null);

  const startIndex = surah.ayahs[startAyah - 1]?.words[0]?.index ?? 0;

  const refresh = useCallback(() => {
    const t = trackerRef.current;
    if (!t) return;
    setStates(t.states());
    setPosition(t.position);
  }, []);

  const reset = useCallback(() => {
    trackerRef.current = null;
    setStates(expected.map(() => ({ status: 'pending' })));
    setPosition(startIndex);
    setSelectedWord(null);
  }, [expected, startIndex]);

  useEffect(() => {
    if (!recording) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAyah]);

  useEffect(() => () => void recognizerRef.current?.stop(), []);

  const start = async () => {
    setError(null);
    setBusy(true);
    const tracker = new RecitationTracker(expected, startIndex);
    trackerRef.current = tracker;
    refresh();
    const rec = new Recognizer({
      onText: (slice, text) => {
        tracker.update(slice, text);
        refresh();
      },
      onError: (msg) => setError(msg),
      onActiveChange: (active) => setRecording(active),
    });
    recognizerRef.current = rec;
    try {
      await rec.start();
      setRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg === 'NO_MODEL'
          ? 'Pehle Settings mein ja kar AI model download karein (sirf ek dafa).'
          : msg === 'NO_MIC'
            ? 'Microphone ki ijazat nahi mili.'
            : `Recording shuru nahi ho saki: ${msg}`,
      );
      recognizerRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await recognizerRef.current?.stop();
    } finally {
      recognizerRef.current = null;
      trackerRef.current?.finish();
      refresh();
      setRecording(false);
      setBusy(false);
    }
  };

  // Follow the reciter: scroll to the ayah being recited.
  const currentAyah = surah.words[Math.min(position, surah.words.length - 1)]?.ayah ?? 1;
  useEffect(() => {
    if (recording && currentAyah > 0) {
      listRef.current?.scrollToIndex({ index: currentAyah - 1, viewPosition: 0.3, animated: true });
    }
  }, [currentAyah, recording]);

  const views: WordView[] = useMemo(
    () =>
      states.map((s, i) => ({
        ...s,
        beforeStart: i < startIndex,
        current: recording && i === position,
        hidden: mode === 'hifz' && i >= startIndex && i >= position && s.status === 'pending',
      })),
    [states, startIndex, recording, position, mode],
  );

  const mistakes = states.filter((s) => s.status === 'wrong' || s.status === 'skipped').length;
  const correct = states.filter((s) => s.status === 'correct').length;
  const sel = selectedWord != null ? states[selectedWord] : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `${surah.meta.id}. ${surah.meta.tr}` }} />
      {recording ? <KeepAwake /> : null}

      <View style={styles.toolbar}>
        <View style={styles.segment}>
          {(['read', 'hifz'] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segActive]}>
              <Text style={[styles.segText, mode === m && { color: '#fff' }]}>
                {m === 'read' ? 'Dekh kar' : 'Hifz (chhupa)'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.urduToggle}>
          <Text style={styles.small}>Urdu</Text>
          <Switch value={showUrdu} onValueChange={setShowUrdu} trackColor={{ true: colors.primary }} />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={surah.ayahs}
        keyExtractor={(a) => String(a.number)}
        onScrollToIndexFailed={(info) =>
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true }), 300)
        }
        ListHeaderComponent={
          surah.meta.id !== 1 && surah.meta.id !== 9 ? (
            <Text style={styles.basmala}>بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</Text>
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: 160 }}
        renderItem={({ item }) => {
          const first = item.words[0]?.index ?? 0;
          const slice = views.slice(first, first + item.words.length);
          const signature = slice
            .map((v) => `${v.status[0]}${v.hidden ? 'h' : ''}${v.current ? 'c' : ''}${v.beforeStart ? 'b' : ''}`)
            .join('');
          return (
            <AyahView
              ayah={item}
              words={slice}
              signature={signature}
              isStart={item.number === startAyah}
              showUrdu={showUrdu}
              onPressNumber={(n) => !recording && setStartAyah(n)}
              onPressWord={(i) => setSelectedWord(i)}
            />
          );
        }}
      />

      <View style={styles.bottom}>
        {error ? (
          <View style={styles.error}>
            <Text style={{ color: colors.wrong, flex: 1 }}>{error}</Text>
            {error.includes('Settings') ? (
              <Link href="/settings" style={styles.link}>
                Settings
              </Link>
            ) : null}
          </View>
        ) : null}
        {sel && (sel.status === 'wrong' || sel.status === 'skipped') && selectedWord != null ? (
          <Pressable style={styles.info} onPress={() => setSelectedWord(null)}>
            <Text style={styles.infoText}>
              Sahih: <Text style={styles.infoAr}>{surah.words[selectedWord].text}</Text>
              {sel.status === 'wrong' ? (
                <>
                  {'   '}Aap ne parha: <Text style={[styles.infoAr, { color: colors.wrong }]}>{sel.heard}</Text>
                </>
              ) : (
                '   (ye lafz chhoot gaya)'
              )}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Ayat {startAyah} se</Text>
            <Text style={styles.stats}>
              <Text style={{ color: colors.correct }}>✓ {correct}</Text>
              {'   '}
              <Text style={{ color: colors.wrong }}>✗ {mistakes}</Text>
            </Text>
          </View>
          <Pressable
            disabled={busy}
            onPress={recording ? stop : start}
            style={[styles.mic, recording && { backgroundColor: colors.wrong }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.micText}>{recording ? '■' : '🎙'}</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Pressable onPress={reset} disabled={recording} hitSlop={10}>
              <Text style={[styles.link, recording && { opacity: 0.4 }]}>Dobara</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  segment: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.primary, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.primary, fontWeight: '600' },
  urduToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontSize: 12, color: colors.muted },
  basmala: { fontFamily: quranFont, fontSize: 26, textAlign: 'center', color: colors.primary, marginVertical: 12 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  stats: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  mic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micText: { fontSize: 30, color: '#fff' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  error: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: colors.wrongBg, gap: 8 },
  info: { padding: 10, backgroundColor: colors.primarySoft },
  infoText: { color: colors.text, textAlign: 'center' },
  infoAr: { fontFamily: quranFont, fontSize: 20 },
});
