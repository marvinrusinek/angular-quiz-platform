import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  ViewEncapsulation
} from '@angular/core';

import { Resource } from '@shared/models';
import { IntroExposedTextDirective } from '../../../introduction/intro-exposed-text.directive';

/**
 * Presentational-only Learning Resources list: the always-visible list of external resources for a quiz, with its
 * loading / none / could-not-load states. The parent StatisticsComponent passes the milestone name, the resources and
 * the load status via signal inputs, and handles the retry.
 *
 * Uses ViewEncapsulation.None because the list is styled from its `.resources-view` ancestor (rules that must cross the
 * component boundary, which emulated encapsulation cannot do). The involved class names (`.resources-view`,
 * `.resources-rows`, `.resource-row`, ...) are unique to the statistics feature, so the global rules cannot leak elsewhere.
 */
@Component({
  selector: 'app-quiz-resources',
  standalone: true,
  imports: [IntroExposedTextDirective],
  templateUrl: './quiz-resources.component.html',
  styleUrls: ['./quiz-resources.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class QuizResourcesComponent {
  // ── inputs ──────────────────────────────────────────────────────
  readonly milestoneName = input<string>('');
  readonly introductionText = computed(
    () => $localize`Brush up your knowledge of ${this.milestoneName()} with these resources:`
  );
  readonly resources = input<Resource[]>([]);
  /** The load state of the resources request: loading, ready (possibly empty) or failed. */
  readonly status = input<'loading' | 'ready' | 'failed'>('ready');
  /** The failure state offers a retry. */
  readonly retry = output<void>();

  /**
   * Opens a resource in a new tab (no opener, no referrer): the same approach as the "Star on GitHub" button.
   * The resource rows are native buttons. The destination comes from the API, so only
   * http(s) URLs are ever opened (a window.open call, unlike an href, is not sanitized by Angular).
   */
  openResource(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    window.open(parsed.href, '_blank', 'noopener,noreferrer');
  }
}
