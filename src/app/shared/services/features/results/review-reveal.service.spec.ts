import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest
} from '@angular/common/http/testing';

import { QuizQuestion, ScoreAnalysisItem } from '@shared/models';
import { API_BASE_URL } from '@shared/tokens/api-base-url.token';
import { QuestionVerdictService } from '@shared/services/features/verdict/question-verdict.service';
import { TOPIC_QUIZ_VERDICT_ADAPTER } from '@shared/services/features/verdict/verdict-adapter';
import { ApiTopicQuizVerdictAdapter } from '@shared/services/features/verdict/api-verdict.adapter';
import {
  ReviewRevealRateLimitedError,
  TopicQuizAttemptService
} from '@shared/services/features/verdict/topic-quiz-attempt.service';
import {
  REVIEW_REVEAL_CONCURRENCY,
  ReviewReveal,
  ReviewRevealService,
  mergeReviewReveals
} from './review-reveal.service';

/**
 * Review-only reveal (Option A').
 *
 * What these tests protect, in order of importance:
 *  1. No answer is requested before a question's own deadline, and none for a
 *     question that never held a receipt — a receipt is never created here.
 *  2. Nothing the verdict service owns is touched: no verdict write, no
 *     terminal event, so scoring, timers and navigation cannot react.
 *  3. Every response is tied to the question it was requested for.
 */
const BASE = 'https://api.test/api';
const QUIZ = 'topic';
const url = {
  attempts: `${BASE}/quizzes/${QUIZ}/attempts`,
  start: `${BASE}/quizzes/${QUIZ}/questions/start`,
  check: `${BASE}/quizzes/${QUIZ}/check`
};

let http: HttpTestingController;
let attempts: TopicQuizAttemptService;
let service: ReviewRevealService;

/** Issue (and settle) a real receipt for `text`, deadline = now + 30 s. */
function issueReceipt(text: string): void {
  attempts.startQuestion(QUIZ, text).subscribe();
  const a = http.match(url.attempts);
  if (a.length > 0) a[0].flush({ attemptReceipt: 'attempt-1' });
  http.expectOne(url.start).flush({
    questionReceipt: `receipt:${text}`,
    startedAt: 1,
    expiresAt: 30_001
  });
}

const item = (i: number, text: string, extra: Partial<ScoreAnalysisItem> = {}): ScoreAnalysisItem => ({
  questionIndex: i,
  questionText: text,
  wasCorrect: false,
  selectedOptionIds: [],
  correctOptionIds: [],
  ...extra
});

const checks = (): TestRequest[] => http.match((r) => r.url === url.check);
const expired = (correct: string[], explanation: string) => ({
  status: 'expired',
  correctOptionTexts: correct,
  explanation
});

beforeEach(() => {
  jest.useFakeTimers();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      { provide: TOPIC_QUIZ_VERDICT_ADAPTER, useExisting: ApiTopicQuizVerdictAdapter }
    ]
  });
  http = TestBed.inject(HttpTestingController);
  attempts = TestBed.inject(TopicQuizAttemptService);
  service = TestBed.inject(ReviewRevealService);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TopicQuizAttemptService — read-only receipt lookup', () => {
  it('reports no deadline for a question that never had a receipt', () => {
    expect(attempts.issuedDeadline(QUIZ, 'Q0')).toBeNull();
    http.expectNone(() => true);
  });

  it('reports the deadline of an issued receipt without any request', () => {
    issueReceipt('Q0');
    const deadline = attempts.issuedDeadline(QUIZ, 'Q0');
    expect(deadline).toBe(Date.now() + 30_000);
    expect(attempts.issuedDeadline(QUIZ, ' q0 ')).toBe(deadline); // canonical key
    expect(attempts.issuedDeadline('another-quiz', 'Q0')).toBeNull();
    http.expectNone(() => true);
  });

  it('never creates a receipt: no receipt means no request', () => {
    let error: unknown;
    attempts.revealIssued(QUIZ, 'Q0').subscribe({ error: (e) => (error = e) });
    expect(error).toBeDefined();
    http.expectNone(() => true);
    expect(attempts.hasStarted(QUIZ, 'Q0')).toBe(false);
  });

  it('never asks before the deadline', () => {
    issueReceipt('Q0');
    let error: unknown;
    attempts.revealIssued(QUIZ, 'Q0').subscribe({ error: (e) => (error = e) });
    expect(error).toBeDefined();
    http.expectNone(() => true);
  });

  it('after the deadline sends the issued receipt with an empty selection', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(30_001);
    let result: unknown;
    attempts.revealIssued(QUIZ, 'Q0').subscribe((r) => (result = r));
    const req = http.expectOne(url.check);
    expect(req.request.headers.get('X-Question-Receipt')).toBe('receipt:Q0');
    expect(req.request.body).toEqual({ questionText: 'Q0', selectedOptionTexts: [] });
    req.flush(expired(['A'], 'why'));
    expect(result).toEqual(expired(['A'], 'why'));
  });

  it('accepts only an expired answer (an incomplete one reveals nothing)', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(30_001);
    let error: unknown;
    attempts.revealIssued(QUIZ, 'Q0').subscribe({ error: (e) => (error = e) });
    http.expectOne(url.check).flush({
      status: 'incomplete',
      selectedVerdicts: [],
      remainingCorrectCount: 1
    });
    expect(error).toBeDefined();
  });

  it('turns an HTTP 429 into a rate-limit error carrying Retry-After', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(30_001);
    let error: unknown;
    attempts.revealIssued(QUIZ, 'Q0').subscribe({ error: (e) => (error = e) });
    http
      .expectOne(url.check)
      .flush({}, { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '3' } });
    expect(error).toBeInstanceOf(ReviewRevealRateLimitedError);
    expect((error as ReviewRevealRateLimitedError).retryAfterMs).toBe(3000);
  });
});

describe('ReviewRevealService.pending', () => {
  it('lists only unrevealed questions that hold a receipt, earliest deadline first', () => {
    issueReceipt('Q1');
    jest.advanceTimersByTime(5_000);
    issueReceipt('Q0');
    issueReceipt('Q3');
    const p = service.pending(QUIZ, [
      item(0, 'Q0'),
      item(1, 'Q1'),
      item(2, 'Q2'), // no receipt
      item(3, 'Q3', { explanation: 'already revealed' })
    ]);
    expect(p.map((x) => x.questionText)).toEqual(['Q1', 'Q0']);
  });
});

describe('ReviewRevealService.reveals', () => {
  it('existing receipt with an expired deadline: reveals at once', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe((r) => got.push(r));
    jest.advanceTimersByTime(0);
    checks()[0].flush(expired(['A'], 'why-0'));
    expect(got).toEqual([
      { questionText: 'Q0', correctOptionTexts: ['A'], explanation: 'why-0' }
    ]);
  });

  it('existing receipt with a future deadline: waits, never asks early', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(10_000); // 20 s left
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe((r) => got.push(r));

    jest.advanceTimersByTime(19_000);
    expect(checks()).toHaveLength(0);
    jest.advanceTimersByTime(1_100);
    const [req] = checks();
    expect(req).toBeDefined();
    req.flush(expired(['B'], 'why-0'));
    expect(got).toHaveLength(1);
  });

  it('a question without a receipt is never requested', () => {
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe((r) => got.push(r));
    jest.advanceTimersByTime(120_000);
    http.expectNone(() => true);
    expect(got).toEqual([]);
  });

  it('never has more than 2 requests in flight (concurrency cap)', () => {
    expect(REVIEW_REVEAL_CONCURRENCY).toBe(2);
    const texts = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];
    texts.forEach(issueReceipt);
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, texts.map((t, i) => item(i, t))).subscribe((r) => got.push(r));
    jest.advanceTimersByTime(0);

    const inFlight: TestRequest[] = [...checks()];
    expect(inFlight).toHaveLength(REVIEW_REVEAL_CONCURRENCY);
    let answered = 0;
    for (let round = 0; round < 10 && answered < texts.length; round++) {
      const req = inFlight.shift();
      if (!req) break;
      req.flush(expired(['A'], 'e'));
      answered++;
      jest.advanceTimersByTime(0);
      inFlight.push(...checks());
      expect(inFlight.length).toBeLessThanOrEqual(REVIEW_REVEAL_CONCURRENCY);
    }
    expect(answered).toBe(5);
    expect(got).toHaveLength(5);
  });

  it('ties each response to its own question, whatever the arrival order', () => {
    issueReceipt('Q0');
    issueReceipt('Q1');
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0'), item(1, 'Q1')]).subscribe((r) => got.push(r));
    jest.advanceTimersByTime(0);

    const reqs = checks();
    const q0 = reqs.find((r) => r.request.body.questionText === 'Q0')!;
    const q1 = reqs.find((r) => r.request.body.questionText === 'Q1')!;
    q1.flush(expired(['B1'], 'about-q1')); // answers out of order
    q0.flush(expired(['A0'], 'about-q0'));

    const byText = Object.fromEntries(got.map((g) => [g.questionText, g]));
    expect(byText['Q0']).toEqual({
      questionText: 'Q0', correctOptionTexts: ['A0'], explanation: 'about-q0'
    });
    expect(byText['Q1']).toEqual({
      questionText: 'Q1', correctOptionTexts: ['B1'], explanation: 'about-q1'
    });
  });

  it('a failed request yields nothing, throws nothing, and spares the others', () => {
    issueReceipt('Q0');
    issueReceipt('Q1');
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    let errored = false;
    service
      .reveals(QUIZ, [item(0, 'Q0'), item(1, 'Q1')])
      .subscribe({ next: (r) => got.push(r), error: () => (errored = true) });
    jest.advanceTimersByTime(0);

    const reqs = checks();
    reqs.find((r) => r.request.body.questionText === 'Q0')!
      .flush({}, { status: 500, statusText: 'boom' });
    reqs.find((r) => r.request.body.questionText === 'Q1')!
      .flush(expired(['B'], 'ok'));
    expect(errored).toBe(false);
    expect(got.map((g) => g.questionText)).toEqual(['Q1']);
  });

  it('HTTP 429: retries after Retry-After, then succeeds', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe((r) => got.push(r));
    jest.advanceTimersByTime(0);

    checks()[0].flush({}, { status: 429, statusText: 'x', headers: { 'Retry-After': '2' } });
    jest.advanceTimersByTime(1_900);
    expect(checks()).toHaveLength(0);
    jest.advanceTimersByTime(200);
    checks()[0].flush(expired(['A'], 'late'));
    expect(got).toEqual([
      { questionText: 'Q0', correctOptionTexts: ['A'], explanation: 'late' }
    ]);
  });

  it('HTTP 429 forever: gives up quietly after a bounded number of retries', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(31_000);
    const got: ReviewReveal[] = [];
    let errored = false;
    service
      .reveals(QUIZ, [item(0, 'Q0')])
      .subscribe({ next: (r) => got.push(r), error: () => (errored = true) });
    jest.advanceTimersByTime(0);

    let sent = 0;
    for (let i = 0; i < 6; i++) {
      const open = checks();
      sent += open.length;
      open.forEach((r) =>
        r.flush({}, { status: 429, statusText: 'x', headers: { 'Retry-After': '1' } })
      );
      jest.advanceTimersByTime(1_100);
    }
    expect(sent).toBe(4); // the first try + 3 retries
    expect(got).toEqual([]);
    expect(errored).toBe(false);
  });

  it('does not write a verdict or emit a terminal event', () => {
    const verdicts = TestBed.inject(QuestionVerdictService);
    const terminal = jest.fn();
    const changed = jest.fn();
    verdicts.terminalVerdicts$.subscribe(terminal);
    verdicts.verdictChanges$.subscribe(changed);

    issueReceipt('Q0');
    jest.advanceTimersByTime(31_000);
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe();
    jest.advanceTimersByTime(0);
    checks()[0].flush(expired(['A'], 'why'));

    expect(terminal).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(verdicts.verdictFor(QUIZ, 'Q0').phase).toBe('idle');
    expect(verdicts.hasBlockingVerdicts(QUIZ)).toBe(false);
  });
});

describe('mergeReviewReveals', () => {
  const q = (text: string, ...options: string[]): QuizQuestion =>
    ({
      questionText: text,
      options: options.map((t, i) => ({ optionId: i + 1, text: t }))
    }) as unknown as QuizQuestion;
  const reveal = (text: string, correct: string[], explanation: string): ReviewReveal => ({
    questionText: text,
    correctOptionTexts: correct,
    explanation
  });
  const map = (...r: ReviewReveal[]) =>
    new Map(r.map((x) => [x.questionText.toLowerCase(), x] as const));

  const questions = [q('Q0', 'A0', 'B0'), q('Q1', 'A1', 'B1')];

  it('returns the very same array when there is nothing to merge', () => {
    const analysis = [item(0, 'Q0')];
    expect(mergeReviewReveals(analysis, new Map(), questions)).toBe(analysis);
  });

  it('adds the reveal to the matching unrevealed item only', () => {
    const analysis = [item(0, 'Q0', { wasCorrect: false }), item(1, 'Q1')];
    const out = mergeReviewReveals(analysis, map(reveal('Q0', ['B0'], 'why-0')), questions);
    expect(out[0]).toMatchObject({
      correctOptionTexts: ['B0'],
      correctOptionIds: ['2'],
      explanation: 'why-0',
      wasCorrect: false // the score is never touched
    });
    expect(out[1]).toBe(analysis[1]);
  });

  it('never overwrites a reveal the item already carries', () => {
    const analysis = [item(0, 'Q0', { explanation: 'earned', correctOptionTexts: ['A0'] })];
    const out = mergeReviewReveals(analysis, map(reveal('Q0', ['B0'], 'other')), questions);
    expect(out[0]).toBe(analysis[0]);
  });

  it('ignores a reveal whose options are not this question\'s (no cross-question leak)', () => {
    const analysis = [item(0, 'Q0')];
    const out = mergeReviewReveals(
      analysis, map(reveal('Q0', ['B1'], 'about-q1')), questions
    );
    expect(out[0]).toBe(analysis[0]);
    expect(JSON.stringify(out)).not.toContain('about-q1');
  });

  it('uses the question text, so a shuffled display order cannot cross wires', () => {
    const shuffled = [questions[1], questions[0]]; // displayed Q1, Q0
    const analysis = [item(0, 'Q1'), item(1, 'Q0')];
    const out = mergeReviewReveals(
      analysis,
      map(reveal('Q0', ['A0'], 'for-q0'), reveal('Q1', ['B1'], 'for-q1')),
      shuffled
    );
    expect(out[0]).toMatchObject({ questionText: 'Q1', explanation: 'for-q1' });
    expect(out[1]).toMatchObject({ questionText: 'Q0', explanation: 'for-q0' });
  });
});

/**
 * POST-ATTEMPT REVIEW of skipped questions.
 *
 * A question the player never started has no receipt, so the per-question reveal cannot reach it. Once the attempt has a
 * server-verified answer, the server's `/review` releases every question's authorized answers; this service takes ONLY the
 * ones the review is missing, for display. It writes no verdict, expires nothing, and credits nothing.
 */
describe('ReviewRevealService — skipped questions via the post-attempt review', () => {
  const reviewUrl = `${BASE}/quizzes/${QUIZ}/review`;
  const reviewBody = (qs: { t: string; c: string[]; e: string }[]) => ({
    quizId: QUIZ,
    questions: qs.map((q) => ({ questionText: q.t, correctOptionTexts: q.c, explanation: q.e }))
  });
  const run = (analysis: ScoreAnalysisItem[]): ReviewReveal[] => {
    const out: ReviewReveal[] = [];
    service.reveals(QUIZ, analysis).subscribe((r) => out.push(r));
    return out;
  };
  const credentialsKey = `topicQuizReviewCredentials:v1:${QUIZ}`;
  /** The attempt is FINALIZED: a proof of a verified answer AND the server's finalization. */
  const giveProof = (): void =>
    sessionStorage.setItem(
      credentialsKey,
      JSON.stringify({ attemptReceipt: 'attempt-1', proof: 'proof-1', finalization: 'final-1' })
    );
  /** Only a verified answer so far: a /check proof, NOT yet finalized. */
  const giveProofOnly = (): void =>
    sessionStorage.setItem(credentialsKey, JSON.stringify({ attemptReceipt: 'attempt-1', proof: 'proof-1' }));

  beforeEach(() => sessionStorage.clear());

  it('asks the review once, with the attempt receipt and the FINALIZATION, and returns only the skipped questions', () => {
    giveProof();
    const out = run([item(0, 'Q0'), item(1, 'Q1'), item(2, 'Q2', { explanation: 'already earned' })]);
    const req = http.expectOne(reviewUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Attempt-Receipt')).toBe('attempt-1');
    expect(req.request.headers.get('X-Attempt-Finalization')).toBe('final-1');
    expect(req.request.headers.has('X-Finalization-Proof')).toBe(false); // a /check proof is never what authorizes the review
    req.flush(reviewBody([
      { t: 'Q0', c: ['A'], e: 'why 0' },
      { t: 'Q1', c: ['B', 'C'], e: 'why 1' },
      { t: 'Q2', c: ['D'], e: 'why 2' } // already covered: must not be returned
    ]));
    expect(out.map((r) => r.questionText)).toEqual(['Q0', 'Q1']);
    expect(out[1]).toEqual({ questionText: 'Q1', correctOptionTexts: ['B', 'C'], explanation: 'why 1' });
  });

  it('requests nothing without a proof (no attempt has been verified), and never creates a receipt', () => {
    expect(run([item(0, 'Q0')])).toEqual([]);
    http.expectNone(() => true);
    expect(attempts.hasStarted(QUIZ, 'Q0')).toBe(false);
  });

  it('requests nothing before the attempt is FINALIZED: a verified answer alone never asks for the review', () => {
    giveProofOnly();
    expect(attempts.hasFinalizationProof(QUIZ)).toBe(true);
    expect(attempts.canReview(QUIZ)).toBe(false);
    expect(run([item(0, 'Q0')])).toEqual([]);
    http.expectNone(() => true);
  });

  it('review() never finalizes by itself', () => {
    giveProofOnly();
    let error: unknown;
    attempts.review(QUIZ).subscribe({ error: (e) => (error = e) });
    expect(error).toBeDefined();
    http.expectNone(() => true);
  });

  it('Show Results finalizes through the server, then the review proceeds with the finalization it returned', () => {
    giveProofOnly();
    attempts.finalizeAttempt(QUIZ).subscribe();
    const fin = http.expectOne(`${BASE}/quizzes/${QUIZ}/attempts/finalize`);
    expect(fin.request.method).toBe('POST');
    expect(fin.request.headers.get('X-Attempt-Receipt')).toBe('attempt-1');
    expect(fin.request.headers.get('X-Finalization-Proof')).toBe('proof-1');

    // the review is wanted as soon as finalization is on the way, and WAITS for it
    expect(attempts.canReview(QUIZ)).toBe(true);
    const out = run([item(0, 'Q0')]);
    http.expectNone(reviewUrl);
    fin.flush({ quizId: QUIZ, finalizationReceipt: 'final-9' });

    const req = http.expectOne(reviewUrl);
    expect(req.request.headers.get('X-Attempt-Finalization')).toBe('final-9');
    req.flush(reviewBody([{ t: 'Q0', c: ['A'], e: 'why' }]));
    expect(out.map((r) => r.questionText)).toEqual(['Q0']);
    // stored, so a reload can still review
    expect(JSON.parse(sessionStorage.getItem(credentialsKey)!).finalization).toBe('final-9');
  });

  it('finalizing is idempotent, needs a proof, and a refusal leaves the review unavailable', () => {
    let error: unknown;
    attempts.finalizeAttempt(QUIZ).subscribe({ error: (e) => (error = e) }); // no proof on record
    expect(error).toBeDefined();
    http.expectNone(() => true);

    giveProofOnly();
    attempts.finalizeAttempt(QUIZ).subscribe();
    attempts.finalizeAttempt(QUIZ).subscribe();
    const reqs = http.match(`${BASE}/quizzes/${QUIZ}/attempts/finalize`);
    expect(reqs).toHaveLength(1); // one request for both calls
    reqs[0]!.flush({ error: { code: 'UNAUTHORIZED' } }, { status: 401, statusText: 'Unauthorized' });
    expect(attempts.canReview(QUIZ)).toBe(false);
    expect(run([item(0, 'Q0')])).toEqual([]);
  });

  it('also covers a question that was started but never answered (its per-question reveal would only arrive after its deadline)', () => {
    giveProof();
    issueReceipt('Q0'); // started, unanswered
    const out = run([item(0, 'Q0'), item(1, 'Q1')]);
    http.expectOne(reviewUrl).flush(reviewBody([
      { t: 'Q0', c: ['A'], e: 'why 0' },
      { t: 'Q1', c: ['B'], e: 'why 1' }
    ]));
    expect(out.map((r) => r.questionText).sort()).toEqual(['Q0', 'Q1']);
  });

  it('a refused or failed review yields nothing and never an error', () => {
    giveProof();
    let errored = false;
    const out: ReviewReveal[] = [];
    service.reveals(QUIZ, [item(0, 'Q0')]).subscribe({ next: (r) => out.push(r), error: () => (errored = true) });
    http.expectOne(reviewUrl).flush({ error: { code: 'UNAUTHORIZED' } }, { status: 401, statusText: 'Unauthorized' });
    expect(out).toEqual([]);
    expect(errored).toBe(false);
  });

  it('ignores a malformed review body', () => {
    giveProof();
    const out = run([item(0, 'Q0')]);
    http.expectOne(reviewUrl).flush({ questions: [{ questionText: 'Q0' }] });
    expect(out).toEqual([]);
  });

  it('what it returns is display data only: merged onto the analysis it leaves wasCorrect false and adds no selection', () => {
    giveProof();
    const analysis = [item(0, 'Q0')];
    const questions: QuizQuestion[] = [
      { questionText: 'Q0', options: [{ optionId: 1, text: 'A' }, { optionId: 2, text: 'B' }] } as QuizQuestion
    ];
    const out = run(analysis);
    http.expectOne(reviewUrl).flush(reviewBody([{ t: 'Q0', c: ['B'], e: 'why' }]));
    const merged = mergeReviewReveals(analysis, new Map(out.map((r) => [r.questionText.toLowerCase(), r])), questions);
    expect(merged[0]!.correctOptionTexts).toEqual(['B']);
    expect(merged[0]!.explanation).toBe('why');
    expect(merged[0]!.wasCorrect).toBe(false); // zero credit
    expect(merged[0]!.selectedOptionIds).toEqual([]); // still unanswered
  });
});

describe('finalization proof capture from /check', () => {
  const key = `topicQuizReviewCredentials:v1:${QUIZ}`;
  const adapter = (): ApiTopicQuizVerdictAdapter => TestBed.inject(ApiTopicQuizVerdictAdapter);

  beforeEach(() => sessionStorage.clear());

  it('stores the proof with the attempt receipt, and strips it from the result the app sees', () => {
    let result: Record<string, unknown> | undefined;
    adapter().check(QUIZ, 'Q0', ['A']).subscribe((r) => (result = r as unknown as Record<string, unknown>));
    http.expectOne(url.attempts).flush({ attemptReceipt: 'attempt-9' });
    http.expectOne(url.start).flush({ questionReceipt: 'rq', startedAt: 1, expiresAt: 30_001 });
    http.expectOne(url.check).flush({
      status: 'resolved', correct: false, correctOptionTexts: ['B'], explanation: 'why', finalizationProof: 'signed.proof'
    });
    expect(result).toEqual({ status: 'resolved', correct: false, correctOptionTexts: ['B'], explanation: 'why' });
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ attemptReceipt: 'attempt-9', proof: 'signed.proof' });
    expect(attempts.hasFinalizationProof(QUIZ)).toBe(true);
  });

  it('a response without a proof (nothing established) stores nothing', () => {
    adapter().check(QUIZ, 'Q0', []).subscribe();
    http.expectOne(url.attempts).flush({ attemptReceipt: 'attempt-9' });
    http.expectOne(url.start).flush({ questionReceipt: 'rq', startedAt: 1, expiresAt: 30_001 });
    http.expectOne(url.check).flush({ status: 'incomplete', selectedVerdicts: [], remainingCorrectCount: 1 });
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(attempts.hasFinalizationProof(QUIZ)).toBe(false);
  });

  it('an expiry reveal after the deadline also records the proof', () => {
    issueReceipt('Q0');
    jest.advanceTimersByTime(30_001);
    attempts.revealIssued(QUIZ, 'Q0').subscribe();
    http.expectOne(url.check).flush({ status: 'expired', correctOptionTexts: ['A'], explanation: 'why', finalizationProof: 'p-exp' });
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ attemptReceipt: 'attempt-1', proof: 'p-exp' });
  });

  it('leaving the attempt (restart or quiz switch) drops the proof, so a new attempt cannot review on the old one', () => {
    sessionStorage.setItem(key, JSON.stringify({ attemptReceipt: 'a', proof: 'p' }));
    attempts.startQuestion(QUIZ, 'Q0').subscribe(); // binds the service to this quiz
    http.match(() => true);
    attempts.clear();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('review() refuses to call out without a proof on record', () => {
    let error: unknown;
    attempts.review(QUIZ).subscribe({ error: (e) => (error = e) });
    expect(error).toBeDefined();
    http.expectNone(() => true);
  });
});
