import { blocksIntermediateProgression, questionBlocksResults } from './progression-gate';

/**
 * Next is "answered" (a selection plus a completed backend response, or an authoritative expiry; the component adds its own
 * local-timeout allowance). Results applies the SAME verdict rule to EVERY question, the last included, with no local-timeout
 * allowance: a backend-verified attempt (correct, incorrect or partial) or an authoritative expired verdict.
 */
describe('blocksIntermediateProgression (Next / keyboard)', () => {
  it('allows an incorrect-only answer (resolved, not correct) and a partial multiple-answer response, once selected', () => {
    expect(blocksIntermediateProgression('resolved', true, false)).toBe(false);
    expect(blocksIntermediateProgression('incomplete', true)).toBe(false);
  });

  it('allows a fully correct answer, and an authoritative expiry with or without a selection', () => {
    expect(blocksIntermediateProgression('resolved', true, true)).toBe(false);
    expect(blocksIntermediateProgression('resolved', false, true)).toBe(false); // an empty re-submission leaves it resolved-correct
    expect(blocksIntermediateProgression('expired', false)).toBe(false);
    expect(blocksIntermediateProgression('expired', true)).toBe(false);
  });

  it('blocks with nothing selected (never answered, or everything deselected)', () => {
    expect(blocksIntermediateProgression('idle', false)).toBe(true);
    expect(blocksIntermediateProgression(undefined, false)).toBe(true);
    expect(blocksIntermediateProgression('incomplete', false)).toBe(true); // deselect-all comes back incomplete + empty
    expect(blocksIntermediateProgression('resolved', false, false)).toBe(true);
  });

  it('blocks while the check is in flight or failed, even with a selection', () => {
    expect(blocksIntermediateProgression('checking', true)).toBe(true);
    expect(blocksIntermediateProgression('error', true)).toBe(true);
    expect(blocksIntermediateProgression('idle', true)).toBe(true);
  });
});

describe('questionBlocksResults (every question, the last included)', () => {
  it('a backend-verified attempt does not block: correct, incorrect or partial', () => {
    expect(questionBlocksResults('resolved', true, true)).toBe(false); // correct
    expect(questionBlocksResults('resolved', true, false)).toBe(false); // incorrect
    expect(questionBlocksResults('incomplete', true, null)).toBe(false); // partial
  });

  it('an authoritative expired verdict does not block', () => {
    expect(questionBlocksResults('expired', false, null)).toBe(false);
  });

  it('unanswered, in-flight, failed, deselected-to-empty and unconfirmed-timeout states block', () => {
    expect(questionBlocksResults('idle', false, null)).toBe(true); // unanswered (a local timeout leaves it idle until confirmed)
    expect(questionBlocksResults(undefined, false, undefined)).toBe(true);
    expect(questionBlocksResults('checking', true, null)).toBe(true);
    expect(questionBlocksResults('error', true, null)).toBe(true);
    expect(questionBlocksResults('incomplete', false, null)).toBe(true); // everything deselected
  });
});
