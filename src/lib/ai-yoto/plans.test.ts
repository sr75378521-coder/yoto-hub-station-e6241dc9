// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PLANS, transcriptionCost, canUseAction, validateChapterRanges, planFromPrice } from './plans';
describe('Membership rules', () => {
  it('Basic is $2 monthly', () => expect(PLANS.basic.price).toBe(2));
  it('Pro is $5 monthly', () => expect(PLANS.pro.price).toBe(5));
  it('Pro Max is $10 monthly', () => expect(PLANS.pro_max.price).toBe(10));
  it('Higher tiers have progressively more credits', () => { expect(PLANS.basic.credits).toBeLessThan(PLANS.pro.credits); expect(PLANS.pro.credits).toBeLessThan(PLANS.pro_max.credits); });
  it('Charges all audio including partial minutes', () => expect(transcriptionCost(61)).toBe(2));
  it('Limits static AI icons to Pro and animated AI icons to Pro Max', () => { expect(canUseAction('basic', 'icon')).toBe(false); expect(canUseAction('pro', 'icon')).toBe(true); expect(canUseAction('pro', 'animated')).toBe(false); expect(canUseAction('pro_max', 'animated')).toBe(true); });
  it('Unknown Stripe prices never grant paid access', () => expect(planFromPrice('unknown')).toBe('free'));
  it('Rejects chapter ranges that omit the audio tail', () => expect(() => validateChapterRanges([{ title: 'One', first: 0, last: 0 }], [{ start: 0, end: 60, path: 'a', transcript: 'a' }, { start: 60, end: 120, path: 'b', transcript: 'b' }])).toThrow());
  it('Preserves every segment in order', () => expect(validateChapterRanges([{ title: 'One', first: 0, last: 1 }], [{ start: 0, end: 60, path: 'a', transcript: 'a' }, { start: 60, end: 120, path: 'b', transcript: 'b' }])[0]?.paths).toEqual(['a', 'b']));
});
import { applyChapterPlan, AI_COSTS } from './plans';
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
