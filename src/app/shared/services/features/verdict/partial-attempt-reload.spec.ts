import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';

import { QuestionVerdictService } from './question-verdict.service';
import type { QuestionCheckResult } from './question-verdict.types';
import { TOPIC_QUIZ_VERDICT_ADAPTER } from './verdict-adapter';
import { blocksIntermediateProgression, questionBlocksResults } from './progression-gate';
import { allCorrectSelectedFromVerdict } from './authorized-correctness';

/**
 * A backend-verified PARTIAL attempt must survive a page reload, so it is not mistaken for an unanswered question. It keeps its
 * picks (and how each was judged), earns no credit and reveals nothing.
 */
const QUIZ = 'fixture-gadgets';
const Q = 'Select every low-power gadget mode';
const KNOWN = [Q];

const PARTIAL: QuestionCheckResult = {
  status: 'incomplete',
  selectedVerdicts: [{ text: 'sleep', correct: true }],
  remainingCorrectCount: 2
} as QuestionCheckResult;
const INCORRECT_ONLY: QuestionCheckResult = {
  status: 'incomplete',
  selectedVerdicts: [{ text: 'turbo', correct: false }],
  remainingCorrectCount: 3
} as QuestionCheckResult;
const EMPTY: QuestionCheckResult = { status: 'incomplete', selectedVerdicts: [], remainingCorrectCount: 3 } as QuestionCheckResult;

let responses: Subject<QuestionCheckResult>[];

function adapter(): Observable<QuestionCheckResult> {
  const s = new Subject<QuestionCheckResult>();
  responses.push(s);
  return s.asObservable();
}

/** A fresh service instance = a page reload (the in-memory store is gone; sessionStorage stays). */
function freshService(): QuestionVerdictService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: TOPIC_QUIZ_VERDICT_ADAPTER, useValue: { check: adapter, revealExpired: adapter } }]
  });
  return TestBed.inject(QuestionVerdictService);
}

function answer(service: QuestionVerdictService, texts: string[], result: QuestionCheckResult): void {
  service.checkAnswer(QUIZ, Q, texts).subscribe({ error: () => undefined });
  responses[responses.length - 1]!.next(result);
}

beforeEach(() => {
  sessionStorage.clear();
  responses = [];
});

describe('partial attempts across a reload', () => {
  it('a partial attempt is restored with its pick, its judgement and its outstanding count', () => {
    answer(freshService(), ['sleep'], PARTIAL);

    const reloaded = freshService();
    expect(reloaded.verdictFor(QUIZ, Q).phase).toBe('idle'); // nothing in memory yet
    expect(reloaded.rehydrateEarnedVerdicts(QUIZ, KNOWN)).toBe(1);

    const state = reloaded.verdictFor(QUIZ, Q);
    expect(state.phase).toBe('incomplete');
    expect(state.selectedOptionTexts).toEqual(['sleep']);
    expect(state.selectedVerdicts.get('sleep')).toBe(true);
    expect(state.remainingCorrectCount).toBe(2);
  });

  it('earns no credit and reveals nothing: not complete, no correct texts, no explanation, not resolved-correct', () => {
    answer(freshService(), ['sleep'], PARTIAL);
    const reloaded = freshService();
    reloaded.rehydrateEarnedVerdicts(QUIZ, KNOWN);
    const state = reloaded.verdictFor(QUIZ, Q);
    expect(allCorrectSelectedFromVerdict(state)).toBe(false);
    expect(state.isResolvedCorrect).toBeNull();
    expect(state.correctOptionTexts).toEqual([]);
    expect(state.explanation).toBeNull();
  });

  it('an incorrect-only partial attempt is restored as an attempt, still not correct', () => {
    answer(freshService(), ['turbo'], INCORRECT_ONLY);
    const reloaded = freshService();
    reloaded.rehydrateEarnedVerdicts(QUIZ, KNOWN);
    const state = reloaded.verdictFor(QUIZ, Q);
    expect(state.selectedVerdicts.get('turbo')).toBe(false);
    expect(allCorrectSelectedFromVerdict(state)).toBe(false);
  });

  it('the restored attempt is an answer for Next and for Results (the same rules as before the reload)', () => {
    answer(freshService(), ['sleep'], PARTIAL);
    const reloaded = freshService();
    reloaded.rehydrateEarnedVerdicts(QUIZ, KNOWN);
    const s = reloaded.verdictFor(QUIZ, Q);
    expect(blocksIntermediateProgression(s.phase, s.selectedOptionTexts.length > 0, s.isResolvedCorrect)).toBe(false);
    expect(questionBlocksResults(s.phase, s.selectedOptionTexts.length > 0, s.isResolvedCorrect)).toBe(false);
  });

  it('a partial attempt deselected back to nothing is not restored', () => {
    const first = freshService();
    answer(first, ['sleep'], PARTIAL);
    answer(first, [], EMPTY);
    const reloaded = freshService();
    expect(reloaded.rehydrateEarnedVerdicts(QUIZ, KNOWN)).toBe(0);
    expect(reloaded.verdictFor(QUIZ, Q).phase).toBe('idle');
  });

  it('a question the API no longer serves is not restored', () => {
    answer(freshService(), ['sleep'], PARTIAL);
    expect(freshService().rehydrateEarnedVerdicts(QUIZ, ['some other question'])).toBe(0);
  });
});
