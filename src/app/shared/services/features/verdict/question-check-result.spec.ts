import { toQuestionCheckResult } from './question-check-result';
import { QuestionVerdictError } from './question-verdict.types';

/**
 * The `/check` boundary validator.
 *
 * Valid shapes mirror what BOTH backends send (Node `CheckOutcome`; Spring `Resolved/Expired/IncompleteCheckOutcome`), and
 * the invalid ones are the failures the service would otherwise have turned into a verdict: an unknown status was read as an
 * EXPIRY, and a `resolved` without a boolean `correct` as an INCORRECT answer.
 */

const INCOMPLETE = {
  status: 'incomplete',
  selectedVerdicts: [{ text: 'map', correct: true }],
  remainingCorrectCount: 1
};
const RESOLVED = {
  status: 'resolved',
  correct: false,
  correctOptionTexts: ['map', 'filter'],
  explanation: 'map and filter are operators.'
};
const EXPIRED = {
  status: 'expired',
  correctOptionTexts: ['A multicast observable'],
  explanation: 'Because a Subject multicasts.'
};

const refuses = (raw: unknown): void => {
  let thrown: unknown;
  try {
    toQuestionCheckResult(raw);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(QuestionVerdictError);
  expect((thrown as Error).message).toBe('Invalid submission');
};

describe('valid payloads (Node and Spring send the same shapes)', () => {
  it('accepts incomplete, resolved (right and wrong) and expired, unchanged', () => {
    expect(toQuestionCheckResult(INCOMPLETE)).toEqual(INCOMPLETE);
    expect(toQuestionCheckResult(RESOLVED)).toEqual(RESOLVED);
    expect(toQuestionCheckResult({ ...RESOLVED, correct: true })).toEqual({ ...RESOLVED, correct: true });
    expect(toQuestionCheckResult(EXPIRED)).toEqual(EXPIRED);
  });

  it('allows an EMPTY explanation and EMPTY arrays (nothing requires them to be non-empty)', () => {
    expect(toQuestionCheckResult({ ...RESOLVED, explanation: '', correctOptionTexts: [] })).toEqual({
      ...RESOLVED,
      explanation: '',
      correctOptionTexts: []
    });
    expect(toQuestionCheckResult({ ...EXPIRED, explanation: '', correctOptionTexts: [] })).toEqual({
      ...EXPIRED,
      explanation: '',
      correctOptionTexts: []
    });
    // single-select with nothing picked / a revisit: no verdicts, nothing remaining unknown
    expect(
      toQuestionCheckResult({ status: 'incomplete', selectedVerdicts: [], remainingCorrectCount: 0 })
    ).toEqual({ status: 'incomplete', selectedVerdicts: [], remainingCorrectCount: 0 });
  });

  it('preserves exact option text and ORDER: nothing is trimmed, normalized or re-sorted', () => {
    const texts = ['  Zed ', 'alpha', '<router-outlet>', 'Ünḯcode', ''];
    const out = toQuestionCheckResult({ ...RESOLVED, correctOptionTexts: texts });
    expect((out as unknown as { correctOptionTexts: string[] }).correctOptionTexts).toEqual(texts);

    const verdicts = [
      { text: ' b ', correct: false },
      { text: 'a', correct: true }
    ];
    const inc = toQuestionCheckResult({ ...INCOMPLETE, selectedVerdicts: verdicts });
    expect((inc as unknown as { selectedVerdicts: unknown[] }).selectedVerdicts).toEqual(verdicts);
  });

  it('IGNORES unknown fields: they neither reject the response nor reach the result (finalizationProof included)', () => {
    for (const body of [INCOMPLETE, RESOLVED, EXPIRED]) {
      const out = toQuestionCheckResult({ ...body, finalizationProof: 'signed.proof', somethingNew: { a: 1 } });
      expect(out).toEqual(body);
      expect(Object.keys(out)).not.toContain('finalizationProof');
      expect(Object.keys(out)).not.toContain('somethingNew');
    }
    // a verdict entry's unknown field is dropped too
    const out = toQuestionCheckResult({
      ...INCOMPLETE,
      selectedVerdicts: [{ text: 'map', correct: true, hint: 'x' }]
    });
    expect((out as unknown as { selectedVerdicts: unknown[] }).selectedVerdicts).toEqual([{ text: 'map', correct: true }]);
  });

  it('returns COPIES: mutating the result cannot touch the response body', () => {
    const body = { ...RESOLVED, correctOptionTexts: ['map', 'filter'] };
    const out = toQuestionCheckResult(body) as unknown as { correctOptionTexts: string[] };
    expect(out.correctOptionTexts).not.toBe(body.correctOptionTexts);
    out.correctOptionTexts.push('added');
    expect(body.correctOptionTexts).toEqual(['map', 'filter']);
  });
});

describe('malformed payloads are refused with the existing QuestionVerdictError', () => {
  it('rejects a non-object, an array, and a missing, non-string or UNKNOWN status', () => {
    for (const raw of [null, undefined, 'resolved', 7, true, [], [RESOLVED]]) refuses(raw);
    refuses({});
    refuses({ status: 3 });
    refuses({ status: null });
    refuses({ status: 'Resolved' }); // exact, case-sensitive
    refuses({ status: 'bogus', correctOptionTexts: ['x'], explanation: 'e' });
    refuses({ status: 'timeout', correctOptionTexts: ['x'], explanation: 'e' });
  });

  it('an unknown status is NEVER read as an expiry', () => {
    // The shape of a perfectly good expiry, under a status the client does not know.
    refuses({ ...EXPIRED, status: 'expiry' });
    refuses({ ...EXPIRED, status: 'EXPIRED' });
  });

  it('resolved: `correct` must be a real boolean (anything else would have scored as INCORRECT)', () => {
    for (const correct of [undefined, null, 'true', 'false', 1, 0, {}]) {
      refuses({ ...RESOLVED, correct });
    }
    const { correct: _omitted, ...withoutCorrect } = RESOLVED;
    void _omitted;
    refuses(withoutCorrect);
  });

  it('resolved and expired: correctOptionTexts must be an array of strings, explanation a string', () => {
    for (const body of [RESOLVED, EXPIRED]) {
      for (const correctOptionTexts of [undefined, null, 'map', {}, [1], ['map', null], [['map']]]) {
        refuses({ ...body, correctOptionTexts });
      }
      for (const explanation of [undefined, null, 1, ['why'], {}]) {
        refuses({ ...body, explanation });
      }
    }
  });

  it('incomplete: selectedVerdicts must be well-formed and remainingCorrectCount a non-negative integer', () => {
    for (const selectedVerdicts of [
      undefined,
      null,
      'map',
      {},
      [null],
      [{ text: 'map' }],
      [{ correct: true }],
      [{ text: 1, correct: true }],
      [{ text: 'map', correct: 'true' }]
    ]) {
      refuses({ ...INCOMPLETE, selectedVerdicts });
    }
    for (const remainingCorrectCount of [undefined, null, '1', -1, 1.5, NaN, Infinity]) {
      refuses({ ...INCOMPLETE, remainingCorrectCount });
    }
  });

  it("fields from another status do not satisfy this one's contract", () => {
    refuses({ status: 'resolved', selectedVerdicts: [], remainingCorrectCount: 0 });
    refuses({ status: 'incomplete', correctOptionTexts: ['map'], explanation: 'e', correct: true });
    refuses({ status: 'expired', correct: true });
  });
});
