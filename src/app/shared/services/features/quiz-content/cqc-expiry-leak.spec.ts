import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CqcOrchestratorService } from './cqc-orchestrator.service';
import { OptionItemTimerStateService } from '@shared/services/options/view/option-item-timer-state.service';
import { QuizService } from '@shared/services/data/quiz.service';
import { TimerService } from '@shared/services/features/timer/timer.service';
import { QuizDotStatusService } from '@shared/services/flow/quiz-dot-status.service';

/**
 * Q1 EXPIRES → Q2 → PREVIOUS TO Q1 → Q2 AGAIN: Q2's OPTIONS MUST STAY SELECTABLE.
 *
 * Returning to Q1 (deadline already passed) makes the timer announce an expiry that was ALREADY TRUE ON ARRIVAL for Q1.
 * The content host's own index can still read Q2 while that navigation settles, and its expiry handler recorded the
 * durable "timed out" mark against THAT index. Q2 never expired and was still inside its own deadline, yet the mark
 * locked its options as soon as the user came back to it.
 *
 * The timer state is driven directly (controlled timing, no real clock): live expiry, the Next to Q2, the Previous back
 * to Q1 with the host index lagging, then Next to Q2 again, and finally Q2's own genuine expiry.
 */

const timedOutFetForced = new Set<number>();
const quizState = { currentQuestionIndex: 0 };
const expiredForQuestionIndexSig = signal(-1);
const expiredOnArrivalSig = signal(-1);

function makeHost(hostIndex: number) {
  const timedOutIdxSig = signal(-1);
  const emitted: number[] = [];
  return {
    timedOutIdxSig,
    emitted,
    host: {
      questionIndex: () => hostIndex,
      currentIndex: hostIndex,
      quizService: {
        getCurrentQuestionIndex: () => hostIndex,
        isShuffleEnabled: () => false,
        shuffledQuestions: [],
        questions: [],
        questionCorrectness: new Map()
      },
      selectedOptionService: { clickConfirmedDotStatus: new Map() },
      timedOutIdxSig,
      timedOutIdxSubject: { next: (i: number) => emitted.push(i) },
      explanationTextService: { storeFormattedExplanation: jest.fn() },
      timerService: { expiredOnArrivalSig: () => expiredOnArrivalSig() },
      cdRef: { markForCheck: jest.fn() }
    } as any
  };
}

/** The timer expired$ event, as the content host handles it (the real private handler, with its real collaborators). */
function expiredEvent(hostIndex: number) {
  const { host, timedOutIdxSig, emitted } = makeHost(hostIndex);
  const self: any = { dotStatusService: { timedOutFetForced } };
  (CqcOrchestratorService.prototype as any).handleTimerExpiry.call(self, host);
  return { timedOutIdx: timedOutIdxSig(), emitted };
}

let timerState: OptionItemTimerStateService;

beforeEach(() => {
  timedOutFetForced.clear();
  quizState.currentQuestionIndex = 0;
  expiredForQuestionIndexSig.set(-1);
  expiredOnArrivalSig.set(-1);
  TestBed.configureTestingModule({
    providers: [
      { provide: QuizService, useValue: quizState },
      { provide: TimerService, useValue: { expiredForQuestionIndexSig, expiredOnArrivalSig } },
      { provide: QuizDotStatusService, useValue: { timedOutFetForced } },
      OptionItemTimerStateService
    ]
  });
  timerState = TestBed.inject(OptionItemTimerStateService);
});

describe('expiry attribution in the content host', () => {
  it('a LIVE expiry is recorded against the question being shown', () => {
    expiredForQuestionIndexSig.set(1); // Q2 expires while on screen; no arrival marker
    const r = expiredEvent(1);
    expect(r.timedOutIdx).toBe(1);
    expect([...timedOutFetForced]).toEqual([1]);
  });

  it('an arrival expiry is recorded against the question it names, not the lagging host index', () => {
    expiredOnArrivalSig.set(0); // returning to Q1, already over
    expiredForQuestionIndexSig.set(0);
    const r = expiredEvent(1); // the host still reads Q2
    expect(r.timedOutIdx).toBe(0);
    expect(r.emitted).toEqual([0]);
    expect([...timedOutFetForced]).toEqual([0]);
  });
});

describe('Q1 expiry → Q2 → Q1 → Q2', () => {
  it('keeps Q1 expired, leaves Q2 selectable inside its own deadline, and locks Q2 only when it genuinely expires', () => {
    // Q1 expires live
    quizState.currentQuestionIndex = 0;
    expiredForQuestionIndexSig.set(0);
    expiredEvent(0);
    expect(timerState.hasQuestionEverExpired(0)).toBe(true);

    // Next → Q2: a fresh question, its own deadline running
    quizState.currentQuestionIndex = 1;
    expiredForQuestionIndexSig.set(-1);
    expiredOnArrivalSig.set(-1);
    expect(timerState.hasQuestionEverExpired(1)).toBe(false);

    // Previous → Q1: expired on arrival, while the host index still reads Q2
    quizState.currentQuestionIndex = 0;
    expiredOnArrivalSig.set(0);
    expiredForQuestionIndexSig.set(0);
    expiredEvent(1);
    expect(timerState.hasQuestionEverExpired(0)).toBe(true); // Q1 stays expired
    expect(timedOutFetForced.has(1)).toBe(false); // Q2 was NOT marked

    // Next → Q2 again, still inside its own deadline: selectable
    quizState.currentQuestionIndex = 1;
    expiredForQuestionIndexSig.set(-1);
    expiredOnArrivalSig.set(-1);
    expect(timerState.hasQuestionEverExpired(1)).toBe(false);
    expect(timerState.hasQuestionEverExpired(0)).toBe(true);

    // Q2 genuinely expires: it locks normally
    expiredForQuestionIndexSig.set(1);
    expiredEvent(1);
    expect(timerState.hasQuestionEverExpired(1)).toBe(true);
  });

  it('a partially answered multiple-answer Q1 behaves the same', () => {
    // same state machine: an expiry carries no selection information, only the index it names
    quizState.currentQuestionIndex = 0;
    expiredForQuestionIndexSig.set(0);
    expiredEvent(0);
    quizState.currentQuestionIndex = 1;
    expiredForQuestionIndexSig.set(-1);
    expiredOnArrivalSig.set(-1);
    quizState.currentQuestionIndex = 0;
    expiredOnArrivalSig.set(0);
    expiredForQuestionIndexSig.set(0);
    expiredEvent(1);
    quizState.currentQuestionIndex = 1;
    expiredForQuestionIndexSig.set(-1);
    expiredOnArrivalSig.set(-1);
    expect(timerState.hasQuestionEverExpired(1)).toBe(false);
  });
});
