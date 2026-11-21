import { align } from '../src/lib/matcher';
import { getSurah } from '../src/lib/quran';
import { RecitationTracker } from '../src/lib/recitation';

const fatiha = getSurah(1).words.map((w) => w.norm);
const ikhlas = getSurah(112).words.map((w) => w.norm);

describe('align', () => {
  it('marks a correct recitation', () => {
    const r = align(['بسم', 'الله', 'الرحمن', 'الرحيم'], fatiha);
    expect(r.consumed).toBe(4);
    expect(r.words.every((w) => w.status === 'correct')).toBe(true);
  });

  it('flags a wrong word and keeps going', () => {
    const r = align(['الحمد', 'لله', 'رب', 'العالمين', 'الرحمن', 'الرحيم', 'ملك', 'يوم', 'القيامه'], fatiha.slice(4));
    expect(r.consumed).toBe(9);
    expect(r.words[8]).toEqual({ status: 'wrong', heard: 'القيامه' });
  });

  it('flags a skipped word', () => {
    // skips "هو"
    const r = align(['قل', 'الله', 'احد', 'الله', 'الصمد'], ikhlas);
    expect(r.words.map((w) => w.status)).toEqual(['correct', 'skipped', 'correct', 'correct', 'correct', 'correct']);
  });

  it('tolerates a repeated word', () => {
    const r = align(['قل', 'هو', 'هو', 'الله', 'احد'], ikhlas);
    expect(r.words.map((w) => w.status)).toEqual(['correct', 'correct', 'correct', 'correct']);
    expect(r.extras).toHaveLength(1);
  });
});

describe('RecitationTracker', () => {
  it('follows slices and strips basmala before a surah', () => {
    const t = new RecitationTracker(ikhlas);
    t.update(0, 'أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم قل هو');
    t.update(0, 'أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم قل هو الله احد');
    t.update(1, 'الله الصمد لم يلد ولم يولد');
    expect(t.position).toBe(10);
    t.update(1, 'الله الصمد لم يلد ولم يولد ولم يكن له كفوا احد');
    t.finish();
    expect(t.done).toBe(true);
    expect(t.mistakes).toBe(0);
  });

  it('does not strip basmala from al-Fatiha', () => {
    const t = new RecitationTracker(fatiha);
    t.update(0, 'بسم الله الرحمن الرحيم الحمد لله');
    t.finish();
    expect(t.position).toBe(6);
    expect(t.mistakes).toBe(0);
  });

  it('holds back judging the word being spoken', () => {
    const t = new RecitationTracker(ikhlas);
    t.update(0, 'قل هو الل');
    const s = t.states();
    expect(s[0].status).toBe('correct');
    expect(s[2].status).not.toBe('wrong');
  });

  it('counts mistakes after finishing', () => {
    const t = new RecitationTracker(ikhlas);
    t.update(0, 'قل هو الله واحد الله الصمد');
    t.finish();
    expect(t.states()[3]).toEqual({ status: 'wrong', heard: 'واحد' });
  });

  it('starts from a chosen word', () => {
    const t = new RecitationTracker(fatiha, 4);
    t.update(0, 'الحمد لله رب العالمين');
    t.finish();
    expect(t.position).toBe(8);
    expect(t.states()[0].status).toBe('pending');
  });
});
