import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { InterviewAttemptHistoryEntry, InterviewCompletionReason } from '@shared/models';
import { SK_INTERVIEW_HISTORY } from '@shared/constants/session-keys';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewHistoryComponent } from './interview-history.component';

// Stub readiness so the list spec doesn't pull in the QuizDataService chain
// (its own service spec covers readiness). The component only reads `readiness()`.
const readinessStub = { readiness: () => null } as unknown as InterviewReadinessService;

function entry(
  pct: number,
  i: number,
  reason: InterviewCompletionReason = 'submitted'
): InterviewAttemptHistoryEntry {
  return {
    id: `att-${i}`,
    completedAt: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
    score: pct,
    totalQuestions: 100,
    percentage: pct,
    completionReason: reason,
    durationSeconds: 1471,
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms', 'http'],
    topicPerformance: [
      { topicId: 'forms', topicName: 'Forms', correct: pct, total: 100, percentage: pct },
      { topicId: 'http', topicName: 'HTTP', correct: pct, total: 100, percentage: pct }
    ]
  };
}

function seed(attempts: InterviewAttemptHistoryEntry[]): void {
  localStorage.setItem(SK_INTERVIEW_HISTORY, JSON.stringify({ version: 2, attempts }));
}

function render(fragment?: string): ComponentFixture<InterviewHistoryComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InterviewHistoryComponent],
    providers: [
      provideRouter([]),
      { provide: InterviewReadinessService, useValue: readinessStub },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: fragment ?? null } } }
    ]
  });
  const fixture = TestBed.createComponent(InterviewHistoryComponent);
  fixture.detectChanges();
  return fixture;
}

describe('InterviewHistoryComponent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('2. shows the empty state when there is no history', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.interview-history__empty')?.textContent).toContain(
      'No completed interviews yet'
    );
    expect(el.querySelector('.ih-card')).toBeNull();
  });

  it('4/5. lists attempts newest first with chronological numbers', () => {
    seed([entry(70, 1), entry(80, 2), entry(90, 3)]);
    const el = render().nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('.ih-card__title')).map((n) =>
      n.textContent?.trim()
    );
    expect(titles).toEqual(['Interview #3', 'Interview #2', 'Interview #1']);
    // Newest (90%) card is first.
    expect(el.querySelector('.ih-card__pct')?.textContent).toContain('90%');
  });

  it('11-14. summary metrics reuse the shared trends', () => {
    seed([entry(70, 1), entry(90, 2), entry(84, 3)]);
    const dds = Array.from(
      (render().nativeElement as HTMLElement).querySelectorAll('.ih-summary dd')
    ).map((n) => n.textContent?.trim());
    // Completed / Best / Average / Latest
    expect(dds).toEqual(['3', '90%', '81%', '84%']);
  });

  it('6/7/8. filters by completion reason (client-side)', () => {
    seed([entry(70, 1, 'submitted'), entry(50, 2, 'time-expired'), entry(90, 3, 'submitted')]);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.ih-card')).toHaveLength(3); // All

    const filters = el.querySelectorAll<HTMLButtonElement>('.ih-filter');
    // filters: [All, Submitted, Time Expired]
    filters[1].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.ih-card')).toHaveLength(2); // Submitted

    filters[2].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.ih-card')).toHaveLength(1); // Time Expired
    expect(el.querySelector('.ih-card__badge')?.textContent).toContain('Time expired');
  });

  it("9. each card opens that attempt's read-only summary", () => {
    seed([entry(70, 1)]);
    const fixture = render();
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.ih-card__actions button'
    );
    expect(button?.textContent).toContain('View Summary');
    expect(button?.type).toBe('button');
    button?.click();
    expect(String(navigate.mock.calls[0]?.[0])).toBe('/interview/history/att-1');
  });

  it('offers NO Review Answers shortcut — history keeps analytics, not answers', () => {
    // The answer key lives on the backend now. A durable per-question review
    // is no longer retained, so advertising the action would promise data the
    // browser does not have.
    seed([entry(70, 1), entry(80, 2)]);
    const cards = Array.from((render().nativeElement as HTMLElement).querySelectorAll('.ih-card'));
    for (const card of cards) {
      const labels = Array.from(
        card.querySelectorAll<HTMLElement>('.ih-card__actions a, .ih-card__actions button')
      ).map((el) => el.textContent?.trim());
      expect(labels).toEqual(['View Summary']);
    }
  });

  it('orders the page summary → interviews → page links, with no embedded Readiness or Topic Trends', () => {
    seed([entry(70, 1)]);
    const el = render().nativeElement as HTMLElement;
    const nodes = ['.ih-summary', '.interview-history__interviews', '.interview-history__footer'].map(
      (sel) => el.querySelector(sel)
    );
    for (const n of nodes) expect(n).not.toBeNull();
    expect(el.querySelector('.interview-history__interviews .ih-card')).not.toBeNull();
    for (let i = 0; i < nodes.length - 1; i++) {
      const rel = nodes[i]!.compareDocumentPosition(nodes[i + 1]!);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // They live on their own pages now.
    expect(el.querySelector('app-interview-readiness, .readiness')).toBeNull();
    expect(el.querySelector('app-interview-topic-trends, .topic-trends, #topic-trends')).toBeNull();
  });

  it('links to the dedicated Interview Readiness and Topic Trends pages with real anchors', () => {
    seed([entry(70, 1)]);
    const el = render().nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.interview-history__footer a'));
    const byText = (t: string) => links.find((a) => a.textContent?.trim() === t);
    expect(byText('Interview Readiness')?.getAttribute('href')).toBe('/interview/readiness');
    expect(byText('Topic Trends')?.getAttribute('href')).toBe('/interview/trends');
    expect(el.querySelectorAll('main, [role="main"]').length).toBe(0); // the single <main> is the app shell's
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('has no "Jump to Interviews" link or button, however long the page is', () => {
    seed([entry(70, 1), entry(80, 2), entry(90, 3)]);
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.ih-jump-link, .interview-history__jump')).toBeNull();
    expect(el.textContent).not.toContain('Jump to Interviews');
  });

  it('16. filters and the View Summary action are real buttons (keyboard-operable)', () => {
    seed([entry(70, 1)]);
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.ih-filter')?.tagName).toBe('BUTTON');
    expect(el.querySelector('.ih-filter')?.getAttribute('aria-pressed')).toBe('true'); // All active by default
    expect(el.querySelector('.ih-card__actions button')?.tagName).toBe('BUTTON');
  });

  it('shows "Not recorded" instead of 0s when a duration was never retained', () => {
    const noDuration = entry(70, 1);
    delete noDuration.durationSeconds;
    seed([noDuration]);
    const el = render().nativeElement as HTMLElement;
    const durationDd = Array.from(el.querySelectorAll('.ih-card__stats div')).find((d) =>
      d.querySelector('dt')?.textContent?.includes('Duration')
    );
    expect(durationDd?.querySelector('dd')?.textContent?.trim()).toBe('Not recorded');
  });

  it('numbers cards by persisted attemptNumber when present', () => {
    // Simulate a retained window that starts at attempt #6 (older ones aged out).
    seed([
      { ...entry(70, 1), attemptNumber: 6 },
      { ...entry(80, 2), attemptNumber: 7 }
    ]);
    const titles = Array.from(
      (render().nativeElement as HTMLElement).querySelectorAll('.ih-card__title')
    ).map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Interview #7', 'Interview #6']);
  });

  it('shows a no-match message when a filter excludes everything', () => {
    seed([entry(70, 1, 'submitted')]);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelectorAll<HTMLButtonElement>('.ih-filter')[2].click(); // Time Expired
    fixture.detectChanges();
    expect(el.querySelector('.interview-history__none')?.textContent).toContain(
      'No interviews match'
    );
  });
});

// History keeps only the newest INTERVIEW_HISTORY_MAX attempts while
// attemptNumber keeps climbing, so once attempts age out the LIFETIME total and
// the number ON FILE diverge. Showing the retained count alone read as a
// miscount ("20" beside an "Interview #25" card). These pin the distinction.
describe('InterviewHistoryComponent — lifetime vs retained counts', () => {
  afterEach(() => localStorage.clear());

  it('shows the lifetime total and notes how many are retained once attempts age out', () => {
    // Attempts 6..25 on file: 20 retained, lifetime total 25.
    const attempts = Array.from({ length: 20 }, (_, i) => ({
      ...entry(80, i),
      id: `att-${i + 6}`,
      attemptNumber: i + 6
    }));
    seed(attempts);

    const fixture = render();
    const comp = fixture.componentInstance;
    expect(comp.retainedCount()).toBe(20);
    expect(comp.lifetimeCount()).toBe(25);
    expect(comp.hasAgedOut()).toBe(true);

    const summary =
      (fixture.nativeElement as HTMLElement).querySelector('.ih-summary')?.textContent ?? '';
    expect(summary).toContain('25');
    expect(summary).toContain('last 20 shown');
  });

  it('shows a bare count with no qualifier when nothing has aged out', () => {
    seed([1, 2, 3].map((n) => ({ ...entry(70, n), id: `att-${n}`, attemptNumber: n })));

    const fixture = render();
    const comp = fixture.componentInstance;
    expect(comp.retainedCount()).toBe(3);
    expect(comp.lifetimeCount()).toBe(3);
    expect(comp.hasAgedOut()).toBe(false);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ih-summary__note')).toBeNull();
  });

  it('falls back to the retained count for legacy entries with no attemptNumber', () => {
    seed([entry(60, 1), entry(70, 2)]); // no attemptNumber field at all

    const comp = render().componentInstance;
    expect(comp.lifetimeCount()).toBe(2);
    expect(comp.hasAgedOut()).toBe(false);
  });
});

/**
 * Angular Aria Toolbar prototype coverage for the interview-history filter
 * (All / Submitted / Time Expired). `filter` remains the ONE authoritative
 * signal — fed in one-way via `[value]="[filter()]"`, reported back via
 * `(valueChange)="onFilterToolbarChange($event)"`.
 */
describe('InterviewHistoryComponent — filter Angular Aria Toolbar prototype', () => {
  async function renderAsync(): Promise<ComponentFixture<InterviewHistoryComponent>> {
    const fixture = render();
    // ngToolbar establishes its default active/roving-tabindex item via
    // afterRenderEffect, which flushes on the next render pass rather than
    // synchronously within the first detectChanges() render() already did.
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function filterButtons(
    fixture: ComponentFixture<InterviewHistoryComponent>
  ): HTMLButtonElement[] {
    return [...fixture.nativeElement.querySelectorAll('.ih-filter')] as HTMLButtonElement[];
  }

  it('only ONE filter button participates in the initial Tab order (native roving tabindex)', async () => {
    seed([entry(70, 1, 'submitted'), entry(50, 2, 'time-expired')]);
    const fixture = await renderAsync();

    const tabbable = filterButtons(fixture).filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });

  it('mouse click on "Submitted" updates filter, aria-pressed, and the displayed cards', async () => {
    seed([entry(70, 1, 'submitted'), entry(50, 2, 'time-expired')]);
    const fixture = await renderAsync();
    const comp = fixture.componentInstance;

    const submittedBtn = filterButtons(fixture).find((b) => b.textContent?.includes('Submitted'))!;
    submittedBtn.click();
    fixture.detectChanges();

    expect(comp.filter()).toBe('submitted');
    expect(submittedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(comp.cards()).toHaveLength(1);
    expect(comp.cards()[0].entry.completionReason).toBe('submitted');
  });

  it('the ngToolbar valueChange path drives the SAME setFilter() a click always has', async () => {
    seed([entry(70, 1, 'submitted')]);
    const fixture = await renderAsync();
    const comp = fixture.componentInstance;
    const spy = jest.spyOn(comp, 'setFilter');

    comp.onFilterToolbarChange(['time-expired']);

    expect(spy).toHaveBeenCalledWith('time-expired');
    expect(comp.filter()).toBe('time-expired');
  });
});

/**
 * Entry focus: opening Interview History focuses its own h1 once (tabindex
 * "-1", never a Tab stop) and scrolls to the top, so Narrator has a real target
 * instead of auto-reading the whole page. (The old `#topic-trends` fragment
 * entry moved with the section: see interview-history-fragment-guard.spec.ts.)
 */
describe('InterviewHistoryComponent — entry focus', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  async function renderEntry(): Promise<ComponentFixture<InterviewHistoryComponent>> {
    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it("focuses this page's own heading once, without adding a Tab stop, and scrolls to top", async () => {
    seed([entry(70, 1), entry(80, 2)]);
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const fixture = await renderEntry();
    const pageHeading = fixture.nativeElement.querySelector('.interview-history__title') as HTMLElement;
    expect(document.activeElement).toBe(pageHeading);
    expect(pageHeading.getAttribute('tabindex')).toBe('-1');
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0 });
    scrollSpy.mockRestore();
  });
});
