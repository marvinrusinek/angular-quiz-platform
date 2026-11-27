import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import { Router } from '@angular/router';

import { PracticeSessionService } from '@shared/services/features/practice/practice-session.service';
import { WeakAreasService } from '@shared/services/progress/weak-areas.service';
import { swallow } from '@shared/utils/error-logging';
import { ThemeToggleComponent } from '../../../components/theme-toggle/theme-toggle.component';
import { ScrollDownIndicatorComponent } from '../../../components/scroll-down-indicator/scroll-down-indicator.component';
import { IntroExposedTextDirective } from '../../introduction/intro-exposed-text.directive';

/**
 * Practice Results — overall score, per-topic breakdown and Answer Review.
 *
 * The result is READ from the session snapshot, never recomputed here, so a
 * remount or refresh renders the identical numbers that were recorded. Scoring
 * itself lives in practice-scoring.ts and reuses the shared `isAnswerCorrect()`.
 *
 * This page writes NOTHING except the topic-performance record: no Interview
 * History, no interview attempt counts, no certificates, no High Scores, no
 * achievements, no quiz completion counts. Difficulty Recommendation and
 * Recommended Next Quiz are likewise untouched.
 */
@Component({
  selector: 'codelab-weak-areas-practice-results',
  standalone: true,
  imports: [ThemeToggleComponent, ScrollDownIndicatorComponent, IntroExposedTextDirective],
  templateUrl: './weak-areas-practice-results.component.html',
  styleUrls: ['./weak-areas-practice-results.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeakAreasPracticeResultsComponent {
  private readonly session = inject(PracticeSessionService);
  private readonly weakAreas = inject(WeakAreasService);
  private readonly router = inject(Router);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly result = this.session.result;

  readonly total = computed(() => this.result()?.total ?? 0);
  readonly correct = computed(() => this.result()?.correct ?? 0);
  readonly percentage = computed(() => this.result()?.percentage ?? 0);
  readonly perTopic = computed(() => this.result()?.perTopic ?? []);
  readonly review = computed(() => this.result()?.review ?? []);

  // What Narrator reads. Each text is built from the same data as the visible values, one line per visible
  // row, and exposed as ONE text node per group (see IntroExposedTextDirective).
  /** "100%," / "10 out of 10 correct" (and "N left unanswered" when there are any). */
  readonly scoreSpoken = computed(() => {
    const s = this.result();
    if (!s) return '';
    const lines = [$localize`${s.percentage}%,`];
    if (s.unanswered > 0) {
      lines.push($localize`${s.correct} out of ${s.total} correct,`);
      lines.push($localize`${s.unanswered} left unanswered`);
    } else {
      lines.push($localize`${s.correct} out of ${s.total} correct`);
    }
    return lines.join('\n');
  });

  /** "RxJS, 3 out of 3, 100%". The visible "3/3" notation stays. */
  topicSpoken(topic: { topicName: string; correct: number; total: number; percentage: number }): string {
    return $localize`${topic.topicName}, ${topic.correct} out of ${topic.total}, ${topic.percentage}%`;
  }

  /** The status pill: "Correct", "Incorrect" or "Not answered". */
  statusSpoken(entry: { isCorrect: boolean; answered: boolean }): string {
    if (entry.isCorrect) return $localize`Correct`;
    return entry.answered ? $localize`Incorrect` : $localize`Not answered`;
  }

  /** "Question 1, RxJS". */
  metaSpoken(entry: { index: number; topicName: string }): string {
    return $localize`Question ${entry.index + 1}, ${entry.topicName}`;
  }

  /** "Your answer:" then one line per selected answer (or "No answer selected"). */
  yourAnswerSpoken(entry: { selectedTexts: readonly string[] }): string {
    const label = $localize`Your answer:`;
    return [label, ...(entry.selectedTexts.length > 0 ? entry.selectedTexts : [$localize`No answer selected`])].join('\n');
  }

  /** "Correct answer:" then one line per correct answer. */
  correctAnswerSpoken(entry: { correctTexts: readonly string[] }): string {
    return [$localize`Correct answer:`, ...entry.correctTexts].join('\n');
  }

  /**
   * Set when Practice Again finds nothing left to practise. Shown INSTEAD of
   * starting an empty session.
   */
  readonly noWeakAreasRemaining = signal(false);

  /**
   * True while Practice Again is generating its session. Disables the button so
   * repeated activation cannot start a second session or a second navigation.
   */
  readonly practiceAgainPending = signal(false);

  /** Whether more practice is currently available, used to word the action. */
  readonly hasWeakTopics = this.weakAreas.hasWeakTopics;

  constructor() {
    // Recording is idempotent and keyed by `practice:{sessionId}` against
    // PERSISTED state, so this remount/refresh entry point cannot duplicate it.
    this.session.ensureRecorded();
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }

  /**
   * Practice Again: record → recalculate weak topics → generate a NEW randomized
   * session. Never a replay of the completed one.
   */
  async practiceAgain(): Promise<void> {
    if (this.practiceAgainPending()) return;
    this.practiceAgainPending.set(true);
    try {
      // The session is built asynchronously (API question pools). Navigate only
      // once it EXISTS: PracticeSessionGuard admits /practice/weak-areas only for
      // a live session, and would otherwise bounce back to these results.
      const started = await this.session.practiceAgain();
      if (!started) {
        this.noWeakAreasRemaining.set(true);
        return;
      }
      this.noWeakAreasRemaining.set(false);
      await this.router.navigate(['/practice/weak-areas']);
    } catch (err: unknown) {
      // No session was confirmed: stay on the results, with Practice Again usable.
      swallow('weak-areas-practice-results#practiceAgain', err);
    } finally {
      this.practiceAgainPending.set(false);
    }
  }

  /**
   * Drops the completed snapshot, so browser Back cannot restore a finished
   * session. Recorded topic-performance history is deliberately left intact.
   */
  async backToQuizzes(): Promise<void> {
    this.session.clear();
    await this.router.navigate(['/quiz'], { replaceUrl: true });
  }
}
