/**
 * Real transcripts of whole-page recitations (Husary / Alafasy, surah 2), cut
 * into segments exactly as the app's segmenter cut them. A correct
 * recitation must not turn red; a real mistake must.
 */
import { getAllNormalized, getAllWords } from '../src/lib/quran';
import { RecitationTracker } from '../src/lib/recitation';

const all = getAllNormalized();
const words = getAllWords();
const at = (s: number, a: number) => words.findIndex((w) => w.surah === s && w.ayah === a);

function recite(segments: string[], start = at(2, 1)) {
  const t = new RecitationTracker(all, start);
  segments.forEach((text, i) => {
    t.update(i, text);
    t.endSlice();
  });
  const st = t.states().slice(start, t.position);
  return { t, st, red: st.filter((s) => s.status === 'wrong' || s.status === 'skipped').length };
}

describe('segments of a correct recitation', () => {
  it('ignores a stray fragment between segments', () => {
    const r = recite(['الم', 'حم', 'ذَلِكَ الْكِتَابُ لَا رَيْبَ', 'فِيهِ هُدًى لِلْمُتَّقِينَ']);
    expect(r.red).toBe(0);
    expect(r.t.position).toBe(at(2, 3));
  });

  it('joins a word cut in half by a segment end', () => {
    const r = recite(['أُولَئِكَ عَلَى هُدًى مِنْ رَبٍ', 'بِهِمْ', 'وَأُولَئِكَ هُمُ الْمُفْلِحُونَ'], at(2, 5));
    expect(r.red).toBe(0);
    expect(r.t.position).toBe(at(2, 6));
  });

  it('accepts the article swallowed after the previous word', () => {
    const r = recite(['الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ', 'صَلَاتَ وَمِمَّا رَزَقْنَاهُمْ يُنْفِقُونَ'], at(2, 3));
    expect(r.red).toBe(0);
    expect(r.t.position).toBe(at(2, 4));
  });

  it('keeps going after a trailing fragment', () => {
    const r = recite(['وَأُولَئِكَ هُمُ الْمُفْلِحُ', 'حُونٍ', 'إِنَّ الَّذِينَ كَفَرُوا سَوَاءٌ'], at(2, 5) + 5);
    expect(r.red).toBe(0);
  });
});

describe('real mistakes still turn red', () => {
  it('a wrong word inside a segment', () => {
    const r = recite(['الم', 'ذَلِكَ الْكِتَابُ لَا شَكَّ فِيهِ هُدًى']);
    expect(r.red).toBe(1);
    expect(r.st[4]).toEqual({ status: 'wrong', heard: 'شك' });
  });

  it('a wrong word at the end of a segment, once reading goes on', () => {
    const r = recite(['الم', 'ذَلِكَ الْكِتَابُ لَا شَكَّ', 'فِيهِ هُدًى لِلْمُتَّقِينَ']);
    expect(r.red).toBe(1);
    expect(r.st[4].status).toBe('wrong');
  });

  it('a skipped ayah', () => {
    const r = recite([
      'الم',
      'ذَلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ هُدًى لِلْمُتَّقِينَ',
      'الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ الصَّلَاةَ وَمِمَّا رَزَقْنَاهُمْ يُنْفِقُونَ',
      'أُولَئِكَ عَلَى هُدًى مِنْ رَبِّهِمْ',
      'وَأُولَئِكَ هُمُ الْمُفْلِحُونَ',
    ]);
    const ayah4 = at(2, 5) - at(2, 4);
    expect(r.red).toBe(ayah4);
    expect(r.t.position).toBe(at(2, 6));
  });
});
