# Hifz Saathi (حفظ ساتھی)

Huffaz ke liye **free** Android app (React Native / Expo). Aap tilawat karte hain, app sunti hai,
aur Quran ka text samne chalta hai. **Ghalat parha gaya lafz laal** ho jata hai, chhoota hua lafz
laal underline ho jata hai.

A free, offline Quran recitation checker for huffaz.

## Features (MVP)

- 114 surahs, Uthmani text (Amiri Quran font), optional Urdu tarjuma
- Live mic: speech recognition **phone par hi** (whisper.cpp via `whisper.rn`), internet ki zaroorat nahi
- Word-by-word matching: sahih = hara, ghalat = laal (tap karein to sahih lafz aur jo suna gaya wo nazar aata hai), chhoota = laal underline
- **Hifz mode**: text chhupa rehta hai aur jaise jaise aap parhte hain, khulta jata hai
- Kisi bhi ayat se shuru karein; ta'awwudh aur bismillah khud nazar-andaz ho jate hain

## Kaise kaam karti hai

```
mic (16 kHz PCM) -> whisper.rn RealtimeTranscriber -> text per audio slice
     -> src/lib/recitation.ts (RecitationTracker) -> src/lib/matcher.ts (word alignment)
     -> har lafz ka status: correct / wrong / skipped
```

- `src/lib/arabic.ts`: Uthmani aur saade Arabi text ko ek jaisa banata hai (tashkeel, alif wasla, dagger alif, waqf ke nishan wagaira)
- `src/lib/matcher.ts`: heard words ko Quran ke words se align karta hai (edit-distance alignment)
- `src/lib/recitation.ts`: live slices ko track karta hai; jo lafz abhi bola ja raha hai us par jaldi faisla nahi karta
- Matching ki soch [sayedmahmoud266/quran-ai-transcribing](https://github.com/sayedmahmoud266/quran-ai-transcribing) (MIT) se li gayi hai, jo isi model ko server par chalata hai

## AI model

App pehli dafa chalne par Settings se model download karti hai (~80 MB, sirf ek dafa):

1. **Quran model (tavsiya)**: `tarteel-ai/whisper-base-ar-quran` (Apache-2.0), GGML q8_0 mein convert kiya hua.
   Ye GitHub release `model-v1` se aata hai. Release banane ke liye **Actions -> "Convert speech model" -> Run workflow** ek dafa chalayen
   (ya local: `./scripts/convert_model.sh`).
2. **General Arabic model**: OpenAI Whisper base (whisper.cpp ka GGML), backup ke taur par.

## APK banana (bina Expo account ke)

`main` par har push par **Actions -> "Build Android APK"** khud chalta hai aur APK
`latest-apk` release mein daal deta hai. Wahan se download karke phone mein install karein.

Expo account ho to: `npx eas-cli build -p android --profile preview`.

## Development

```bash
npm install
npm test            # matching logic ke tests
npm run typecheck
npx expo run:android   # native modules ki wajah se Expo Go kaam nahi karega
```

Quran data dobara banana ho to: `npm run build:data` (`quran-json` package se `src/data/quran.json`).

## Credits & licenses

- Quran text: [Tanzil.net](https://tanzil.net) via [quran-json](https://github.com/risan/quran-json) (CC BY 4.0)
- Speech model: [tarteel-ai/whisper-base-ar-quran](https://huggingface.co/tarteel-ai/whisper-base-ar-quran) (Apache-2.0)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [whisper.rn](https://github.com/mybigday/whisper.rn) (MIT)
- Font: Amiri Quran (OFL)

App ka code MIT license ke tehat hai.
