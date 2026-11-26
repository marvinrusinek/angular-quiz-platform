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
import { InterviewTopicTrendsService } from '@shared/services/features/interview/interview-topic-trends.service';
import { InterviewTopicTrendsComponent } from '../../../components/interview/interview-topic-trends/interview-topic-trends.component';
import { ThemeToggleComponent } from '../../../components/theme-toggle/theme-toggle.component';

/**
 * Topic Trends: the dedicated page at /interview/trends (lazy-loaded). It
 * hosts the shared topic-trends component and reuses
 * InterviewTopicTrendsService for every calculation. The component renders
 * immediately: the route is already a lazy chunk, so the idle @defer that
 * served the section embedded at the bottom of Interview History is gone.
 *
 * After route navigation the page's h1 is focused once (tabindex="-1").
 */
@Component({
  selector: 'codelab-interview-topic-trends-page',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent, InterviewTopicTrendsComponent],
  templateUrl: './interview-topic-trends-page.component.html',
  styleUrls: ['../interview-insight-page/interview-insight-page.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InterviewTopicTrendsPageComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly topicTrends = inject(InterviewTopicTrendsService).trends;

  constructor() {
    afterNextRender(() => {
      try {
        window.scrollTo({ top: 0, left: 0 });
      } catch (err: unknown) {
        swallow('interview-topic-trends-page#scrollTop', err);
      }
      this.host.nativeElement
        .querySelector<HTMLElement>('#topic-trends-heading')
        ?.focus();
    });
  }
}
