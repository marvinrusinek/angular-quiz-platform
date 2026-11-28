import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';

import { ProgressSummary } from '@shared/models';
import { IntroExposedTextDirective } from '../../containers/introduction/intro-exposed-text.directive';
import { WeakAreasService } from '@shared/services/progress/weak-areas.service';
import { PracticeSessionService } from '@shared/services/features/practice/practice-session.service';

/**
 * "Your Progress" panel for the Quiz Selection page. It renders an
 * already-derived ProgressSummary and owns no storage or scoring rules of its
 * own. The one exception is Needs Review, which reads WeakAreasService directly
 * so the topics it names are exactly the ones the practice session will use.
 * Renders nothing until there is at least one quiz.
 *
 * Accessibility: every value is available as text (never color alone); the bars
 * are supplementary and carry role="progressbar" + aria-valuemin/max/now + a
 * descriptive aria-label. A single "Your Progress" heading anchors the region.
 */
@Component({
  selector: 'codelab-progress-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TitleCasePipe, IntroExposedTextDirective],
  templateUrl: './progress-summary.component.html',
  styleUrl: './progress-summary.component.scss'
})
export class ProgressSummaryComponent {
  private readonly weakAreas = inject(WeakAreasService);
  private readonly practiceSession = inject(PracticeSessionService);
  private readonly router = inject(Router);

  /**
   * The SAME weak topics the practice session will draw from — one computed,
   * so the labels shown here can never name different topics than the generator
   * uses. Percentage is pre-rounded for display (templates can't call Math).
   */
  readonly weakTopics = computed(() =>
    this.weakAreas.weakTopics().map((t) => ({ ...t, percentage: Math.round(t.percentage) }))
  );

  /** True when no topic yet has enough answered questions to be judged. */
  readonly insufficientData = this.weakAreas.hasInsufficientData;

  /**
   * Generate a session from the CURRENT weak topics, THEN navigate. The route
   * guard blocks direct URL entry, so the session must exist before we go — a
   * bare routerLink here would simply be bounced back.
   *
   * start() returns false when the weak topics cannot supply a single question,
   * so an eligible-looking action can never navigate into an empty session.
   */
  async startPractice(): Promise<void> {
    if (!(await this.practiceSession.start())) return;
    await this.router.navigate(['/practice/weak-areas']);
  }

  // ── What Narrator reads ─────────────────────────────────────────────
  // Each row of the panel is ONE group exposing ONE text node (see IntroExposedTextDirective); these build that text from
  // the same data as the visible values, so the two can never drift apart.
  readonly labels = {
    averageScore: $localize`Average Score`,
    perfectScores: $localize`Perfect Scores`,
    questionsCompleted: $localize`Questions Completed`
  };

  /** "Completed, 6 out of 20". */
  completedSpoken(s: ProgressSummary): string {
    return $localize`Completed, ${s.completedCount} out of ${s.totalCount}`;
  }

  /** "Overall Progress, 100%". */
  overallSpoken(s: ProgressSummary): string {
    return $localize`Overall Progress, ${s.completionPercentage}%`;
  }

  /** "Beginner, 6 out of 6", from the row's own numbers. */
  difficultySpoken(level: ProgressSummary['byDifficulty'][number]): string {
    const name = level.difficulty.charAt(0).toUpperCase() + level.difficulty.slice(1);
    return $localize`${name}, ${level.completed} out of ${level.total}`;
  }

  /** "Average Score, 80%". */
  statSpoken(label: string, value: string | number): string {
    return $localize`${label}, ${value}`;
  }

  /** "Strongest," then "<quiz>, <score>%" (one line per visible line). */
  strongestSpoken(strong: NonNullable<ProgressSummary['strongestQuiz']>): string {
    return [$localize`Strongest,`, $localize`${strong.milestone}, ${strong.bestScore}%`].join('\n');
  }

  /**
   * "Needs Review," then one line per weak topic ("<topic>, <n>%"; all but the last end with a semicolon), or the same
   * message the panel shows when there is none to list.
   */
  readonly needsReviewSpoken = computed(() => {
    const topics = this.weakTopics();
    const head = $localize`Needs Review,`;
    if (topics.length === 0) {
      const message = this.insufficientData()
        ? $localize`Complete a quiz or interview to identify weak areas.`
        : $localize`No weak areas detected.`;
      return [head, message].join('\n');
    }
    const lines = topics.map((t, i) => $localize`${t.topicName}, ${t.percentage}%` + (i < topics.length - 1 ? ';' : ''));
    return [head, ...lines].join('\n');
  });

  /** The derived aggregate progress. Renders nothing when there are no quizzes. */
  readonly summary = input<ProgressSummary | null>(null);

  /**
   * 'full' (default) renders the heading + Completed + Overall rows plus the
   * breakdown. 'details' omits the heading/Completed/Overall (they live in the
   * accordion header) and renders only the difficulty + strongest/needs-review
   * breakdown, with the card chrome stripped for use inside a panel.
   */
  readonly variant = input<'full' | 'details'>('full');

  /** Convenience for tests / hosts that prefer a boolean guard. */
  readonly hasQuizzes = computed(() => (this.summary()?.totalCount ?? 0) > 0);
}
