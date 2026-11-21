import { normalizeArabic, tokenize, wordsMatch } from '../src/lib/arabic';

describe('normalizeArabic', () => {
  it('strips Uthmani marks and unifies letters', () => {
    expect(normalizeArabic('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ')).toBe('بسم الله الرحمن الرحيم');
    expect(normalizeArabic('إِيَّاكَ')).toBe('اياك');
    expect(normalizeArabic('عَلَىٰ')).toBe('علي');
    expect(normalizeArabic('رَيۡبَۛ')).toBe('ريب');
  });

  it('tokenize drops empty tokens', () => {
    expect(tokenize('  قُلۡ   هُوَ ۞ ')).toEqual(['قل', 'هو']);
  });
});

describe('wordsMatch', () => {
  it('accepts spelling differences between Uthmani and plain script', () => {
    expect(wordsMatch('العالمين', normalizeArabic('ٱلۡعَٰلَمِينَ'))).toBe(true);
    expect(wordsMatch('مالك', normalizeArabic('مَٰلِكِ'))).toBe(true);
    expect(wordsMatch('الصراط', normalizeArabic('ٱلصِّرَٰطَ'))).toBe(true);
    expect(wordsMatch('أولئك', normalizeArabic('أُوْلَـٰٓئِكَ'))).toBe(true);
  });

  it('rejects different words', () => {
    expect(wordsMatch('نعبد', 'نستعين')).toBe(false);
    expect(wordsMatch('من', 'ما')).toBe(false);
    expect(wordsMatch('الضالين', 'المغضوب')).toBe(false);
  });
});
