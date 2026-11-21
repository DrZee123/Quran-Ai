import { useKeepAwake } from 'expo-keep-awake';
import { Link, Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MushafWord, type MushafWordState } from '../../components/MushafWord';
import { getAllNormalized, getAllWords, getPage, PAGE_COUNT, toArabicDigits } from '../../lib/quran';
import { Recognizer } from '../../lib/recognizer';
import { RecitationTracker, type WordState } from '../../lib/recitation';
import { colors, quranFont } from '../../theme';

/** Milliseconds between two words appearing, so a burst of recognised words still "writes" smoothly. */
const REVEAL_STEP_MS = 85;

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function MushafPageScreen() {
  const params = useLocalSearchParams<{ n: string }>();
  const [pageNo, setPageNo] = useState(() => Math.min(PAGE_COUNT, Math.max(1, Number(params.n) || 1)));
  const page = useMemo(() => getPage(pageNo), [pageNo]);
  const all = useMemo(() => getAllWords(), []);
  const { width } = useWindowDimensions();
  const fontSize = Math.max(17, Math.min(26, width / 17));

  const [writeMode, setWriteMode] = useState(true); // words appear only when recited
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState('');
  const [timing, setTiming] = useState('');
  const [startWord, setStartWord] = useState(page.first);
  const [states, setStates] = useState<Map<number, WordState>>(new Map());
  const [shown, setShown] = useState(page.first); // words < shown are revealed
  const [selected, setSelected] = useState<number | null>(null);

  const target = useRef(page.first);
  const trackerRef = useRef<RecitationTracker | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const slide = useRef(new Animated.Value(0)).current;

  // Reset when the page changes by hand (not while following a recitation across pages).
  const goToPage = useCallback(
    (p: number, dir: 1 | -1) => {
      if (p < 1 || p > PAGE_COUNT) return;
      Animated.timing(slide, { toValue: dir * width, duration: 180, useNativeDriver: true, easing: Easing.in(Easing.quad) }).start(() => {
        setPageNo(p);
        router.setParams({ n: String(p) });
        slide.setValue(-dir * width);
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
      });
    },
    [slide, width],
  );

  useEffect(() => {
    if (trackerRef.current) return; // recitation in progress keeps its state
    setStartWord(page.first);
    setShown(page.first);
    target.current = page.first;
    setStates(new Map());
    setSelected(null);
  }, [page.first]);

  // Reveal words one by one towards the recognised position.
  useEffect(() => {
    const id = setInterval(() => {
      setShown((s) => (s < target.current ? s + 1 : s > target.current ? target.current : s));
    }, REVEAL_STEP_MS);
    return () => clearInterval(id);
  }, []);

  // Turn the page when the reciter finishes it.
  useEffect(() => {
    if (recording && shown >= page.end && pageNo < PAGE_COUNT) {
      const t = setTimeout(() => goToPage(pageNo + 1, 1), 500);
      return () => clearTimeout(t);
    }
  }, [recording, shown, page.end, pageNo, goToPage]);

  useEffect(() => () => void recRef.current?.stop(), []);

  const pullStates = useCallback(() => {
    const t = trackerRef.current;
    if (!t) return;
    const s = t.states();
    const m = new Map<number, WordState>();
    for (let i = t.startIndex; i < Math.min(s.length, t.position + 2); i++) if (s[i].status !== 'pending') m.set(i, s[i]);
    setStates(m);
    target.current = t.position;
  }, []);

  const start = async () => {
    setError(null);
    setBusy(true);
    const tracker = new RecitationTracker(getAllNormalized(), startWord);
    trackerRef.current = tracker;
    target.current = startWord;
    setShown(startWord);
    setStates(new Map());
    const rec = new Recognizer({
      onText: (seg, text, final) => {
        tracker.update(seg, text);
        if (final) tracker.endSlice();
        setHeard(text);
        pullStates();
      },
      onTiming: (ms, sec) => setTiming(`${(ms / 1000).toFixed(1)}s / ${sec.toFixed(1)}s awaz`),
      onError: setError,
      onActiveChange: setRecording,
    });
    recRef.current = rec;
    try {
      await rec.start();
      setRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'NO_MODEL' ? 'Pehle Settings mein AI model download karein.' : msg === 'NO_MIC' ? 'Microphone ki ijazat nahi mili.' : msg);
      recRef.current = null;
      trackerRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await recRef.current?.stop();
    } finally {
      recRef.current = null;
      trackerRef.current?.finish();
      pullStates();
      trackerRef.current = null;
      setRecording(false);
      setBusy(false);
    }
  };

  const reset = () => {
    setStates(new Map());
    target.current = startWord;
    setShown(startWord);
    setSelected(null);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !recording && Math.abs(g.dx) > 30 && Math.abs(g.dy) < 20,
        onPanResponderRelease: (_, g) => {
          // Quran pages turn right-to-left: swipe right = next page.
          if (g.dx > 60) goToPage(pageNo + 1, 1);
          else if (g.dx < -60) goToPage(pageNo - 1, -1);
        },
      }),
    [recording, pageNo, goToPage],
  );

  const wordState = (g: number): MushafWordState => {
    const s = states.get(g);
    if (s?.status === 'wrong') return 'wrong';
    if (s?.status === 'skipped') return 'skipped';
    const before = g < startWord;
    if (writeMode && !before && g >= shown) return 'hidden';
    if (recording && g === shown) return 'current';
    if (s?.status === 'correct') return 'correct';
    return 'plain';
  };

  const mistakes = [...states.values()].filter((s) => s.status === 'wrong' || s.status === 'skipped').length;
  const sel = selected != null ? states.get(selected) : undefined;
  const juzLabel = page.sections.map((s) => s.surah.tr).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: `Safha ${pageNo}` }} />
      {recording ? <KeepAwake /> : null}

      <View style={styles.toolbar}>
        <View style={styles.segment}>
          <Pressable onPress={() => setWriteMode(true)} style={[styles.segBtn, writeMode && styles.segActive]}>
            <Text style={[styles.segText, writeMode && { color: '#fff' }]}>Likhta jaye</Text>
          </Pressable>
          <Pressable onPress={() => setWriteMode(false)} style={[styles.segBtn, !writeMode && styles.segActive]}>
            <Text style={[styles.segText, !writeMode && { color: '#fff' }]}>Poora safha</Text>
          </Pressable>
        </View>
        <Text style={styles.small} numberOfLines={1}>{juzLabel}</Text>
      </View>

      <Animated.View style={{ flex: 1, transform: [{ translateX: slide }] }} {...pan.panHandlers}>
        <ScrollView contentContainerStyle={styles.pageWrap}>
          <View style={styles.page}>
            {page.sections.map((sec) => (
              <View key={sec.surah.id}>
                {sec.starts ? (
                  <>
                    <View style={styles.surahHead}>
                      <Text style={styles.surahHeadText}>سُورَةُ {sec.surah.name}</Text>
                    </View>
                    {sec.surah.id !== 1 && sec.surah.id !== 9 ? (
                      <Text style={[styles.basmala, { fontSize }]}>بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</Text>
                    ) : null}
                  </>
                ) : null}
                <View style={styles.flow}>
                  {sec.ayahs.map((a) => [
                    ...a.words.map((w) => (
                      <MushafWord
                        key={w.gIndex}
                        text={w.text}
                        state={wordState(w.gIndex)}
                        fontSize={fontSize}
                        onPress={() => (recording ? setSelected(w.gIndex) : states.get(w.gIndex) ? setSelected(w.gIndex) : setStartWord(w.gIndex))}
                      />
                    )),
                    <Text
                      key={`m${sec.surah.id}:${a.number}`}
                      style={[
                        styles.marker,
                        { fontSize: fontSize * 0.95, lineHeight: fontSize * 2.05 },
                        writeMode && a.words[a.words.length - 1].gIndex >= shown && a.words[0].gIndex >= startWord && { opacity: 0 },
                      ]}
                    >
                      {'۝'}
                      {toArabicDigits(a.number)}
                    </Text>,
                  ])}
                </View>
              </View>
            ))}
            <Text style={styles.pageNo}>{toArabicDigits(pageNo)}</Text>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.bottom}>
        {error ? <Text style={styles.error}>{error}{error.includes('Settings') ? '  ' : ''}{error.includes('Settings') ? <Link href="/settings" style={styles.link}>Settings</Link> : null}</Text> : null}
        {sel && selected != null ? (
          <Pressable style={styles.info} onPress={() => setSelected(null)}>
            <Text style={styles.infoText}>
              Sahih: <Text style={styles.infoAr}>{all[selected].text}</Text>
              {sel.status === 'wrong' ? (
                <>   Aap ne parha: <Text style={[styles.infoAr, { color: colors.wrong }]}>{sel.heard}</Text></>
              ) : sel.status === 'skipped' ? '   (ye lafz chhoot gaya)' : '   ✓'}
            </Text>
          </Pressable>
        ) : !recording && !error ? (
          <Text style={styles.hint}>Jis lafz se shuru karna hai us par tap karein, phir mic dabayen</Text>
        ) : null}
        {recording && heard ? (
          <Text style={styles.heard} numberOfLines={1}>
            AI ne suna: {heard}
            {timing ? `   ·   ${timing}` : ''}
          </Text>
        ) : null}
        <View style={styles.bar}>
          <Pressable onPress={() => goToPage(pageNo + 1, 1)} disabled={recording || pageNo >= PAGE_COUNT} hitSlop={10} style={styles.navBtn}>
            <Text style={[styles.link, (recording || pageNo >= PAGE_COUNT) && { opacity: 0.3 }]}>‹ Agla</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.wrong, fontWeight: '700' }}>{mistakes ? `✗ ${mistakes} ghalti` : ' '}</Text>
          </View>
          <Pressable
            disabled={busy}
            onPress={recording ? stop : start}
            style={[styles.mic, recording && { backgroundColor: colors.wrong }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.micText}>{recording ? '■' : '🎙'}</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Pressable onPress={reset} disabled={recording} hitSlop={10}>
              <Text style={[styles.link, recording && { opacity: 0.3 }]}>Dobara</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => goToPage(pageNo - 1, -1)} disabled={recording || pageNo <= 1} hitSlop={10} style={styles.navBtn}>
            <Text style={[styles.link, (recording || pageNo <= 1) && { opacity: 0.3 }]}>Pichla ›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heard: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 10, paddingTop: 6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border },
  segment: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.primary, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.primary, fontWeight: '600' },
  small: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  pageWrap: { padding: 10, paddingBottom: 170 },
  page: { backgroundColor: '#FFFDF6', borderWidth: 2, borderColor: '#C9B98F', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 12, minHeight: 520 },
  surahHead: { borderWidth: 1.5, borderColor: '#C9B98F', backgroundColor: colors.primarySoft, borderRadius: 6, paddingVertical: 4, marginVertical: 6, alignItems: 'center' },
  surahHeadText: { fontFamily: quranFont, fontSize: 22, color: colors.primary },
  basmala: { fontFamily: quranFont, textAlign: 'center', color: colors.text, marginBottom: 2 },
  flow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center' },
  marker: { fontFamily: quranFont, color: colors.primary, paddingHorizontal: 3 },
  pageNo: { textAlign: 'center', color: colors.muted, marginTop: 8, fontSize: 14 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  navBtn: { paddingHorizontal: 4 },
  mic: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  micText: { fontSize: 28, color: '#fff' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  error: { padding: 10, backgroundColor: colors.wrongBg, color: colors.wrong },
  info: { padding: 10, backgroundColor: colors.primarySoft },
  infoText: { textAlign: 'center', color: colors.text },
  infoAr: { fontFamily: quranFont, fontSize: 20 },
  hint: { textAlign: 'center', fontSize: 12, color: colors.muted, paddingTop: 8 },
});
