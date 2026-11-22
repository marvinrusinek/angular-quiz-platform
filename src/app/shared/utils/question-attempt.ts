import type { QuestionVerdictService } from '@shared/services/features/verdict/question-verdict.service';
import { verdictStateForDisplayIndex } from '@shared/services/features/verdict/authorized-correctness';

/**
 * Was question `index` ATTEMPTED? Used by Results so a question skipped (never answered) is reported as Unanswered rather than
 * as an incorrect answer.
 *
 * Attempted = the backend has a verdict for it (resolved, a partial attempt with something selected, or expired), or an answer
 * was recorded. A partial attempt is restored from storage after a reload, so it stays attempted. Nothing is invented for a
 * skipped question.
 */
export function wasQuestionAttempted(
  quizService: { quizId?: string; getQuestionsInDisplayOrder?: unknown; userAnswers?: unknown[] },
  verdicts: QuestionVerdictService | null | undefined,
  index: number
): boolean {
  const state = verdictStateForDisplayIndex(quizService as never, index, verdicts);
  if (state) {
    if (state.phase === 'expired' || state.phase === 'resolved') return true;
    if (state.phase === 'incomplete' && state.selectedOptionTexts.length > 0) return true;
  }
  const stored = quizService.userAnswers?.[index];
  return Array.isArray(stored) ? stored.length > 0 : stored != null;
}
