import { of } from 'rxjs';

import { QqcOrchLifecycleService } from './qqc-orch-lifecycle.service';
import { QqcOrchTimerService } from './qqc-orch-timer.service';

/**
 * EXPIRY → NEXT → PREVIOUS MUST NOT SEND A REVEAL FOR THE WRONG QUESTION.
 *
 * Returning (Previous) to a question whose deadline had already passed makes the timer announce an expiry that was
 * ALREADY TRUE ON ARRIVAL (`expiredOnArrivalSig`). While the navigation settles, the QQC host's own current index can
 * still be the question just left. The old guard compared the arrival marker with that lagging index, so the arrival
 * expiry slipped through and a reveal was requested for the question just left — which is still inside its deadline.
 * The server answered `incomplete`, the adapter correctly refused it ("only the server may declare expiry"), and that
 * question was left in the error state: "An earlier answer couldn't be verified, so Results is unavailable."
 *
 * Genuine failures are untouched (the verdict service and adapter are not changed): only the request that should never
 * have been sent is gone.
 */

const Q1 = 'What is Dependency Injection (DI) in Angular?';
const Q2 = 'Which of the following benefit from dependency injection?';

describe('timer expired$ handling (QqcOrchLifecycleService.onTimerExpired)', () => {
  const run = (arrivalSig: number, hostIndex: number) => {
    const onQuestionTimedOut = jest.fn();
    const host: any = {
      timerService: { expiredOnArrivalSig: () => arrivalSig },
      currentQuestionIndex: () => hostIndex,
      normalizeIndex: (i: number) => i,
      onQuestionTimedOut
    };
    QqcOrchLifecycleService.prototype.onTimerExpired.call({}, host);
    return onQuestionTimedOut;
  };

  it('a LIVE expiry (no arrival marker) reveals the question being shown', () => {
    const fn = run(-1, 1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('an expiry already true on arrival is not a fresh reveal', () => {
    expect(run(0, 0)).not.toHaveBeenCalled();
  });

  it('expiry → Next → Previous: the arrival expiry for Q1 never reveals Q2, even while the host index still reads Q2', () => {
    // timer: expired on arrival for Q1 (index 0); host still reports Q2 (index 1) while the navigation settles
    expect(run(0, 1)).not.toHaveBeenCalled();
  });

  it('a partially answered multiple-answer question behaves the same (arrival marker, lagging host index)', () => {
    expect(run(1, 2)).not.toHaveBeenCalled();
  });
});

describe('the timeout reveal targets the question that expired (QqcOrchTimerService)', () => {
  function revealFor(targetIndex: number | undefined) {
    const revealExpiredQuestion = jest.fn(() => of({ status: 'expired', correctOptionTexts: [], explanation: '' }));
    const self: any = {
      quizService: {
        quizId: 'dependency-injection',
        getQuestionsInDisplayOrder: () => [{ questionText: Q1 }, { questionText: Q2 }]
      },
      verdicts: { revealExpiredQuestion },
      expiredQuestionText: (QqcOrchTimerService.prototype as any).expiredQuestionText
    };
    // the host is currently showing Q2 (index 1) while the expiry belongs to the explicit target
    const host: any = {
      currentQuestion: () => ({ questionText: Q2 }),
      currentQuestionIndex: () => 1
    };
    (QqcOrchTimerService.prototype as any).revealExpired.call(self, host, targetIndex).subscribe();
    return revealExpiredQuestion;
  }

  it('an explicit target index names the question, not whatever the host is showing', () => {
    const fn = revealFor(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('dependency-injection', Q1);
  });

  it('without a target it still uses the question on screen', () => {
    const fn = revealFor(undefined);
    expect(fn).toHaveBeenCalledWith('dependency-injection', Q2);
  });
});
