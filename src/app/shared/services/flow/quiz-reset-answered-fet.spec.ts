import { QuizResetService } from './quiz-reset.service';

/**
 * A restart (a new attempt, possibly reshuffled) or a switch to another quiz discards the remembered composed
 * explanations of correctly answered questions, so one attempt can never hand the next attempt stale option numbering.
 */

/** A `this` whose every collaborator is a deep no-op mock, with the answered-explanation memory being a real Map. */
function fakeService(): { self: any; answered: Map<string, string> } {
  const answered = new Map<string, string>([['quiz::question::alpha|beta', 'Option 1 is correct because…']]);
  const noop: any = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? undefined : noop),
    apply: () => noop
  });
  const store: Record<string, unknown> = {
    explanationTextService: new Proxy({ answeredFetByQuestion: answered } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : noop)
    })
  };
  const self: any = new Proxy(store, { get: (t, k: string) => (k in t ? t[k] : noop) });
  return { self, answered };
}

describe('QuizResetService — remembered composed explanations', () => {
  it('a restart clears them', () => {
    const { self, answered } = fakeService();
    expect(answered.size).toBe(1);
    QuizResetService.prototype.performRestartServiceResets.call(self, 'quiz', 5);
    expect(answered.size).toBe(0);
  });

  it('switching to another quiz clears them', () => {
    const { self, answered } = fakeService();
    QuizResetService.prototype.resetForQuizSwitch.call(self, 'another-quiz');
    expect(answered.size).toBe(0);
  });
});
