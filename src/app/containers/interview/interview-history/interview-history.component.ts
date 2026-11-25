import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  viewChild
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';

import { formatDuration } from '@shared/utils/format-time';
import { swallow } from '@shared/utils/error-logging';
import { InterviewAttemptHistoryEntry, interviewConfigLabel } from '@shared/models';
import {
  InterviewHistoryFilter,
  InterviewHistoryService
} from '@shared/services/features/interview/interview-history.service';
import { InterviewSessionReferenceStorage } from '@shared/services/interview/interview-session-reference.storage';
import { ThemeToggleComponent } from '../../../components/theme-toggle/theme-toggle.component';
import { InterviewReadinessComponent } from '../../../components/interview/interview-readiness/interview-readiness.component';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { IntroExposedTextDirective } from '../../introduction/intro-exposed-text.directive';
import { InterviewTopicTrendsComponent } from '../../../components/interview/interview-topic-trends/interview-topic-trends.component';
import { InterviewTopicTrendsService } from '@shared/services/features/interview/interview-topic-trends.service';
import { ScrollDownIndicatorComponent } from '../../../components/scroll-down-indicator/scroll-down-indicator.component';
import { InterviewHistoryStore } from './interview-history.store';

/**
 * Interview History — a read-only record of completed Interview Mode attempts.
 * It NEVER touches localStorage directly: all persistence/validation/retention
 * lives in InterviewHistoryService, and the summary metrics reuse that service's
 * `trends` (no independent recalculation). Filtering is client-side and pure; the selected filter and the values
 * derived from it (chip counts, displayed cards) live in the component-scoped InterviewHistoryStore.
 *
 * This is purely historical — it never restores or resumes a session.
 */
@Component({
  selector: 'codelab-interview-history',
  standalone: true,
  imports: [
    TitleCasePipe,
    RouterLink,
    ThemeToggleComponent,
    InterviewReadinessComponent,
    InterviewTopicTrendsComponent,
    IntroExposedTextDirective,
    ScrollDownIndicatorComponent,
    Toolbar,
    ToolbarWidget,
    ToolbarWidgetGroup
  ],
  templateUrl: './interview-history.component.html',
  styleUrls: ['./interview-history.component.scss'],
  // Component-scoped: each instance gets its own store, so the filter resets to "all" when the page is recreated.
  providers: [InterviewHistoryStore],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InterviewHistoryComponent implements OnInit {
  /**
   * CONFIRMED (manual Narrator report, 2026-10-19): activating "View Topic
   * Trends" (routerLink="/interview/history" fragment="topic-trends")
   * landed here with Narrator reading the entire page from the top,
   * instead of announcing the Topic Trends section. Traced, not assumed:
   * `provideRouter(routes)` in main.ts has no `anchorScrolling` option, so
   * Angular's Router does nothing at all with a fragment on its own — no
   * scroll, no focus — and an SPA route change (pushState) doesn't trigger
   * the browser's native hash-scroll either, unlike a real page load. On
   * top of that, THIS method unconditionally forced the scroll position to
   * the top regardless of fragment. With nothing ever receiving focus,
   * Narrator's cursor simply continued from wherever it was, reading
   * sequentially — which is what "reads the whole page" actually was.
   * CONFIRMED FIXED: the fragment case now reads its own heading cleanly.
   *
   * A SEPARATE, second manual report (same day): normal entry (no
   * fragment at all — e.g. "View Interview History") opened at the top
   * correctly, but Narrator then automatically read the entire page with
   * no further key presses. Nothing in this component ever focused
   * anything on a plain entry either — the same missing-focus-target
   * class of issue, just a different trigger. This component's own
   * `<h1>` is now focused once on exactly this path (see
   * `focusEntryTarget()` below), mirroring the same pattern already
   * confirmed working for Interview Session's first question and
   * Interview Results' own entry. NOTE: if Narrator's OWN "automatically
   * read the whole screen" setting is active, page markup cannot
   * guarantee suppressing that entirely — focus management gives
   * Narrator a genuine new target to redirect to/interrupt stale or
   * continuing speech with, which is what resolved this same class of
   * issue everywhere else it was tried this session, but it is not a
   * markup-level override of an OS/AT setting. Flag this separately if
   * auto-read still partially occurs after this fix.
   *
   * Fix is scoped to exactly the topic-trends fragment for scroll-to-top:
   * normal entry (no fragment, or any other fragment) keeps the EXACT
   * existing scroll-to-top behavior, untouched. Only when the fragment is
   * 'topic-trends' is scroll-to-top skipped here instead, in favor of
   * scrolling to AND focusing that section's own real heading in
   * `focusEntryTarget()` below — which is also where the two entry paths
   * are kept mutually exclusive (exactly one branch ever moves focus).
   */
  ngOnInit(): void {
    if (this.route.snapshot.fragment === 'topic-trends') return;
    // Open at the TOP. Arriving from a long Interview Results page (or from a
    // history detail) otherwise inherits the previous scroll offset and lands
    // mid-list, hiding the heading and the summary counts.
    try {
      window.scrollTo({ top: 0, left: 0 });
    } catch (err: unknown) {
      // Non-fatal in non-browser test environments.
      swallow('interview-history#scrollTop', err);
    }
  }

  private readonly history = inject(InterviewHistoryService);
  private readonly store = inject(InterviewHistoryStore);
  private readonly sessionRef = inject(InterviewSessionReferenceStorage);
  private readonly readinessService = inject(InterviewReadinessService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);

  // This page's own heading — the normal-entry focus target (see
  // focusEntryTarget()'s own comment).
  private readonly historyHeading = viewChild<ElementRef<HTMLElement>>('historyHeading');

  constructor() {
    afterNextRender(() => {
      this.focusEntryTarget();
    });
  }

  /**
   * See ngOnInit's own comment for the full trace of both manual reports.
   * `topicTrends` is a synchronous computed (no backend fetch, no async
   * gap — confirmed via InterviewTopicTrendsService), and this page's own
   * `<h1>` is always present unconditionally, so both targets already
   * exist in the DOM by the time this runs, once, after the first real
   * render (`afterNextRender`, not an `effect()` — nothing here depends on
   * a signal becoming ready later, so there is no re-fire risk and no
   * extra guard flag is needed).
   *
   * MUTUALLY EXCLUSIVE by construction: exactly one branch below ever
   * moves focus, never both. The topic-trends fragment scrolls to AND
   * focuses that section's own real `<h2>` (tabindex="-1" there —
   * programmatically focusable only, never a Tab stop); every other entry
   * path focuses this page's own `<h1>` instead (same tabindex="-1"
   * treatment) — never a later, second jump back to the page heading
   * after the fragment case has already run.
   */
  private focusEntryTarget(): void {
    if (this.route.snapshot.fragment === 'topic-trends') {
      const heading = this.host.nativeElement.querySelector('#topic-trends-heading') as HTMLElement | null;
      if (!heading) return;
      heading.scrollIntoView({ block: 'start' });
      heading.focus();
      return;
    }
    this.historyHeading()?.nativeElement.focus();
  }

  // Summary metrics — reuse the shared trends (same source as Performance Trends).
  readonly trends = this.history.trends;

  // Compact readiness banner — the same shared readiness estimate, no factor
  // breakdown here (that lives on the Results page).
  readonly readiness = this.readinessService.readiness;

  // Topic Trends — per-topic direction/strength derived from the same history.
  private readonly topicTrendsService = inject(InterviewTopicTrendsService);
  readonly topicTrends = this.topicTrendsService.trends;

  readonly hasHistory = computed(() => this.history.history().length > 0);

  /**
   * Lifetime attempts vs. attempts still on file.
   *
   * History keeps only the newest INTERVIEW_HISTORY_MAX (20) attempts, but
   * `attemptNumber` is a LIFETIME counter that keeps climbing. Showing the
   * retained count under a "Completed Interviews" label therefore read as a
   * miscount once a user passed 20 (e.g. attempts 6–25 on file → "20" beside an
   * "Interview #25" card).
   *
   * The lifetime total is inferred from the highest retained attemptNumber
   * rather than persisted separately: retention always keeps the NEWEST
   * attempts, so the newest entry carries the highest number. Falls back to the
   * retained count for legacy entries that predate attemptNumber.
   */
  readonly lifetimeCount = computed(() => {
    const all = this.history.history();
    return all.reduce((max, e) => Math.max(max, e.attemptNumber ?? 0), 0) || all.length;
  });

  /** True once older attempts have aged out, i.e. the two numbers differ. */
  readonly hasAgedOut = computed(() => this.lifetimeCount() > this.history.history().length);

  readonly retainedCount = computed(() => this.history.history().length);

  // Selected filter, per-filter counts and the displayed cards come from the component-scoped store; the template
  // keeps reading them under the same names.
  readonly filter = this.store.filter;

  readonly filters: { id: InterviewHistoryFilter; label: string }[] = [
    { id: 'all', label: $localize`All` },
    { id: 'submitted', label: $localize`Submitted` },
    { id: 'time-expired', label: $localize`Time Expired` }
  ];

  readonly counts = this.store.counts;

  readonly cards = this.store.cards;

  setFilter(id: InterviewHistoryFilter): void {
    this.store.setFilter(id);
  }

  /**
   * Angular Aria's ngToolbar reports the user's selection here on click/
   * Enter/Space; `filter` (fed back in via `[value]="[filter()]"`) remains
   * the ONE authoritative signal — this only relays the toolbar's report
   * into the existing setter, exactly as a click handler always did.
   */
  onFilterToolbarChange(values: readonly InterviewHistoryFilter[]): void {
    const next = values[0];
    if (next !== undefined) this.setFilter(next);
  }

  /** Role preset name, or "Custom Interview" for custom and legacy entries. */
  interviewKindLabel(entry: InterviewAttemptHistoryEntry): string {
    return interviewConfigLabel(entry.configKind, entry.presetId, entry.presetName);
  }

  completionLabel(entry: InterviewAttemptHistoryEntry): string {
    return entry.completionReason === 'time-expired'
      ? $localize`Time expired`
      : $localize`Submitted`;
  }

  // ── Narrator phrases ────────────────────────────────────────────────────
  // One complete phrase per statistic, "Label, value" (the Interview Results
  // convention), exposed over the visible label and value. They say the same
  // thing as the visible text, in the same order.

  readonly completedPhrase = computed(() =>
    this.hasAgedOut()
      ? $localize`Completed Interviews, ${this.lifetimeCount()}, last ${this.retainedCount()} shown`
      : $localize`Completed Interviews, ${this.lifetimeCount()}`
  );
  readonly bestPhrase = computed(() => $localize`Best Score, ${this.trends().best}%`);
  readonly averagePhrase = computed(() => $localize`Average Score, ${this.trends().average}%`);
  readonly latestPhrase = computed(() => $localize`Latest Score, ${this.trends().latest}%`);

  scorePhrase(entry: InterviewAttemptHistoryEntry): string {
    return $localize`Score: ${entry.score} out of ${entry.totalQuestions}, ${entry.percentage}%`;
  }

  durationPhrase(entry: InterviewAttemptHistoryEntry): string {
    return $localize`Duration: ${this.spokenDuration(entry.durationSeconds)}`;
  }

  difficultyPhrase(entry: InterviewAttemptHistoryEntry): string {
    const difficulty = new TitleCasePipe().transform(entry.configuredDifficulty || 'mixed');
    return $localize`Difficulty: ${difficulty}`;
  }

  /** "Topics: Forms, HTTP" — the card's topic chips as one phrase. */
  topicsPhrase(topics: readonly string[]): string {
    return $localize`Topics: ${topics.join(', ')}`;
  }

  /**
   * The card heading's name: "#" is spoken as "hashtag", and the status badge
   * is part of the same stop, e.g. "Interview number 90, Submitted".
   */
  headingPhrase(entry: InterviewAttemptHistoryEntry, number: number): string {
    return $localize`Interview number ${number}, ${this.completionLabel(entry)}`;
  }

  /** The interview type and its date as one phrase: "Custom Interview, July 23, 2026". */
  metaPhrase(entry: InterviewAttemptHistoryEntry): string {
    return $localize`${this.interviewKindLabel(entry)}, ${this.formatDate(entry.completedAt)}`;
  }

  /** "24m 31s" read aloud as full words, so it is not spoken as letters. */
  private spokenDuration(seconds: number | undefined): string {
    if (seconds == null) return $localize`Not recorded`;
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(hours === 1 ? $localize`1 hour` : $localize`${hours} hours`);
    if (minutes > 0) {
      parts.push(minutes === 1 ? $localize`1 minute` : $localize`${minutes} minutes`);
    }
    if (secs > 0 || parts.length === 0) {
      parts.push(secs === 1 ? $localize`1 second` : $localize`${secs} seconds`);
    }
    return parts.join(' ');
  }

  // An unretained duration reads as "Not recorded" — never a misleading "0s".
  duration(seconds: number | undefined): string {
    return seconds == null ? $localize`Not recorded` : formatDuration(seconds);
  }

  /** "July 23, 2026" — locale-formatted, safe fallback for odd input. */
  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  /**
   * Whether this attempt can still be reviewed.
   *
   * Review lives on the server, and the ONLY credential for it is the active
   * session reference in sessionStorage — which dies with the tab. So this is
   * true just for the attempt taken in THIS browser session; every older entry
   * is summary-only. The button is hidden rather than shown-and-broken, so it
   * never promises data that cannot be fetched.
   */
  canReview(entry: InterviewAttemptHistoryEntry): boolean {
    return !!entry.sessionId && this.sessionRef.read()?.sessionId === entry.sessionId;
  }
}
