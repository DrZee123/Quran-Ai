import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MODELS,
  type SpeechModel,
  cleanupOldModels,
  deleteModel,
  downloadModel,
  getSelectedModelId,
  isDownloaded,
  setSelectedModelId,
} from '../lib/models';
import { colors } from '../theme';

export default function Settings() {
  const [selected, setSelected] = useState<string>(MODELS[0].id);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, force] = useState(0);
  const aborts = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    cleanupOldModels();
    getSelectedModelId().then(setSelected);
  }, []);

  const select = useCallback(async (m: SpeechModel) => {
    await setSelectedModelId(m.id);
    setSelected(m.id);
  }, []);

  const download = async (m: SpeechModel) => {
    setErrors((e) => ({ ...e, [m.id]: '' }));
    const ctrl = new AbortController();
    aborts.current[m.id] = ctrl;
    setProgress((p) => ({ ...p, [m.id]: 0 }));
    try {
      await downloadModel(m, (f) => setProgress((p) => ({ ...p, [m.id]: f })), ctrl.signal);
      await select(m);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setErrors((x) => ({ ...x, [m.id]: `Download nahi ho saka: ${e instanceof Error ? e.message : e}` }));
      }
    } finally {
      delete aborts.current[m.id];
      setProgress((p) => {
        const { [m.id]: _, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.h}>AI model</Text>
      <Text style={styles.p}>
        Tilawat pehchanne wala AI model aap ke phone par hi chalta hai. Internet sirf ek dafa model download karne ke liye
        chahiye. Aap ki awaz kahin nahi bheji jati.
      </Text>

      {MODELS.map((m) => {
        const done = isDownloaded(m);
        const p = progress[m.id];
        const downloading = p != null;
        return (
          <View key={m.id} style={[styles.card, selected === m.id && done && styles.cardActive]}>
            <Text style={styles.title}>{m.title}</Text>
            <Text style={styles.p}>{m.description}</Text>
            <Text style={styles.small}>Size: taqreeban {m.approxMB} MB</Text>
            {downloading ? (
              <View style={{ gap: 6 }}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(p * 100)}%` }]} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.small}>{Math.round(p * 100)}%</Text>
                  <Pressable onPress={() => aborts.current[m.id]?.abort()}>
                    <Text style={styles.link}>Rokein</Text>
                  </Pressable>
                </View>
              </View>
            ) : done ? (
              <View style={styles.row}>
                {selected === m.id ? (
                  <Text style={[styles.small, { color: colors.correct }]}>✓ Istemal ho raha hai</Text>
                ) : (
                  <Pressable onPress={() => select(m)}>
                    <Text style={styles.link}>Ye model istemal karein</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    deleteModel(m);
                    force((x) => x + 1);
                  }}
                >
                  <Text style={[styles.link, { color: colors.wrong }]}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.btn} onPress={() => download(m)}>
                <Text style={styles.btnText}>Download</Text>
              </Pressable>
            )}
            {errors[m.id] ? <Text style={{ color: colors.wrong }}>{errors[m.id]}</Text> : null}
          </View>
        );
      })}

      <Text style={[styles.h, { marginTop: 12 }]}>Istemal ka tareeqa</Text>
      <Text style={styles.p}>
        1. Surah kholein, jis ayat se parhna hai us ke neeche "se shuru karein" dabayein.{'\n'}
        2. Mic button daba kar tilawat shuru karein.{'\n'}
        3. Sahih alfaaz hare, ghalat alfaaz laal ho jate hain. Laal lafz par tap karein to sahih lafz nazar aata hai.{'\n'}
        4. "Hifz (chhupa)" mode mein text chhupa rehta hai aur jaise jaise aap parhte hain samne aata jata hai.
      </Text>

      <Text style={[styles.h, { marginTop: 12 }]}>Credits</Text>
      <Text style={styles.p}>
        Quran text: Tanzil.net (Uthmani), quran-json (CC BY 4.0). Urdu tarjuma: quran-json. Speech model:
        tarteel-ai/whisper-base-ar-quran (Apache-2.0) via whisper.cpp / whisper.rn (MIT). Font: Amiri Quran (OFL).
      </Text>
      <Pressable onPress={() => Linking.openURL('https://tanzil.net')}>
        <Text style={styles.link}>tanzil.net</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 18, fontWeight: '700', color: colors.text },
  p: { fontSize: 14, lineHeight: 21, color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  title: { fontSize: 16, fontWeight: '700', color: colors.primary },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  cardActive: { borderColor: colors.primary, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700' },
  btn: { backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  track: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
});
