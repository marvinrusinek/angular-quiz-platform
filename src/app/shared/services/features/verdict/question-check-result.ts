import {
  QuestionVerdictError,
  type QuestionCheckResult,
  type SelectedOptionVerdict
} from './question-verdict.types';

/**
 * Boundary validator for a `/check` response body.
 *
 * Both backends (Node `CheckOutcome`, Spring `Resolved/Expired/IncompleteCheckOutcome`) send one of three shapes:
 *
 *   incomplete  { selectedVerdicts: {text, correct}[], remainingCorrectCount }
 *   resolved    { correct, correctOptionTexts: string[], explanation: string }
 *   expired     {          correctOptionTexts: string[], explanation: string }
 *
 * Downstream (`QuestionVerdictService.applyResult`) treats every status that is not `incomplete` or `resolved` as an
 * expiry, and scores `resolved` by `isResolvedCorrect === true`. So a body that merely LOOKS like a result must never get
 * that far: an unknown status would become an expired verdict, and a `resolved` without a boolean `correct` would become an
 * incorrect one. Anything that does not match one of the three shapes is refused with the existing
 * `QuestionVerdictError`, which the adapter and service already map to the `error` phase.
 *
 * What is deliberately NOT enforced, because the contract does not require it:
 *  - an empty `explanation` is allowed, and the arrays may be empty;
 *  - option text is neither trimmed nor normalized (the client matches it against the texts it was served);
 *  - unknown fields (`finalizationProof` on Node, anything a later backend adds) are ignored, never rejected and never
 *    carried into the result.
 *
 * The result is REBUILT from the known fields, with copied arrays, so the caller never aliases the response body.
 */

const invalid = (): never => {
  throw new QuestionVerdictError('Invalid submission');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return invalid();
  const out: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') return invalid();
    out.push(entry);
  }
  return out;
}

function verdictArray(value: unknown): readonly SelectedOptionVerdict[] {
  if (!Array.isArray(value)) return invalid();
  const out: SelectedOptionVerdict[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || typeof entry['text'] !== 'string' || typeof entry['correct'] !== 'boolean') {
      return invalid();
    }
    out.push({ text: entry['text'], correct: entry['correct'] });
  }
  return out;
}

export function toQuestionCheckResult(raw: unknown): QuestionCheckResult {
  if (!isRecord(raw)) return invalid();

  switch (raw['status']) {
    case 'incomplete': {
      const remaining = raw['remainingCorrectCount'];
      if (typeof remaining !== 'number' || !Number.isInteger(remaining) || remaining < 0) return invalid();
      return {
        status: 'incomplete',
        selectedVerdicts: verdictArray(raw['selectedVerdicts']),
        remainingCorrectCount: remaining
      };
    }
    case 'resolved': {
      if (typeof raw['correct'] !== 'boolean' || typeof raw['explanation'] !== 'string') return invalid();
      return {
        status: 'resolved',
        correct: raw['correct'],
        correctOptionTexts: stringArray(raw['correctOptionTexts']),
        explanation: raw['explanation']
      };
    }
    case 'expired': {
      if (typeof raw['explanation'] !== 'string') return invalid();
      return {
        status: 'expired',
        correctOptionTexts: stringArray(raw['correctOptionTexts']),
        explanation: raw['explanation']
      };
    }
    default:
      return invalid();
  }
}
