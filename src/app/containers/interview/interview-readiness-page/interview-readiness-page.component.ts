import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { swallow } from '@shared/utils/error-logging';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewReadinessComponent } from '../../../components/interview/interview-readiness/interview-readiness.component';
import { ThemeToggleComponent } from '../../../components/theme-toggle/theme-toggle.component';

/**
 * Interview Readiness: the dedicated page at /interview/readiness
 * (lazy-loaded). It only hosts the shared readiness component in its full,
 * non-compact form and reuses InterviewReadinessService for every number; the
 * same component still renders on the Interview Results page.
 *
 * After route navigation the page's h1 is focused once (it carries
 * tabindex="-1": programmatically focusable, never a Tab stop), the same
 * pattern Interview History uses on entry.
 */
@Component({
  selector: 'codelab-interview-readiness-page',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent, InterviewReadinessComponent],
  templateUrl: './interview-readiness-page.component.html',
  styleUrls: ['../interview-insight-page/interview-insight-page.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InterviewReadinessPageComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly readiness = inject(InterviewReadinessService).readiness;

  constructor() {
    afterNextRender(() => {
      try {
        window.scrollTo({ top: 0, left: 0 });
      } catch (err: unknown) {
        swallow('interview-readiness-page#scrollTop', err);
      }
      this.host.nativeElement
        .querySelector<HTMLElement>('#readiness-heading')
        ?.focus();
    });
  }
}
