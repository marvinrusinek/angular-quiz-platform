import { QuestionType } from '@shared/models';
import { buildHeadingInputs } from './heading-inputs';
import { deriveHeadingHtml, shouldShowFet } from './heading-model';

/**
 * REVISITING A CORRECTLY ANSWERED QUESTION SHOWS ITS EXPLANATION AGAIN.
 *
 * Answer Q1 fully correctly → Next to Q2 → Previous to Q1: Q1 must show its formatted explanation again, without another
 * answer. Moving between questions purges the primary explanation stores, so the composed text is remembered (by quiz +
 * question text) while it exists, and the authoritative verdict decides whether it may be shown. Unanswered, wrong,
 * partial, timed-out and Interview (deferred) revisits keep showing the question text.
 */

const QUESTION_A = 'What is the primary job of change detection?';
const QUESTION_B = 'Which of these is a structural directive?';
const RIGHT = 'Keep the view in sync with the data model.';
const WRONG = 'Compile TypeScript into JavaScript.';
const OTHER_RIGHT = 'Update the DOM when state changes.';
const COMPOSED_A = 'Option 1 is correct because it keeps the view in sync.';
const RAW_A = 'it keeps the view in sync';
const COMPOSED_B = 'Option 2 is correct because *ngIf is structural.';
const DEFAULT_OPTIONS = ['alpha', 'beta', 'gamma', 'delta'];
const ORDER_1 = DEFAULT_OPTIONS.join('|');

interface Over {
  qText?: string;
  type?: QuestionType;
  selected?: string[];
  phase?: 'idle' | 'incomplete' | 'resolved' | 'expired';
  resolvedCorrect?: boolean | null;
  remaining?: number | null;
  verdicts?: [string, boolean][];
  raw?: string | null;
  revisit?: boolean;
  timedOut?: boolean;
  deferred?: boolean;
  /** The displayed option order (a reshuffled attempt shows the same options in a different order). */
  options?: string[];
}

function makeDeps(over: Over, ets: any) {
  const qText = over.qText ?? QUESTION_A;
  const question = { questionText: qText, type: over.type ?? QuestionType.SingleAnswer, options: (over.options ?? DEFAULT_OPTIONS).map((text) => ({ text })) };
  const selected = over.selected ?? [];
  const state = { hasInteracted: true, interactedThisVisit: false };
  return {
    state,
    deps: {
      idx: 0,
      quizService: {
        quizId: 'change-detection',
        getQuestionsInDisplayOrder: () => [question],
        questions: [question],
        isShuffleEnabled: () => false,
        shuffledQuestions: [],
        isMultiAnswerComplete: () => false
      },
      explanationTextService: ets,
      timerService: {
        expiredForQuestionIndexSig: () => (over.timedOut ? 0 : -1),
        expiredOnArrivalSig: () => -1
      },
      selectedOptionService: {
        selectedOptionsMap: new Map([[0, selected.map((text) => ({ text, selected: true }))]])
      },
      quizStateService: {
        hasUserInteracted: () => state.hasInteracted,
        wasInteractedThisVisit: () => state.interactedThisVisit
      },
      quizNavigationService: { isNavigatingToPreviousSig: () => over.revisit === true },
      quizQuestionManagerService: { getNumberOfCorrectAnswersText: () => '' },
      feedbackPolicyService: { feedbackMode: () => (over.deferred ? 'deferred' : 'immediate') },
      questionVerdictService: over.phase
        ? {
            verdictFor: () => ({
              phase: over.phase,
              selectedOptionTexts: selected,
              selectedVerdicts: new Map(over.verdicts ?? []),
              remainingCorrectCount: over.remaining ?? null,
              correctOptionTexts: [RIGHT],
              explanation: over.raw ?? null,
              isResolvedCorrect: over.resolvedCorrect ?? null
            }),
            states: () => new Map()
          }
        : undefined
    } as any
  };
}

const newStores = () => ({
  formattedExplanations: {} as Record<number, { explanation: string }>,
  fetByIndex: new Map<number, string>(),
  timeoutFetByIndex: new Map<number, string>(),
  answeredFetByQuestion: new Map<string, string>(),
  fetBypassForQuestion: new Map<number, boolean>()
});

const heading = (over: Over, ets: any): string => {
  const { deps } = makeDeps(over, ets);
  const inputs = buildHeadingInputs(deps);
  return deriveHeadingHtml({ ...inputs!, optionsReady: true });
};

const correctSingle: Over = {
  selected: [RIGHT],
  phase: 'resolved',
  resolvedCorrect: true,
  verdicts: [[RIGHT.toLowerCase(), true]],
  raw: RAW_A
};

describe('revisiting a correctly answered question', () => {
  it('single answer: correct → Next (stores purged) → Previous shows the SAME composed explanation', () => {
    const ets = newStores();
    // live view: the composed explanation exists and is shown
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    expect(heading({ ...correctSingle, revisit: false }, ets)).toBe(COMPOSED_A);

    // Next: moving between questions purges the primary stores
    ets.formattedExplanations = {};
    ets.fetByIndex.clear();

    // Previous: a revisit, no new interaction
    const revisit = heading({ ...correctSingle, revisit: true }, ets);
    expect(revisit).toBe(COMPOSED_A);
    expect(revisit).not.toBe(RAW_A); // the composed text, not the verdict's raw explanation
  });

  it('multiple answer: fully correct → Next → Previous shows the composed explanation', () => {
    const ets = newStores();
    const composed = 'Options 1 and 3 are correct because both keep the view in sync.';
    const multi: Over = {
      type: QuestionType.MultipleAnswer,
      selected: [RIGHT, OTHER_RIGHT],
      phase: 'incomplete',
      remaining: 0,
      verdicts: [
        [RIGHT.toLowerCase(), true],
        [OTHER_RIGHT.toLowerCase(), true]
      ],
      raw: RAW_A
    };
    ets.formattedExplanations[0] = { explanation: composed };
    expect(heading({ ...multi, revisit: false }, ets)).toBe(composed);
    ets.formattedExplanations = {};
    expect(heading({ ...multi, revisit: true }, ets)).toBe(composed);
  });

  it('rendering the stored explanation is not an interaction: it reads state and marks nothing', () => {
    const ets = newStores();
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    const { deps, state } = makeDeps({ ...correctSingle, revisit: true }, ets);
    state.interactedThisVisit = false;
    const inputs = buildHeadingInputs(deps)!;
    expect(shouldShowFet({ ...inputs, optionsReady: true })).toBe(true);
    expect(inputs.interactedThisVisit).toBe(false); // still not interacted on this visit
    expect(inputs.isNavigatingToPrevious).toBe(true); // still a revisit
    expect(deps.selectedOptionService.selectedOptionsMap.get(0)).toHaveLength(1); // selections untouched
  });

  it('another question never receives this question’s explanation', () => {
    const ets = newStores();
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    heading({ ...correctSingle, revisit: false }, ets); // remembers A by its question text
    ets.formattedExplanations = {};

    // question B is also correctly answered, revisited, with no composed text of its own: it shows ITS raw explanation
    const b: Over = { ...correctSingle, qText: QUESTION_B, raw: 'structural directives change the DOM' };
    const shown = heading({ ...b, revisit: true }, ets);
    expect(shown).not.toBe(COMPOSED_A);
    expect(shown).toBe('structural directives change the DOM.');

    // and once B has its own composed text, that is what it shows
    ets.formattedExplanations[0] = { explanation: COMPOSED_B };
    heading({ ...b, revisit: false }, ets);
    ets.formattedExplanations = {};
    expect(heading({ ...b, revisit: true }, ets)).toBe(COMPOSED_B);
    expect(heading({ ...correctSingle, revisit: true }, ets)).toBe(COMPOSED_A);
  });
});

describe('the remembered composed text is isolated between attempts', () => {
  it('is reused only for the SAME option order: a reshuffled attempt never gets another attempt\u2019s numbering', () => {
    const ets = newStores();
    // attempt 1: options in order alpha, beta, gamma, delta -> "Option 1 is correct because ..."
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    heading({ ...correctSingle, revisit: false }, ets);
    ets.formattedExplanations = {};

    // same order (a revisit within the attempt): the composed text is reused
    expect(heading({ ...correctSingle, revisit: true }, ets)).toBe(COMPOSED_A);

    // attempt 2, reshuffled (same quiz, same question text, different order): the old text must NOT be reused
    const reshuffled: Over = { ...correctSingle, options: ['delta', 'gamma', 'beta', 'alpha'], revisit: true };
    const shown = heading(reshuffled, ets);
    expect(shown).not.toBe(COMPOSED_A);
    expect(shown).toBe('it keeps the view in sync.'); // only the verdict's own explanation, never stale numbering
  });

  it('is not shared between quizzes', () => {
    const ets = newStores();
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    heading({ ...correctSingle, revisit: false }, ets);
    ets.formattedExplanations = {};
    const { deps } = makeDeps({ ...correctSingle, revisit: true }, ets);
    deps.quizService.quizId = 'another-quiz';
    const inputs = buildHeadingInputs(deps)!;
    expect(deriveHeadingHtml({ ...inputs, optionsReady: true })).toBe('it keeps the view in sync.');
  });
});

describe('revisiting a question whose verdict is EXPIRED (timeout → Next → Previous)', () => {
  const expiredBase: Over = { phase: 'expired', raw: RAW_A, revisit: true };

  it('unanswered single answer: the composed explanation returns without a new selection or expiry request', () => {
    const ets = newStores();
    // live: the timeout reveal composed the text
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    expect(heading({ ...expiredBase, revisit: false }, ets)).toBe(COMPOSED_A);

    // Next purges the primary stores
    ets.formattedExplanations = {};
    ets.fetByIndex.clear();

    expect(heading(expiredBase, ets)).toBe(COMPOSED_A);
  });

  it('partially answered multiple answer: its composed explanation returns', () => {
    const ets = newStores();
    const composed = 'Options 1 and 3 are correct because both keep the view in sync.';
    const partialExpired: Over = {
      ...expiredBase,
      type: QuestionType.MultipleAnswer,
      selected: [RIGHT],
      verdicts: [[RIGHT.toLowerCase(), true]],
      remaining: 1
    };
    ets.formattedExplanations[0] = { explanation: composed };
    expect(heading({ ...partialExpired, revisit: false }, ets)).toBe(composed);
    ets.formattedExplanations = {};
    expect(heading(partialExpired, ets)).toBe(composed);
  });

  it('the timeout store (index-keyed) supplies the text on the live view and is remembered by question, not index', () => {
    const ets = newStores();
    ets.timeoutFetByIndex.set(0, COMPOSED_A);
    expect(heading({ ...expiredBase, revisit: false }, ets)).toBe(COMPOSED_A); // live: remembered
    ets.timeoutFetByIndex.clear();
    expect(heading(expiredBase, ets)).toBe(COMPOSED_A); // revisit: from the by-question memory
  });

  it('a revisit never reads the index-keyed timeout store (the index may be another question after a restart)', () => {
    const ets = newStores();
    ets.timeoutFetByIndex.set(0, 'Option 3 is correct because of another attempt.');
    // nothing remembered for this question: only the verdict's own explanation, never the other attempt's text
    expect(heading(expiredBase, ets)).toBe('it keeps the view in sync.');
  });

  it('a stored "No explanation available" placeholder neither shadows nor replaces the remembered composed text', () => {
    const ets = newStores();
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    heading({ ...expiredBase, revisit: false }, ets); // remembered
    // arrival at the revisited question re-creates the placeholder in the primary stores
    ets.formattedExplanations = { 0: { explanation: 'No explanation available' } };
    ets.fetByIndex.set(0, 'No explanation available.');
    expect(heading(expiredBase, ets)).toBe(COMPOSED_A);

    // and a placeholder is never remembered itself
    const fresh = newStores();
    fresh.formattedExplanations[0] = { explanation: 'No explanation available' };
    heading({ ...expiredBase, revisit: false }, fresh);
    expect(fresh.answeredFetByQuestion.size).toBe(0);
  });

  it('a reshuffled order does not reuse the remembered numbering', () => {
    const ets = newStores();
    ets.formattedExplanations[0] = { explanation: COMPOSED_A };
    heading({ ...expiredBase, revisit: false }, ets);
    ets.formattedExplanations = {};
    expect(heading({ ...expiredBase, options: ['delta', 'gamma', 'beta', 'alpha'] }, ets)).toBe(
      'it keeps the view in sync.'
    );
  });

  it('Interview Mode (deferred feedback) still shows the question text', () => {
    const ets = newStores();
    ets.answeredFetByQuestion.set(`change-detection::${QUESTION_A}::${ORDER_1}`, COMPOSED_A);
    expect(heading({ ...expiredBase, deferred: true }, ets)).toBe(QUESTION_A);
  });
});

describe('revisits that must still show the question text', () => {
  const remembered = () => {
    const ets = newStores();
    ets.answeredFetByQuestion.set(`change-detection::${QUESTION_A}::${ORDER_1}`, COMPOSED_A);
    return ets;
  };

  it('unanswered', () => {
    expect(heading({ revisit: true }, remembered())).toBe(QUESTION_A);
  });

  it('answered incorrectly (single)', () => {
    const wrong: Over = {
      selected: [WRONG],
      phase: 'resolved',
      resolvedCorrect: false,
      verdicts: [[WRONG.toLowerCase(), false]],
      raw: RAW_A,
      revisit: true
    };
    expect(heading(wrong, remembered())).toBe(QUESTION_A);
  });

  it('partially answered (multiple)', () => {
    const partial: Over = {
      type: QuestionType.MultipleAnswer,
      selected: [RIGHT],
      phase: 'incomplete',
      remaining: 1,
      verdicts: [[RIGHT.toLowerCase(), true]],
      revisit: true
    };
    expect(heading(partial, remembered())).toBe(QUESTION_A);
  });

  it('an idle verdict (the local timer is not an authorization)', () => {
    expect(heading({ phase: 'idle', raw: RAW_A, revisit: true }, remembered())).toBe(QUESTION_A);
  });

  it('Interview Mode (deferred feedback) always shows the question text', () => {
    expect(heading({ ...correctSingle, revisit: true, deferred: true }, remembered())).toBe(QUESTION_A);
    expect(heading({ ...correctSingle, revisit: false, deferred: true }, remembered())).toBe(QUESTION_A);
  });
});
