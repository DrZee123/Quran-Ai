import { Segmenter, SAMPLE_RATE } from '../src/lib/segmenter';

function tone(sec: number, amp = 4000): Int16Array {
  const n = Math.round(sec * SAMPLE_RATE);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE));
  return a;
}
const silence = (sec: number) => new Int16Array(Math.round(sec * SAMPLE_RATE));

function feed(s: Segmenter, audio: Int16Array, chunk = 1600) {
  const events = [];
  for (let i = 0; i < audio.length; i += chunk) {
    const e = s.push(audio.subarray(i, Math.min(audio.length, i + chunk)));
    if (e.type === 'close') events.push(e);
  }
  return events;
}

describe('Segmenter', () => {
  it('drops leading silence', () => {
    const s = new Segmenter();
    feed(s, silence(5));
    expect(s.seconds).toBeLessThan(1.1);
    expect(s.hasSpeech).toBe(false);
  });

  it('closes a segment at a pause', () => {
    const s = new Segmenter();
    const ev = feed(s, Int16Array.from([...silence(0.5), ...tone(2), ...silence(0.7)]));
    expect(ev).toHaveLength(1);
    expect(ev[0].type === 'close' && ev[0].audio.length / SAMPLE_RATE).toBeGreaterThan(2);
  });

  it('cuts long speech at a quiet moment', () => {
    const s = new Segmenter();
    const speech = Int16Array.from([...tone(6), ...tone(0.15, 100), ...tone(3)]);
    const ev = feed(s, speech);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    const first = ev[0];
    if (first.type !== 'close') throw new Error();
    const cutSec = first.audio.length / SAMPLE_RATE;
    expect(cutSec).toBeGreaterThan(5.9);
    expect(cutSec).toBeLessThan(6.2);
  });

});
