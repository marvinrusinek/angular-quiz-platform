import { Router, type RequestHandler } from 'express';

import type { QuizRepository } from '../quiz/quiz.repository';
import {
  AnswerCheckError,
  canonicalize,
  checkAnswer,
  findQuestion,
  type CheckOutcome
} from '../quiz/answer-check';
import {
  AttemptReceiptError,
  issueAttemptReceipt,
  verifyAttemptReceipt,
  RECEIPT_VERSION
} from '../quiz/attempt-receipt';
import {
  FinalizationProofError,
  issueAttemptFinalization,
  issueFinalizationProof,
  verifyAttemptFinalization,
  verifyFinalizationProof,
  type ProofStatus
} from '../quiz/finalization-proof';
import {
  QUESTION_DURATION_SECONDS,
  QuestionReceiptError,
  issueQuestionReceipt,
  verifyQuestionReceipt
} from '../quiz/question-receipt';
import {
  toQuizMetadataListDto,
  toQuizResourcesDto,
  toTopicQuizQuestionsDto,
  type QuizMetadataDto
} from '../quiz/quiz.dto';
import { setResponsePolicy } from '../api/response-guard';
import { ApiError } from '../shared/errors';

export interface QuizzesListBody {
  readonly quizzes: readonly QuizMetadataDto[];
}

/**
 * Read-only quiz metadata, and Topic Quiz question delivery.
 *
 * `GET /quizzes/:quizId/questions` returns a whole quiz's questions WITHOUT any
 * correctness or explanations, and without identifiers of any kind. That is a
 * deliberate change from the earlier position that questions may only reach a
 * client through a generated session: Topic Quizzes are moving off the public
 * `assets/data/quiz.json`, and the whole point is that the browser can render
 * the questions while the answer key stays on the server.
 *
 * The answer key is released only per question, after an answer, by the check
 * endpoint — not here, and never in bulk.
 */
/**
 * Seconds a Topic Quiz attempt is allowed, per question.
 *
 * Mirrors the Angular `TimerService.timePerQuestion = 30`. The receipt's
 * deadline is a COARSE upper bound for the whole attempt (30s × question
 * count), not a mirror of the per-question UI timer: tracking that server-side
 * would need per-question state this design deliberately does not keep. It is
 * used for one purpose — deciding whether a reveal is authorized by expiry.
 */
export const SECONDS_PER_QUESTION = 30;

export interface QuizzesRouterDeps {
  readonly repository: QuizRepository;
  /** HMAC key for attempt receipts. Never logged, never serialized. */
  readonly receiptSecret: string;
  /** Injected clock, so expiry is testable without waiting. */
  readonly now?: (() => number) | undefined;
  /** Applied to the check route only. */
  readonly checkRateLimiter?: RequestHandler | undefined;
}

/** Does this check outcome establish a real attempt? (A resolved answer, an expiry, or a partial answer with a selection.) */
function proofStatusOf(outcome: CheckOutcome): ProofStatus | null {
  if (outcome.status === 'resolved' || outcome.status === 'expired') return outcome.status;
  return outcome.selectedVerdicts.length > 0 ? 'incomplete' : null;
}

export function createQuizzesRouter(deps: QuizRepository | QuizzesRouterDeps): Router {
  // Accepts a bare repository so existing call sites keep working unchanged.
  const options: QuizzesRouterDeps =
    'repository' in deps ? deps : { repository: deps, receiptSecret: '' };
  const repository = options.repository;
  const now = options.now ?? (() => Date.now());

  const router = Router();

  router.get('/quizzes', (_req, res) => {
    setResponsePolicy(res, 'PUBLIC_METADATA');
    // Repository order is source order, so the listing is deterministic.
    const body: QuizzesListBody = { quizzes: toQuizMetadataListDto(repository.getQuizMetadata()) };
    res.status(200).json(body);
  });

  router.get('/quizzes/:quizId', (req, res, next) => {
    setResponsePolicy(res, 'PUBLIC_METADATA');
    const quizId = req.params.quizId;
    const metadata = repository.getQuizMetadata().find((quiz) => quiz.quizId === quizId);

    if (!metadata) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    // METADATA ONLY — never `quiz.questions`.
    res.status(200).json(toQuizMetadataListDto([metadata])[0]);
  });

  /**
   * Topic Quiz questions — no correctness, no explanations, no identifiers.
   *
   * Served from the PostgreSQL-backed repository's in-memory bank. There is no
   * JSON fallback: the repository refuses to exist if PostgreSQL had no bank,
   * so reaching this handler already implies the database was authoritative.
   *
   * Retired quizzes are not loaded by the repository at all, so they 404 here
   * exactly like an unknown id — the client cannot distinguish the two, which
   * is intentional.
   */
  router.get('/quizzes/:quizId/questions', (req, res, next) => {
    setResponsePolicy(res, 'QUIZ_QUESTIONS');

    const quizId = req.params.quizId;
    const quiz = repository.getQuizById(quizId);

    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    res.status(200).json(toTopicQuizQuestionsDto(quiz));
  });

  /**
   * The Results-page "Brush up your knowledge" links for one quiz.
   *
   * PUBLIC_METADATA, the same policy the metadata routes use, and correctly so:
   * these are outbound links to third-party documentation. That policy bans
   * `questions`, `options`, `explanation` and every answer-key field, so the
   * response guard independently enforces what the DTO already refuses to emit.
   *
   * An unknown quiz 404s exactly like the questions route; a known quiz with no
   * links returns 200 with an empty array, because "this quiz has no links" is
   * an ordinary answer rather than a missing resource. Eleven of the twenty
   * quizzes are in that state, so it is the common case, not an edge one.
   *
   * Served from the repository's in-memory copy, loaded from PostgreSQL at
   * startup. No file is read here, and there is no `data/quiz.json` fallback.
   */
  router.get('/quizzes/:quizId/resources', (req, res, next) => {
    setResponsePolicy(res, 'PUBLIC_METADATA');

    const quizId = req.params.quizId;
    if (!repository.getQuizById(quizId)) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    res.status(200).json(toQuizResourcesDto(quizId, repository.getResourcesForQuiz(quizId)));
  });

  /**
   * Start an attempt. Issues the signed timing receipt.
   *
   * No database state: the receipt IS the attempt record, which is why there is
   * no `quiz_attempts` table. Per-attempt reveal accounting would need one, and
   * is deferred until abuse monitoring shows it is warranted.
   */
  router.post('/quizzes/:quizId/attempts', (req, res, next) => {
    setResponsePolicy(res, 'ATTEMPT_ISSUED');

    const quiz = repository.getQuizById(req.params.quizId);
    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    const startedAt = now();
    const durationSeconds = quiz.questions.length * SECONDS_PER_QUESTION;
    const expiresAt = startedAt + durationSeconds * 1000;

    res.status(201).json({
      quizId: quiz.quizId,
      durationSeconds,
      startedAt,
      expiresAt,
      attemptReceipt: issueAttemptReceipt(
        { v: RECEIPT_VERSION, quizId: quiz.quizId, startedAt, expiresAt },
        options.receiptSecret
      )
    });
  });

  /**
   * Start ONE question's timer. Issues the signed per-question receipt.
   *
   * The Topic Quiz timer is per-question, so the deadline that authorizes a
   * timeout reveal has to be per-question too. The attempt receipt's whole-quiz
   * deadline (30s × question count) is far in the future when question 3 of 10
   * expires at t=30s, and could never authorize that reveal.
   *
   * Requires a valid ATTEMPT receipt: a question timer only exists inside an
   * attempt at that same quiz. That is also what stops a receipt issued for
   * quiz A from starting timers in quiz B.
   *
   * Stateless by design — no `quiz_attempt_questions` table. The signed receipt
   * IS the record of when this question started, which keeps the rate-limited
   * check path free of database writes.
   */
  router.post('/quizzes/:quizId/questions/start', (req, res, next) => {
    setResponsePolicy(res, 'ATTEMPT_ISSUED');

    const quizId = req.params['quizId'];

    let attempt;
    try {
      attempt = verifyAttemptReceipt(req.header('X-Attempt-Receipt'), options.receiptSecret);
    } catch (err: unknown) {
      next(err instanceof AttemptReceiptError
        ? ApiError.unauthorized('Invalid attempt receipt')
        : err);
      return;
    }

    if (attempt.quizId !== quizId) {
      next(ApiError.unauthorized('Invalid attempt receipt'));
      return;
    }

    const quiz = repository.getQuizById(quizId);
    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    // The question must exist in THIS quiz. Resolved through the SAME
    // `findQuestion` the check route uses, so the two endpoints agree on
    // whitespace and case — a question that can be answered can be started.
    // Identity stays the public question text; no id or index enters here.
    const body = (req.body ?? {}) as Record<string, unknown>;

    let question;
    try {
      question = findQuestion(quiz, body['questionText']);
    } catch (err: unknown) {
      // Same error as a malformed body: whether a given string is a real
      // question in this quiz is not something a prober gets to learn.
      next(err instanceof AnswerCheckError ? ApiError.badRequest('Invalid submission') : err);
      return;
    }

    const startedAt = now();
    const expiresAt = startedAt + QUESTION_DURATION_SECONDS * 1000;

    res.status(201).json({
      quizId,
      questionText: question.questionText,
      durationSeconds: QUESTION_DURATION_SECONDS,
      startedAt,
      expiresAt,
      questionReceipt: issueQuestionReceipt(
        { v: RECEIPT_VERSION, quizId, questionText: question.questionText, startedAt, expiresAt },
        options.receiptSecret
      )
    });
  });

  /**
   * Check ONE question's answer and, when the question is terminal, reveal that
   * question's correct options and explanation.
   *
   * Everything that decides authorization comes from the SIGNED QUESTION
   * receipt: the quiz, the question it is bound to, and that question's own
   * deadline. A client cannot assert expiry, remaining time, or that a question
   * was submitted by timeout.
   *
   * Every rejection — missing receipt, tampered receipt, wrong quiz, wrong
   * question, unknown option, duplicate selection — produces the same shape, so
   * a prober cannot tell how close it got.
   */
  const checkHandlers: RequestHandler[] = [];
  if (options.checkRateLimiter) checkHandlers.push(options.checkRateLimiter);

  checkHandlers.push((req, res, next) => {
    setResponsePolicy(res, 'ANSWER_REVEAL');

    const quizId = req.params['quizId'];

    let payload;
    try {
      payload = verifyQuestionReceipt(req.header('X-Question-Receipt'), options.receiptSecret);
    } catch (err: unknown) {
      // 401: the caller is not authorized to check anything without a valid
      // receipt. The message never says why.
      next(err instanceof QuestionReceiptError
        ? ApiError.unauthorized('Invalid question receipt')
        : err);
      return;
    }

    // The receipt is bound to ONE quiz. A receipt for quiz A must not authorize
    // reveals in quiz B, which is what stops one attempt draining the bank.
    if (payload.quizId !== quizId) {
      next(ApiError.unauthorized('Invalid question receipt'));
      return;
    }

    const quiz = repository.getQuizById(quizId);
    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // The receipt is bound to ONE question. Without this, a receipt whose
    // deadline has passed would authorize the expiry reveal for EVERY question
    // in the quiz — one 30-second wait would drain the entire answer key.
    //
    // Compared canonically, matching how `findQuestion` resolves the body's
    // question: a client that may answer with different casing or spacing must
    // not be locked out by the receipt binding.
    const submitted = body['questionText'];
    if (typeof submitted !== 'string'
      || canonicalize(submitted) !== canonicalize(payload.questionText)) {
      next(ApiError.unauthorized('Invalid question receipt'));
      return;
    }

    let outcome: CheckOutcome;
    try {
      outcome = checkAnswer({
        quiz,
        questionText: body['questionText'],
        selectedOptionTexts: body['selectedOptionTexts'],
        // SERVER-DERIVED, and per-question. The signed deadline for THIS
        // question against the server clock.
        expired: now() >= payload.expiresAt
      });
    } catch (err: unknown) {
      next(err instanceof AnswerCheckError ? ApiError.badRequest('Invalid submission') : err);
      return;
    }

    // PROOF OF A VERIFIED ATTEMPT (the gate for the post-attempt review). Issued only when this response established a real
    // attempt: a resolved answer, an expiry, or a partial answer with something selected. A response that selected nothing
    // and has not expired establishes nothing, so it carries no proof. The proof says THAT the question was answered or
    // expired, never whether it was right.
    const proofStatus = proofStatusOf(outcome);
    if (proofStatus === null) {
      res.status(200).json(outcome);
      return;
    }
    res.status(200).json({
      ...outcome,
      finalizationProof: issueFinalizationProof(
        {
          v: RECEIPT_VERSION,
          kind: 'finalization-proof',
          quizId,
          questionText: payload.questionText,
          status: proofStatus,
          startedAt: payload.startedAt
        },
        options.receiptSecret
      )
    });
  });

  router.post('/quizzes/:quizId/check', ...checkHandlers);

  /**
   * FINALIZE an attempt (Show Results). Skipped questions are allowed.
   *
   * The explicit, server-side state change that makes the post-attempt review possible. It needs the attempt receipt AND a
   * proof from `/check` that this attempt has a verified answer (resolved, expired, or partial with a selection) whose
   * question started inside the attempt's window, so an attempt with nothing verified cannot be finalized. It issues a signed
   * ATTEMPT FINALIZATION bound to this quiz and this attempt. It reveals nothing itself.
   */
  const finalizeHandlers: RequestHandler[] = [];
  if (options.checkRateLimiter) finalizeHandlers.push(options.checkRateLimiter);

  finalizeHandlers.push((req, res, next) => {
    setResponsePolicy(res, 'ATTEMPT_ISSUED');

    const quizId = req.params['quizId'];

    let attempt;
    try {
      attempt = verifyAttemptReceipt(req.header('X-Attempt-Receipt'), options.receiptSecret);
    } catch (err: unknown) {
      next(err instanceof AttemptReceiptError ? ApiError.unauthorized('Invalid attempt receipt') : err);
      return;
    }

    let proof;
    try {
      proof = verifyFinalizationProof(req.header('X-Finalization-Proof'), options.receiptSecret);
    } catch (err: unknown) {
      next(err instanceof FinalizationProofError ? ApiError.unauthorized('Invalid finalization proof') : err);
      return;
    }

    // Both are bound to ONE quiz; neither may finalize an attempt at another.
    if (attempt.quizId !== quizId || proof.quizId !== quizId) {
      next(ApiError.unauthorized('Invalid finalization proof'));
      return;
    }

    // The proof's question must have started inside THIS attempt's window. A small grace covers the last question starting
    // just before the attempt expires.
    const graceMs = QUESTION_DURATION_SECONDS * 1000;
    if (proof.startedAt < attempt.startedAt || proof.startedAt > attempt.expiresAt + graceMs) {
      next(ApiError.unauthorized('Invalid finalization proof'));
      return;
    }

    const quiz = repository.getQuizById(quizId);
    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    // The proof's question must be a real question of THIS quiz (the same lookup the check route uses).
    try {
      findQuestion(quiz, proof.questionText);
    } catch (err: unknown) {
      next(err instanceof AnswerCheckError ? ApiError.unauthorized('Invalid finalization proof') : err);
      return;
    }

    res.status(201).json({
      quizId: quiz.quizId,
      finalizationReceipt: issueAttemptFinalization(
        {
          v: RECEIPT_VERSION,
          kind: 'attempt-finalization',
          quizId: quiz.quizId,
          attemptStartedAt: attempt.startedAt,
          finalizedAt: now()
        },
        options.receiptSecret
      )
    });
  });

  router.post('/quizzes/:quizId/attempts/finalize', ...finalizeHandlers);

  /**
   * Post-attempt REVIEW of every question, including the ones the player skipped.
   *
   * The only route that releases the answer key in bulk. It requires the attempt to be FINALIZED: a valid attempt receipt
   * (X-Attempt-Receipt) AND the server's attempt finalization for that same attempt (X-Attempt-Finalization, issued by
   * `POST /quizzes/:quizId/attempts/finalize`). A `/check` proof alone never authorizes it, and nothing about correctness,
   * expiry or completion is taken from the request body: there is none. The response carries no verdicts, so skipped
   * questions are never marked expired or credited. Rate limited like `/check`.
   *
   * Residual exposure, stated plainly: the server keeps no per-attempt state and the client may shuffle question order, so a
   * finalization can only require that the attempt has a server-verified answer, not that every question was reached.
   * Finalizing is an explicit, signed step, which is what separates "answered one question" from "reviewing the key".
   * Tightening it further needs per-attempt state and a server-known question order.
   */
  const reviewHandlers: RequestHandler[] = [];
  if (options.checkRateLimiter) reviewHandlers.push(options.checkRateLimiter);

  reviewHandlers.push((req, res, next) => {
    setResponsePolicy(res, 'TOPIC_QUIZ_REVIEW');

    const quizId = req.params['quizId'];

    let attempt;
    try {
      attempt = verifyAttemptReceipt(req.header('X-Attempt-Receipt'), options.receiptSecret);
    } catch (err: unknown) {
      next(err instanceof AttemptReceiptError ? ApiError.unauthorized('Invalid attempt receipt') : err);
      return;
    }

    let finalization;
    try {
      finalization = verifyAttemptFinalization(req.header('X-Attempt-Finalization'), options.receiptSecret);
    } catch (err: unknown) {
      next(err instanceof FinalizationProofError ? ApiError.unauthorized('Invalid attempt finalization') : err);
      return;
    }

    // Bound to ONE quiz and to THIS attempt: a finalization of another quiz or another attempt never authorizes this review.
    if (
      attempt.quizId !== quizId ||
      finalization.quizId !== quizId ||
      finalization.attemptStartedAt !== attempt.startedAt
    ) {
      next(ApiError.unauthorized('Invalid attempt finalization'));
      return;
    }

    const quiz = repository.getQuizById(quizId);
    if (!quiz) {
      next(ApiError.notFound('Quiz not found'));
      return;
    }

    res.status(200).json({
      quizId: quiz.quizId,
      questions: quiz.questions.map((question) => ({
        questionText: question.questionText,
        // Source order and the EXACT stored strings, as the per-question reveal returns them.
        correctOptionTexts: question.options.filter((option) => option.isCorrect).map((option) => option.text),
        explanation: question.explanation
      }))
    });
  });

  router.post('/quizzes/:quizId/review', ...reviewHandlers);

  return router;
}
