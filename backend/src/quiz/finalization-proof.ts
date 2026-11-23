import { RECEIPT_VERSION, decodeSignedReceipt, encodeSignedReceipt } from './receipt-codec';

/**
 * TWO distinct signed records live here, on purpose:
 *
 *  - the PROOF OF A VERIFIED ATTEMPT (`/check` issues it with a resolved answer, an expiry, or a partial answer with a
 *    selection): evidence that the attempt has at least one verified answer. It authorizes NOTHING in bulk.
 *  - the ATTEMPT FINALIZATION (`POST /quizzes/:quizId/attempts/finalize` issues it, only against a proof): the explicit,
 *    server-recorded state "this attempt is finalized". Only this authorizes `POST /quizzes/:quizId/review`.
 *
 * A normal `/check` proof alone therefore can never release the whole answer key: finalizing is a separate, deliberate step
 * (Show Results), skipped questions allowed.
 */

/**
 * Signed PROOF OF A VERIFIED ATTEMPT, the gate for the post-attempt review.
 *
 * ── What it is for ─────────────────────────────────────────────────
 *
 * After a Topic Quiz attempt is FINALIZED the player may review the correct answers and explanations of EVERY question,
 * including the ones they skipped. Before that, the answer key leaves the server only one question at a time, in response
 * to an answer or an expiry. `POST /quizzes/:quizId/review` is the one place that releases the key in bulk, so it needs a
 * server-verifiable reason to do so.
 *
 * The server keeps NO per-attempt state (see the attempt receipt), so that reason is a signed record the server itself
 * issued: every `/check` response that establishes a real attempt (a resolved answer, an expiry, or a partial answer with
 * something selected) carries a proof naming the quiz and the question. A client that never answered or expired a question
 * has no proof and therefore no review.
 *
 * ── What it deliberately does not claim ────────────────────────────
 *
 * Question order can be shuffled in the client and the server tracks no order, so the proof establishes "this attempt has a
 * verified answer", not "this was the last question". It is bound to the quiz, to one question and to when that question was
 * started, and the review additionally requires the attempt receipt and that the question started inside that attempt's
 * window. The residual exposure is documented in the review route.
 *
 * What must NEVER appear here: correctness, correct option texts, explanations, selections, database ids or indexes. The
 * status says only that the response was terminal or partial, not whether it was right.
 */

export type ProofStatus = 'resolved' | 'incomplete' | 'expired';

export interface FinalizationProofPayload {
  readonly v: number;
  readonly kind: 'finalization-proof';
  readonly quizId: string;
  /** Public identity: the exact question text, never an id or an index. */
  readonly questionText: string;
  readonly status: ProofStatus;
  /** When that question's receipt was started (from the signed question receipt). */
  readonly startedAt: number;
}

/** The server's record that one attempt was finalized. Bound to the attempt it finalized and to the quiz. */
export interface AttemptFinalizationPayload {
  readonly v: number;
  readonly kind: 'attempt-finalization';
  readonly quizId: string;
  /** The attempt receipt's own `startedAt`, so this finalization cannot be replayed against another attempt. */
  readonly attemptStartedAt: number;
  /** The server clock when it finalized. */
  readonly finalizedAt: number;
}

export function issueAttemptFinalization(payload: AttemptFinalizationPayload, secret: string): string {
  return encodeSignedReceipt(payload, secret);
}

/** Verify and decode. Throws FinalizationProofError on ANY problem, always with the same message. */
export function verifyAttemptFinalization(receipt: unknown, secret: string): AttemptFinalizationPayload {
  const parsed = decodeSignedReceipt(receipt, secret);
  if (parsed === null) invalid();

  const { v, kind, quizId, attemptStartedAt, finalizedAt } = parsed;
  if (v !== RECEIPT_VERSION) invalid();
  if (kind !== 'attempt-finalization') invalid();
  if (typeof quizId !== 'string' || quizId.trim().length === 0) invalid();
  if (typeof attemptStartedAt !== 'number' || !Number.isFinite(attemptStartedAt) || attemptStartedAt <= 0) invalid();
  if (typeof finalizedAt !== 'number' || !Number.isFinite(finalizedAt) || finalizedAt <= 0) invalid();

  return { v, kind, quizId, attemptStartedAt, finalizedAt };
}

export class FinalizationProofError extends Error {
  public override readonly name = 'FinalizationProofError';
}

function invalid(): never {
  throw new FinalizationProofError('Invalid finalization proof');
}

export function issueFinalizationProof(payload: FinalizationProofPayload, secret: string): string {
  return encodeSignedReceipt(payload, secret);
}

/** Verify and decode. Throws FinalizationProofError on ANY problem, always with the same message. */
export function verifyFinalizationProof(proof: unknown, secret: string): FinalizationProofPayload {
  const parsed = decodeSignedReceipt(proof, secret);
  if (parsed === null) invalid();

  const { v, kind, quizId, questionText, status, startedAt } = parsed;
  if (v !== RECEIPT_VERSION) invalid();
  if (kind !== 'finalization-proof') invalid();
  if (typeof quizId !== 'string' || quizId.trim().length === 0) invalid();
  if (typeof questionText !== 'string' || questionText.trim().length === 0) invalid();
  if (status !== 'resolved' && status !== 'incomplete' && status !== 'expired') invalid();
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) invalid();

  return { v, kind, quizId, questionText, status, startedAt };
}
