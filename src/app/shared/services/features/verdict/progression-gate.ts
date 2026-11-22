import type { QuestionVerdictPhase } from './question-verdict.types';

/**
 * Two DISTINCT decisions, both backend-verdict-only (never `option.correct` or
 * any other client-side answer data), deliberately kept separate rather than
 * folded into one ambiguous rule:
 *
 *   - `blocksIntermediateProgression` — may the user leave THIS question via
 *     Next or keyboard advancement, to reach a LATER question? ANSWERED, not
 *     CORRECT: at least one option is selected and the backend has responded
 *     (a resolved or incomplete verdict, right or wrong), or the question has
 *     an authoritative `expired` verdict. Nothing is selected, or the check is
 *     still in flight or failed → blocked. Leaving a question this way records
 *     nothing: the answer keeps whatever verdict the backend gave it (an
 *     incorrect or partial answer is never marked correct, earns nothing and
 *     reveals no explanation); only a fully correct answer or an expiry does.
 *
 *   - `questionBlocksResults` — does a question (the last included) keep Results
 *     unavailable? The same "a backend-verified attempt, or an authoritative
 *     expiry" rule as Next, WITHOUT Next's local-timeout allowance.
 */

/** Intermediate question → may the user move past it? (selection + a completed backend response, or expiry) */
export function blocksIntermediateProgression(
  phase: QuestionVerdictPhase | null | undefined,
  hasSelection: boolean,
  isResolvedCorrect?: boolean | null
): boolean {
  if (phase === 'expired') return false;
  // A fully correct verdict is an answer whatever the live selection reads (a revisit can submit an empty set that leaves the
  // verdict resolved-correct).
  if (phase === 'resolved' && isResolvedCorrect === true) return false;
  if (!hasSelection) return true;
  return !(phase === 'resolved' || phase === 'incomplete'); // idle | checking | error | no state yet
}

/**
 * ANY question (the last included) → does it keep Results unavailable?
 *
 * Results needs every question to have a BACKEND-VERIFIED attempt — correct, incorrect or partial — or an authoritative
 * `expired` verdict. An attempt is a selection the backend has answered (a resolved or incomplete verdict). Unanswered
 * questions, checks in flight or failed, and a local timeout the server has not confirmed keep Results blocked. Incorrect and
 * partial attempts earn no credit and reveal no explanation: that is decided by the verdict and the heading, not here.
 */
export function questionBlocksResults(
  phase: QuestionVerdictPhase | null | undefined,
  hasSelection: boolean,
  isResolvedCorrect?: boolean | null
): boolean {
  return blocksIntermediateProgression(phase, hasSelection, isResolvedCorrect);
}
