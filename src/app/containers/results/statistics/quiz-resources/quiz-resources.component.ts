import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation
} from '@angular/core';

import { Resource } from '@shared/models';
import { IntroExposedTextDirective } from '../../../introduction/intro-exposed-text.directive';

/**
 * Presentational-only "Brush up your knowledge…" resources panel: the
 * expand/collapse toggle, heading, caret and the external-link list. The parent
 * StatisticsComponent passes the milestone name + resources via signal inputs;
 * the collapse state lives here since it is not used anywhere else.
 *
 * Uses ViewEncapsulation.None because the panel is styled DIFFERENTLY depending
 * on where the parent renders it — inside `.quiz-feedback` (the low-score inline
 * case) vs inside `.resources-view` (the standalone case). Those ancestor-context
 * rules must cross the component boundary, which emulated encapsulation cannot
 * do. The involved class names (`.quiz-feedback`, `.resources-view`,
 * `.resources-section`) are unique to the statistics feature, so the global
 * rules cannot leak elsewhere.
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
  // ── injects ─────────────────────────────────────────────────────
  private readonly cdRef = inject(ChangeDetectorRef);

  // ── inputs ──────────────────────────────────────────────────────
  readonly milestoneName = input<string>('');
  readonly resources = input<Resource[]>([]);
  /**
   * `collapsible` (default): the inline "Brush up…" panel inside the low-score feedback, unchanged.
   * `list`: the dedicated Resources view, where the section's own heading comes first and the links follow
   * directly, always visible, with loading / empty / failed states.
   */
  readonly variant = input<'collapsible' | 'list'>('collapsible');
  /** Only meaningful for the `list` variant. */
  readonly status = input<'loading' | 'ready' | 'failed'>('ready');
  /** The `list` variant's failure state offers a retry. */
  readonly retry = output<void>();

  // Signal-controlled expand/collapse for the resources panel (replaces a native
  // <details>, whose [open] CSS didn't flip the caret reliably here). COLLAPSED by
  // default — starts with a ▼, and the first click reveals the resources.
  readonly resourcesExpanded = signal(false);

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
  toggleResources(): void {
    this.resourcesExpanded.update((open) => !open);
    this.cdRef.markForCheck();
  }
}
