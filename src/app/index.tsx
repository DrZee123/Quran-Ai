import { Link, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SURAHS } from '../lib/quran';
import { colors, quranFont } from '../theme';

export default function SurahList() {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SURAHS;
    return SURAHS.filter(
      (x) => String(x.id) === s || x.tr.toLowerCase().includes(s) || x.name.includes(s) || x.meaning.includes(s),
    );
  }, [q]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable hitSlop={12}>
                <Text style={{ color: '#fff', fontSize: 15 }}>Settings</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <TextInput
        placeholder="Surah talash karein (naam ya number)"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
        style={styles.search}
      />
      <FlatList
        data={list}
        keyExtractor={(s) => String(s.id)}
        initialNumToRender={20}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/surah/[id]', params: { id: String(item.id) } }} asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
              <View style={styles.num}>
                <Text style={styles.numText}>{item.id}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tr}>{item.tr}</Text>
                <Text style={styles.sub}>
                  {item.meaning} · {item.verseCount} ayaat · {item.type === 'meccan' ? 'Makki' : 'Madani'}
                </Text>
              </View>
              <Text style={styles.ar}>{item.name}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 12,
  },
  num: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  numText: { color: colors.primary, fontWeight: '700', transform: [{ rotate: '-45deg' }] },
  tr: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  ar: { fontFamily: quranFont, fontSize: 22, color: colors.primary },
});
