// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PLANS, transcriptionCost, canUseAction, validateChapterRanges, planFromPrice, remainingTranscriptionCost, chapterSegments } from './plans';
describe('Membership rules', () => {
  it('Basic is $2 monthly', () => expect(PLANS.basic.price).toBe(2));
  it('Pro is $5 monthly', () => expect(PLANS.pro.price).toBe(5));
  it('Pro Max is $10 monthly', () => expect(PLANS.pro_max.price).toBe(10));
  it('Higher tiers have progressively more credits', () => { expect(PLANS.basic.credits).toBeLessThan(PLANS.pro.credits); expect(PLANS.pro.credits).toBeLessThan(PLANS.pro_max.credits); });
  it('Charges one credit for up to five minutes', () => { expect(transcriptionCost(61)).toBe(1); expect(transcriptionCost(300)).toBe(1); });
  it('Rounds partial five-minute blocks up', () => expect(transcriptionCost(301)).toBe(2));
  it('Charges twelve credits for an hour', () => expect(transcriptionCost(3600)).toBe(12));
  it('Rejects invalid durations', () => { for (const n of [0, -1, NaN, Infinity]) expect(() => transcriptionCost(n)).toThrow(); });
  it('Matches the estimate to individual segment reservations', () => { for (const seconds of [1, 61, 300, 301, 600, 3600]) expect(remainingTranscriptionCost(seconds, [])).toBe(transcriptionCost(seconds)); });
  it('Does not charge completed segments again on resume', () => expect(remainingTranscriptionCost(601, [{ title: 'Done', start: 0, end: 300, transcript: 'Done', paths: ['a'] }])).toBe(2));
  it('Keeps legacy one-minute clip timing', () => expect(chapterSegments({ title: 'Old', start: 0, end: 90, transcript: 'Story', paths: ['a', 'b'] }).map(s => [s.start, s.end])).toEqual([[0, 60], [60, 90]]));
  it('Keeps exact five-minute clip boundaries after merging', () => { const parts = [{ start: 0, end: 300, path: 'a', transcript: 'a' }, { start: 300, end: 361, path: 'b', transcript: 'b' }]; const chapters = validateChapterRanges([{ title: 'a', first: 0, last: 0 }, { title: 'b', first: 1, last: 1 }], parts); expect(chapterSegments(mergeChapters(chapters, 'Merged'))).toEqual(parts); });
  it('Limits static AI icons to Pro and animated AI icons to Pro Max', () => { expect(canUseAction('basic', 'icon')).toBe(false); expect(canUseAction('pro', 'icon')).toBe(true); expect(canUseAction('pro', 'animated')).toBe(false); expect(canUseAction('pro_max', 'animated')).toBe(true); });
  it('Unknown Stripe prices never grant paid access', () => expect(planFromPrice('unknown')).toBe('free'));
  it('Rejects chapter ranges that omit the audio tail', () => expect(() => validateChapterRanges([{ title: 'One', first: 0, last: 0 }], [{ start: 0, end: 60, path: 'a', transcript: 'a' }, { start: 60, end: 120, path: 'b', transcript: 'b' }])).toThrow());
  it('Preserves every segment in order', () => expect(validateChapterRanges([{ title: 'One', first: 0, last: 1 }], [{ start: 0, end: 60, path: 'a', transcript: 'a' }, { start: 60, end: 120, path: 'b', transcript: 'b' }])[0]?.paths).toEqual(['a', 'b']));
});
import { applyChapterPlan, mergeChapters, AI_COSTS } from './plans';
describe('applyChapterPlan', () => {
  const ch = (t: string, s: number) => ({ title: t, start: s, end: s + 60, transcript: t, paths: [`p${s}`] });
  const list = [ch('a', 0), ch('b', 60), ch('c', 120)];
  it('merges, reorders and renames', () => {
    const out = applyChapterPlan(list, [{ sources: [2], title: 'C' }, { sources: [0, 1], title: 'AB' }]);
    expect(out.map(c => c.title)).toEqual(['C', 'AB']);
    expect(out[1]!.paths).toEqual(['p0', 'p60']);
  });
  it('rejects reused or unknown sources', () => {
    expect(() => applyChapterPlan(list, [{ sources: [0, 0], title: 'x' }])).toThrow();
    expect(() => applyChapterPlan(list, [{ sources: [9], title: 'x' }])).toThrow();
  });
  it('rejects unrequested removals and allows explicit ones', () => {
    expect(() => applyChapterPlan(list, [{ sources: [0], title: 'a' }])).toThrow();
    expect(applyChapterPlan(list, [{ sources: [0], title: 'a' }], [1, 2])).toHaveLength(1);
  });
  it('rejects non-neighbour merges', () => expect(() => applyChapterPlan(list, [{ sources: [0, 2], title: 'x' }, { sources: [1], title: 'b' }])).toThrow());
  it('uses cheaper icon prices', () => { expect(AI_COSTS.icon).toBe(2); expect(AI_COSTS.animated).toBe(4); });
});
