import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IntroExposedTextDirective } from '../../containers/introduction/intro-exposed-text.directive';

/**
 * Compact "Achievements X / N" progress badge for the Quiz Selection screen.
 * Pure presentation — the parent passes the earned/total counts; no storage or
 * rule logic here. Renders nothing until there is a positive total, so it never
 * shows a meaningless "0 / 0".
 *
 * Accessibility: a neutral container (no region/landmark, group, graphic or live
 * region) with visible "Achievements N / M" hidden from assistive technology.
 * One transparent text node says "Achievements N of M" and is fitted to the
 * outer pill's bounds. The trophy is decorative. Static progress, not an event.
 */
@Component({
  selector: 'codelab-achievements-summary',
  standalone: true,
  imports: [IntroExposedTextDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './achievements-summary.component.html',
  styleUrl: './achievements-summary.component.scss'
})
export class AchievementsSummaryComponent {
  /** Number of achievements earned so far. */
  readonly earned = input<number>(0);
  /** Total number of achievements available. */
  readonly total = input<number>(0);

  /** The whole badge text as ONE localized string, e.g. "Achievements 3 / 6" (rendered as a single text node). */
  readonly summaryText = computed(() => $localize`Achievements ${this.earned()} / ${this.total()}`);

  /** The spoken phrase as ONE localized string, e.g. "Achievements 3 of 6" (screen-reader-only; the visible text keeps the slash). */
  readonly spokenText = computed(() => $localize`Achievements ${this.earned()} of ${this.total()}`);

  /** Plain-language summary, e.g. "Achievements: 3 of 6 earned". Not bound in the template (the visible text is the accessible content); kept for the cross-component test that compares Quiz Selection and Results. */
  readonly label = computed(() => `Achievements: ${this.earned()} of ${this.total()} earned`);
}
