import {
  clearEarnedVerdicts,
  readPayload,
  saveEarnedVerdict,
  toEarnedEntry
} from './earned-verdict-storage';
import { IDLE_VERDICT_STATE, type QuestionVerdictState } from './question-verdict.types';

/**
 * WHAT MAY SURVIVE A RELOAD, AND WHAT MAY NOT.
 *
 * A page reload used to empty the in-memory verdict store, after which the UI
 * repainted an already-answered question from the bundled answer key. That was
 * the last correctness dependency on the asset, so the fix is to persist what
 * the user has EARNED — and nothing else.
 *
 * The security property these pin is narrow and checkable: reading this storage
 * tells you exactly what the player already saw, for the questions they already
 * answered. No key, no future questions, no unanswered correctness.
 */

const QUIZ = 'typescript';
const Q = 'Which of the following does TypeScript use to specify types?';

function state(over: Partial<QuestionVerdictState> = {}): QuestionVerdictState {
  return { ...IDLE_VERDICT_STATE, ...over } as QuestionVerdictState;
}

const resolvedCorrect = () =>
  state({
    phase: 'resolved',
    isResolvedCorrect: true,
    selectedVerdicts: new Map([[':', true]]),
    correctOptionTexts: [':'],
    explanation: 'TS uses a colon.'
  });

const resolvedWrong = () =>
  state({
    phase: 'resolved',
    isResolvedCorrect: false,
    selectedVerdicts: new Map([[';', false]]),
    correctOptionTexts: [':'],
    explanation: 'TS uses a colon.'
  });

beforeEach(() => sessionStorage.clear());

describe('only earned state is persisted', () => {
  it('a RESOLVED question is stored with the judgement of the user own picks', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());

    const [entry] = readPayload(QUIZ);
    expect(entry.questionText).toBe(Q);
    expect(entry.phase).toBe('resolved');
    expect(entry.selectedVerdicts).toEqual([[':', true]]);
    expect(entry.isResolvedCorrect).toBe(true);
  });

  it.each([['idle'], ['checking'], ['incomplete'], ['error']] as const)(
    'a %s question earns nothing and is not stored',
    (phase) => {
      saveEarnedVerdict(QUIZ, Q, state({ phase, selectedVerdicts: new Map([[':', true]]) }));
      expect(readPayload(QUIZ)).toEqual([]);
    }
  );

  it('an UNANSWERED question contributes no correctness whatsoever', () => {
    // Nothing was ever checked, so nothing is written — the storage cannot be
    // mined for questions the player has not reached.
    saveEarnedVerdict(QUIZ, 'A question never answered', state());
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('the reveal is stored ONLY when the server actually revealed it', () => {
    // An expired question that was never revealed: no correct texts, no
    // explanation. Absence here is the whole point.
    saveEarnedVerdict(
      QUIZ,
      Q,
      state({ phase: 'expired', correctOptionTexts: [], explanation: null })
    );

    const [entry] = readPayload(QUIZ);
    expect(entry.phase).toBe('expired');
    expect(entry.correctOptionTexts).toBeUndefined();
    expect(entry.explanation).toBeUndefined();
  });

  it('does not persist remainingCorrectCount or selectedOptionTexts', () => {
    // Neither is needed to restore: the first is meaningful only for the
    // `incomplete` phase, which is never stored, and the second is recoverable
    // from the verdict keys. Storing less is the point.
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());

    const [entry] = readPayload(QUIZ) as unknown as Record<string, unknown>[];
    expect(entry['remainingCorrectCount']).toBeUndefined();
    expect(entry['selectedOptionTexts']).toBeUndefined();
  });
});

describe('restore round-trips the facts the user already saw', () => {
  it('a correct pick round-trips as correct', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());
    const [entry] = readPayload(QUIZ);
    expect(new Map(entry.selectedVerdicts as [string, boolean][]).get(':')).toBe(true);
  });

  it('a wrong pick round-trips as wrong', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedWrong());
    const [entry] = readPayload(QUIZ);
    expect(new Map(entry.selectedVerdicts as [string, boolean][]).get(';')).toBe(false);
    expect(entry.isResolvedCorrect).toBe(false);
  });

  it('re-saving the same question replaces rather than duplicates it', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedWrong());
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());

    const entries = readPayload(QUIZ);
    expect(entries).toHaveLength(1);
    expect(entries[0].isResolvedCorrect).toBe(true);
  });
});

describe('fail closed', () => {
  it('discards malformed JSON', () => {
    sessionStorage.setItem('earnedVerdicts:v1:' + QUIZ, '{not json');
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('discards a payload written under a different schema version', () => {
    sessionStorage.setItem(
      'earnedVerdicts:v1:' + QUIZ,
      JSON.stringify({
        v: 99,
        quizId: QUIZ,
        entries: [
          { questionText: Q, phase: 'resolved', selectedVerdicts: [], isResolvedCorrect: true }
        ]
      })
    );
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('refuses a payload whose quizId does not match the key it was read under', () => {
    // Tampering with the key cannot make another quiz's verdicts apply here.
    sessionStorage.setItem(
      'earnedVerdicts:v1:' + QUIZ,
      JSON.stringify({
        v: 1,
        quizId: 'some-other-quiz',
        entries: [
          { questionText: Q, phase: 'resolved', selectedVerdicts: [], isResolvedCorrect: true }
        ]
      })
    );
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('another quiz cannot consume this quiz state', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());
    expect(readPayload('forms')).toEqual([]);
  });

  it('drops individual entries with the wrong shape, keeping valid ones', () => {
    sessionStorage.setItem(
      'earnedVerdicts:v1:' + QUIZ,
      JSON.stringify({
        v: 1,
        quizId: QUIZ,
        entries: [
          {
            questionText: Q,
            phase: 'resolved',
            selectedVerdicts: [[':', true]],
            isResolvedCorrect: true
          },
          {
            questionText: 'bad',
            phase: 'resolved',
            selectedVerdicts: 'not-an-array',
            isResolvedCorrect: true
          },
          {
            questionText: 'also bad',
            phase: 'checking',
            selectedVerdicts: [],
            isResolvedCorrect: null
          },
          { phase: 'resolved', selectedVerdicts: [], isResolvedCorrect: null }
        ]
      })
    );

    const entries = readPayload(QUIZ);
    expect(entries).toHaveLength(1);
    expect(entries[0].questionText).toBe(Q);
  });

  it('a non-terminal phase in a hand-written payload is rejected', () => {
    sessionStorage.setItem(
      'earnedVerdicts:v1:' + QUIZ,
      JSON.stringify({
        v: 1,
        quizId: QUIZ,
        entries: [
          { questionText: Q, phase: 'incomplete', selectedVerdicts: [], isResolvedCorrect: null }
        ]
      })
    );
    expect(readPayload(QUIZ)).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('clearing forgets this quiz earned verdicts', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());
    expect(readPayload(QUIZ)).toHaveLength(1);

    clearEarnedVerdicts(QUIZ);
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('clearing one quiz leaves another quiz untouched', () => {
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());
    saveEarnedVerdict('forms', 'A forms question', resolvedCorrect());

    clearEarnedVerdicts(QUIZ);
    expect(readPayload(QUIZ)).toEqual([]);
    expect(readPayload('forms')).toHaveLength(1);
  });

  it('toEarnedEntry refuses a non-terminal state outright', () => {
    expect(toEarnedEntry(Q, state({ phase: 'checking' }))).toBeNull();
    expect(toEarnedEntry('', resolvedCorrect())).toBeNull();
  });
});

describe('a backend-verified PARTIAL attempt survives a reload', () => {
  const partial = (over: Partial<QuestionVerdictState> = {}) =>
    state({
      phase: 'incomplete',
      selectedOptionTexts: ['a'],
      selectedVerdicts: new Map([['a', true]]),
      remainingCorrectCount: 2,
      ...over
    });

  beforeEach(() => sessionStorage.clear());

  it('stores the picks, how they were judged and the outstanding count, and nothing else', () => {
    saveEarnedVerdict(QUIZ, Q, partial());
    const [entry] = readPayload(QUIZ);
    expect(entry.phase).toBe('incomplete');
    expect(entry.selectedVerdicts).toEqual([['a', true]]);
    expect(entry.remainingCorrectCount).toBe(2);
    expect(entry.isResolvedCorrect).toBeNull();
    expect(entry.correctOptionTexts).toBeUndefined(); // no reveal
    expect(entry.explanation).toBeUndefined();
  });

  it('an incorrect-only partial response is stored as an attempt (nothing is credited)', () => {
    saveEarnedVerdict(QUIZ, Q, partial({ selectedVerdicts: new Map([['x', false]]), remainingCorrectCount: 3 }));
    expect(readPayload(QUIZ)[0].selectedVerdicts).toEqual([['x', false]]);
  });

  it('a partial response with nothing selected is no attempt, and clears a stored one', () => {
    saveEarnedVerdict(QUIZ, Q, partial());
    expect(readPayload(QUIZ)).toHaveLength(1);
    saveEarnedVerdict(QUIZ, Q, partial({ selectedOptionTexts: [], selectedVerdicts: new Map() }));
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('a partial response with no outstanding count is not stored', () => {
    saveEarnedVerdict(QUIZ, Q, partial({ remainingCorrectCount: null }));
    saveEarnedVerdict(QUIZ, Q, partial({ remainingCorrectCount: 0 }));
    expect(readPayload(QUIZ)).toEqual([]);
  });

  it('later answers replace the stored partial attempt (partial then fully correct)', () => {
    saveEarnedVerdict(QUIZ, Q, partial());
    saveEarnedVerdict(QUIZ, Q, resolvedCorrect());
    const entries = readPayload(QUIZ);
    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe('resolved');
  });

  it('a hand-written partial entry without picks or a positive count is rejected', () => {
    sessionStorage.setItem(
      'earnedVerdicts:v1:' + QUIZ,
      JSON.stringify({
        v: 1,
        quizId: QUIZ,
        entries: [
          { questionText: Q, phase: 'incomplete', selectedVerdicts: [['a', true]], isResolvedCorrect: null },
          { questionText: Q + '2', phase: 'incomplete', selectedVerdicts: [['a', true]], isResolvedCorrect: null, remainingCorrectCount: 0 },
          { questionText: Q + '3', phase: 'resolved', selectedVerdicts: [['a', true]], isResolvedCorrect: true, remainingCorrectCount: 1 }
        ]
      })
    );
    expect(readPayload(QUIZ)).toEqual([]);
  });
});
