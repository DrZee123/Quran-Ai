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

import { getPage, pageOf, PAGE_COUNT } from '../src/lib/quran';

describe('mushaf pages', () => {
  it('maps known pages', () => {
    expect(getPage(1).sections[0].surah.id).toBe(1);
    expect(getPage(1).sections[0].ayahs).toHaveLength(7);
    const p2 = getPage(2);
    expect(p2.sections[0].surah.id).toBe(2);
    expect(p2.sections[0].ayahs.map((a) => a.number)).toEqual([1, 2, 3, 4, 5]);
    const last = getPage(PAGE_COUNT);
    expect(last.sections.map((s) => s.surah.id)).toEqual([112, 113, 114]);
    expect(last.sections.every((s) => s.starts)).toBe(true);
  });

  it('finds the page of an ayah', () => {
    expect(pageOf(1)).toBe(1);
    expect(pageOf(2, 6)).toBe(3);
    expect(pageOf(114)).toBe(604);
    expect(pageOf(18)).toBe(293);
  });

  it('a recitation can run across a page boundary', () => {
    const { getAllNormalized } = require('../src/lib/quran');
    const all: string[] = getAllNormalized();
    const p2 = getPage(2);
    const t = new RecitationTracker(all, p2.end - 3);
    t.update(0, all.slice(p2.end - 3, p2.end + 4).join(' '));
    t.finish();
    expect(t.position).toBe(p2.end + 4);
    expect(t.mistakes).toBe(0);
  });
});

describe('live display', () => {
  it('does not flash a wrong word before the reciter pauses', () => {
    const t = new RecitationTracker(ikhlas);
    t.update(0, 'قل هو الله واحد');
    expect(t.states()[3].status).toBe('pending');
    expect(t.position).toBe(3);
    t.endSlice();
    expect(t.states()[3]).toEqual({ status: 'wrong', heard: 'واحد' });
    expect(t.recentText()).toBe('قل هو الله احد');
  });
});
