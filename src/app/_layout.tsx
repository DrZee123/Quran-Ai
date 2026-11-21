import { AmiriQuran_400Regular, useFonts } from '@expo-google-fonts/amiri-quran';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';

export default function RootLayout() {
  const [loaded] = useFonts({ AmiriQuran_400Regular });
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Hifz Saathi' }} />
        <Stack.Screen name="surah/[id]" options={{ title: '' }} />
        <Stack.Screen name="page/[n]" options={{ title: 'Safha' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings / Model' }} />
      </Stack>
    </>
  );
}
