import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import type {
  InterviewAttemptHistoryEntry,
  InterviewCompletionReason
} from '@shared/models';
import { SK_INTERVIEW_HISTORY } from '@shared/constants/session-keys';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewHistoryComponent } from './interview-history.component';

/**
 * Narrator on the Interview History filters and card dates.
 *
 * FILTERS. They were role="radio" in a radiogroup, so Narrator added a position
 * ("All (20), 1 of 3"). They are now toggle buttons (aria-pressed) in a named
 * group: the label and the selected state are still announced, nothing counts
 * the set. The toolbar's roving tabindex and Arrow keys are unchanged.
 *
 * DATES. A <time> element is exposed with its own "time" role, and Narrator said
 * "Time" instead of the date. The date is now ONE text node in the paragraph.
 */

const readinessStub = { readiness: () => null } as unknown as InterviewReadinessService;

function entry(
  pct: number,
  i: number,
  reason: InterviewCompletionReason = 'submitted',
  completedAt = `2026-11-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`
): InterviewAttemptHistoryEntry {
  return {
    id: `att-${i}`,
    completedAt,
    score: pct,
    totalQuestions: 100,
    percentage: pct,
    completionReason: reason,
    durationSeconds: 600,
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms'],
    topicPerformance: [
      { topicId: 'forms', topicName: 'Forms', correct: pct, total: 100, percentage: pct }
    ]
  };
}

function seed(attempts: InterviewAttemptHistoryEntry[]): void {
  localStorage.setItem(SK_INTERVIEW_HISTORY, JSON.stringify({ version: 2, attempts }));
}

async function render(): Promise<ComponentFixture<InterviewHistoryComponent>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InterviewHistoryComponent],
    providers: [
      provideRouter([]),
      { provide: InterviewReadinessService, useValue: readinessStub },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: null } } }
    ]
  });
  const fixture = TestBed.createComponent(InterviewHistoryComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (f: ComponentFixture<InterviewHistoryComponent>): HTMLElement =>
  f.nativeElement as HTMLElement;
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const buttons = (f: ComponentFixture<InterviewHistoryComponent>): HTMLButtonElement[] =>
  Array.from(root(f).querySelectorAll<HTMLButtonElement>('.ih-filter'));

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('filter controls', () => {
  beforeEach(() =>
    seed([entry(60, 1, 'time-expired'), entry(80, 2), entry(95, 3)])
  );

  it('are three buttons whose names are just the label and the count', async () => {
    const f = await render();
    expect(buttons(f).map((b) => norm(b.textContent))).toEqual([
      'All (3)',
      'Submitted (2)',
      'Time Expired (1)'
    ]);
    expect(buttons(f).every((b) => b.tagName === 'BUTTON' && b.type === 'button')).toBe(true);
  });

  it('are not radios in a radio set, so no position ("1 of 3") is derived', async () => {
    const f = await render();
    const el = root(f);
    expect(el.querySelector('[role="radio"], [role="radiogroup"]')).toBeNull();
    expect(el.querySelector('.ih-filters [aria-posinset], .ih-filters [aria-setsize]')).toBeNull();
    expect(buttons(f).every((b) => !b.hasAttribute('role'))).toBe(true);
    expect(buttons(f).every((b) => !b.hasAttribute('aria-checked'))).toBe(true);
  });

  it('keep a named group around them, and the toolbar', async () => {
    const f = await render();
    const group = root(f).querySelector('.ih-filters')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Filter interviews by completion');
    expect(root(f).querySelector('.ih-filters-toolbar')!.getAttribute('role')).toBe('toolbar');
  });

  it('announce the selected state with aria-pressed, for the active filter only', async () => {
    const f = await render();
    expect(buttons(f).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(buttons(f).map((b) => b.classList.contains('ih-filter--active'))).toEqual([
      true,
      false,
      false
    ]);
  });

  it('move the selected state with a click, and still filter the cards', async () => {
    const f = await render();
    buttons(f)[2]!.click();
    f.detectChanges();

    expect(buttons(f).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(f.componentInstance.filter()).toBe('time-expired');
    expect(root(f).querySelectorAll('.ih-card')).toHaveLength(1);

    buttons(f)[1]!.click();
    f.detectChanges();
    expect(buttons(f).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(root(f).querySelectorAll('.ih-card')).toHaveLength(2);
  });

  it('keep one Tab stop (roving tabindex) and Arrow-key movement', async () => {
    const f = await render();
    expect(buttons(f).filter((b) => b.tabIndex === 0)).toHaveLength(1);

    buttons(f)[0]!.focus();
    buttons(f)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    f.detectChanges();
    expect(buttons(f).filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons(f)[1]!.tabIndex).toBe(0);
    expect(buttons(f)[0]!.tabIndex).toBe(-1);
  });

  it('are in the same place, in the same order, before the cards', async () => {
    const f = await render();
    const toolbar = root(f).querySelector('.ih-filters-toolbar')!;
    const firstCard = root(f).querySelector('.ih-card')!;
    expect(toolbar.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('card dates', () => {
  it('are plain text in the paragraph: no <time> element, no "time" role', async () => {
    seed([entry(70, 1), entry(90, 2)]);
    const f = await render();
    const el = root(f);
    expect(el.querySelector('time, [role="time"]')).toBeNull();
    for (const date of Array.from(el.querySelectorAll('.ih-card__date'))) {
      expect(date.tagName).toBe('P');
      expect(date.children).toHaveLength(0);
    }
  });

  it('are ONE text node holding the whole formatted date', async () => {
    seed([entry(70, 1, 'submitted', '2026-11-18T12:00:00.000Z')]);
    const f = await render();
    const date = root(f).querySelector('.ih-card__date')!;
    expect(date.childNodes).toHaveLength(1);
    expect(date.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(norm(date.textContent)).toBe('November 18, 2026');
  });

  it('still use the locale-formatted date of each entry (newest first)', async () => {
    seed([
      entry(70, 1, 'submitted', '2026-11-12T12:00:00.000Z'),
      entry(80, 2, 'submitted', '2026-11-18T12:00:00.000Z')
    ]);
    const f = await render();
    const expected = ['2026-11-18T12:00:00.000Z', '2026-11-12T12:00:00.000Z'].map((iso) =>
      f.componentInstance.formatDate(iso)
    );
    const shown = Array.from(root(f).querySelectorAll('.ih-card__date')).map((n) =>
      norm(n.textContent)
    );
    expect(shown).toEqual(expected);
    expect(shown).toEqual(['November 18, 2026', 'November 12, 2026']);
  });

  it('keep their place in the card: after the kind, before the statistics', async () => {
    seed([entry(70, 1)]);
    const f = await render();
    const card = root(f).querySelector('.ih-card')!;
    const kind = card.querySelector('.ih-card__kind')!;
    const date = card.querySelector('.ih-card__date')!;
    const stats = card.querySelector('.ih-card__stats')!;
    expect(kind.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the statistics fixes are untouched', () => {
  it('still exposes one phrase per statistic and no embedded Topic Trends', async () => {
    seed([entry(70, 1), entry(90, 2)]);
    const f = await render();
    const phrases = Array.from(
      root(f).querySelectorAll('.ih-summary > [role="group"] > .intro-exposed-text')
    ).map((n) => norm(n.textContent));
    expect(phrases).toHaveLength(4);
    expect(root(f).querySelector('#topic-trends')).toBeNull();
  });
});
