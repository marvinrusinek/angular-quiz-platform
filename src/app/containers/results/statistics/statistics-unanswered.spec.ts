import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { StatisticsComponent } from './statistics.component';
import { TopicQuizMetadataService } from '@shared/services/api/topic-quiz-metadata.service';
import { QuizService } from '@shared/services/data/quiz.service';
import { QuestionVerdictService } from '@shared/services/features/verdict/question-verdict.service';
import { TimerService } from '@shared/services/features/timer/timer.service';
import { API_BASE_URL } from '@shared/tokens/api-base-url.token';

/**
 * A quiz finished from its last question (typed URL or progress dot) leaves earlier questions untouched. Results must show them
 * as UNANSWERED, never as incorrect answers, and invent nothing for them (no answer, no expiry, no credit).
 */
const QUIZ_ID = 'router';
const TEXTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];

type Phase = 'idle' | 'resolved' | 'incomplete' | 'expired';
function build(correct: number, phases: Record<number, { phase: Phase; selected?: string[] }>, userAnswers: unknown[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StatisticsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: 'https://api.test/api' },
      {
        provide: QuizService,
        useValue: {
          quizId: QUIZ_ID,
          totalQuestions: () => 7,
          correctAnswersCountSig: signal(correct),
          getFinalResultSnapshot: () => null,
          patchFinalResultCompletionTime: () => undefined,
          setQuizStatus: () => undefined,
          getQuestionsInDisplayOrder: () => TEXTS.map((questionText) => ({ questionText })),
          questions: TEXTS.map((questionText) => ({ questionText })),
          userAnswers
        }
      },
      {
        provide: QuestionVerdictService,
        useValue: {
          states: () => new Map(),
          verdictFor: (_quiz: string, text: string) => {
            const i = TEXTS.indexOf(text);
            const p = phases[i] ?? { phase: 'idle' as Phase };
            return { phase: p.phase, selectedOptionTexts: p.selected ?? [], selectedVerdicts: new Map(), correctOptionTexts: [], explanation: null, isResolvedCorrect: null, remainingCorrectCount: null };
          }
        }
      },
      {
        provide: TimerService,
        useValue: {
          calculateTotalElapsedTime: () => 5,
          completionTime: 5,
          elapsedTimes: [],
          getDurableCompletionTime: () => 5,
          setDurableCompletionTime: () => undefined,
          isCountdown: () => false,
          timePerQuestion: 30
        }
      },
      { provide: TopicQuizMetadataService, useValue: { load: () => of([]), milestoneFor: (id: string) => id } }
    ]
  });
  const fixture = TestBed.createComponent(StatisticsComponent);
  fixture.componentRef.setInput('quizId', QUIZ_ID);
  fixture.componentRef.setInput('viewMode', 'score');
  fixture.detectChanges();
  TestBed.tick();
  TestBed.inject(HttpTestingController).match(() => true).forEach((r) => r.flush({ quizId: QUIZ_ID, resources: [] }));
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('Results: skipped questions are Unanswered, not Incorrect', () => {
  it('an incorrect last answer with six questions skipped: 1 Incorrect, 6 Unanswered', () => {
    const c = build(0, { 6: { phase: 'incomplete', selected: ['x'] } });
    expect(c.unansweredCount()).toBe(6);
    expect(c.incorrectCount()).toBe(1);
    expect(c.correctCount()).toBe(0);
  });

  it('a correct last answer with six skipped: 1 Correct, 0 Incorrect, 6 Unanswered', () => {
    const c = build(1, { 6: { phase: 'resolved', selected: ['x'] } });
    expect(c.unansweredCount()).toBe(6);
    expect(c.incorrectCount()).toBe(0);
  });

  it('attempted questions (partial, incorrect, expired, or a recorded answer) are not Unanswered', () => {
    const c = build(1, {
      0: { phase: 'resolved', selected: ['a'] },
      1: { phase: 'incomplete', selected: ['b'] },
      2: { phase: 'expired' }
    }, [undefined, undefined, undefined, [3]]);
    expect(c.unansweredCount()).toBe(3); // questions 5, 6 and 7
    expect(c.incorrectCount()).toBe(3);
  });

  it('a fully played quiz has no Unanswered and keeps Incorrect = total - correct', () => {
    const all = Object.fromEntries(TEXTS.map((_, i) => [i, { phase: 'resolved' as Phase, selected: ['a'] }]));
    const c = build(4, all);
    expect(c.unansweredCount()).toBe(0);
    expect(c.incorrectCount()).toBe(3);
  });

  it('a deselected-to-empty partial response is not an attempt', () => {
    const c = build(0, { 0: { phase: 'incomplete', selected: [] } });
    expect(c.unansweredCount()).toBe(7);
  });
});
