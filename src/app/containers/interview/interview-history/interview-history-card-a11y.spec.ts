import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import type {
  InterviewAttemptHistoryEntry,
  InterviewCompletionReason
} from '@shared/models';
import { SK_INTERVIEW_HISTORY } from '@shared/constants/session-keys';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewHistoryComponent } from './interview-history.component';

/**
 * Narrator inside one Interview # card.
 *
 *  - HEADING. The title and the status badge are ONE heading stop, "Interview
 *    number 90, Submitted" ("#" is spoken as "hashtag"); the visible "Interview
 *    #90" and the badge are unchanged.
 *  - META. The interview type and the date are ONE stop, "Custom Interview,
 *    November 18, 2026".
 *  - POSITION. A listitem is announced with its place ("1 of 20"). The list and
 *    its items carry role="none", so the cards are not a list to Narrator; they
 *    are reached by their headings.
 *  - ORDER and STOPS. heading + status, type + date, then ONE stop for each
 *    statistic ("Score: ..."), ONE for the topics ("Topics: Forms, HTTP"), then
 *    the View Summary button.
 *  - BUTTON. View Summary is a native button named "View Summary", not a link
 *    labelled with the interview.
 */

const readinessStub = { readiness: () => null } as unknown as InterviewReadinessService;

function entry(
  number: number,
  reason: InterviewCompletionReason = 'submitted',
  extra: Partial<InterviewAttemptHistoryEntry> = {}
): InterviewAttemptHistoryEntry {
  return {
    id: `att-${number}`,
    attemptNumber: number,
    completedAt: '2026-11-18T12:00:00.000Z',
    score: 88,
    totalQuestions: 100,
    percentage: 88,
    completionReason: reason,
    durationSeconds: 1471,
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms', 'http'],
    topicPerformance: [
      { topicId: 'forms', topicName: 'Forms', correct: 88, total: 100, percentage: 88 },
      { topicId: 'http', topicName: 'HTTP', correct: 88, total: 100, percentage: 88 }
    ],
    ...extra
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
const cards = (f: ComponentFixture<InterviewHistoryComponent>): HTMLElement[] =>
  Array.from(root(f).querySelectorAll<HTMLElement>('.ih-card'));

/** What a screen reader stops on inside an element, in order (hidden subtrees skipped). */
function readingStops(el: Element): string[] {
  const stops: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = norm(node.textContent);
      if (text) stops.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as Element;
    if (e.getAttribute('aria-hidden') === 'true') return;
    if (e.tagName === 'BUTTON' || e.tagName === 'A') {
      stops.push(e.getAttribute('aria-label') ?? norm(e.textContent));
      return;
    }
    e.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return stops;
}

/** All text a screen reader can reach inside an element (hidden subtrees skipped). */
function accessibleTextOf(el: Element): string {
  return readingStops(el).join(' ');
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('card heading and status', () => {
  const exposedOf = (card: Element): string[] =>
    Array.from(card.querySelectorAll('h2 > .intro-exposed-text')).map((n) => norm(n.textContent));

  it('is ONE heading phrase, "Interview number N, Status", for each card', async () => {
    seed([entry(88, 'time-expired'), entry(89), entry(90)]); // oldest first in storage
    const f = await render();
    expect(cards(f).map((c) => exposedOf(c)[0])).toEqual([
      'Interview number 90, Submitted',
      'Interview number 89, Submitted',
      'Interview number 88, Time expired'
    ]);
  });

  it('keeps the visible title with its "#" and the visible status badge, hidden from AT', async () => {
    seed([entry(89, 'time-expired'), entry(90)]);
    const f = await render();
    const card = cards(f)[1]!; // the Time expired card
    const visible = card.querySelector('h2 > [data-intro-visible]')!;
    expect(visible.getAttribute('aria-hidden')).toBe('true');
    expect(norm(visible.querySelector('.ih-card__title')!.textContent)).toBe('Interview #89');
    expect(norm(visible.querySelector('.ih-card__badge')!.textContent)).toBe('Time expired');
    expect(visible.querySelector('.ih-card__badge')!.classList.contains('ih-card__badge--expired')).toBe(true);
  });

  it('is a real level-2 heading, one per card, with ONE accessible text item and no label', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    expect(root(f).querySelectorAll('h1')).toHaveLength(1);
    for (const card of cards(f)) {
      const headings = card.querySelectorAll('h2');
      expect(headings).toHaveLength(1);
      expect(headings[0]!.hasAttribute('aria-label')).toBe(false);
      expect(headings[0]!.querySelectorAll(':scope > .intro-exposed-text')).toHaveLength(1);
      expect(accessibleTextOf(headings[0]!)).toBe(exposedOf(card)[0]);
    }
    expect(f.componentInstance.headingPhrase(entry(7), 7)).toBe('Interview number 7, Submitted');
  });

  it('does not repeat the status anywhere else in the card\u2019s reading', async () => {
    seed([entry(6, 'time-expired')]);
    const f = await render();
    const text = readingStops(cards(f)[0]!).join(' | ');
    expect(text.split('Time expired')).toHaveLength(2);
  });
});

describe('no position announcement', () => {
  it('removes list semantics from the card list and its items', async () => {
    seed([entry(3), entry(2), entry(1)]);
    const f = await render();
    const list = root(f).querySelector('ul.ih-list')!;
    expect(list.getAttribute('role')).toBe('none');
    const items = Array.from(list.children);
    expect(items).toHaveLength(3);
    expect(items.every((li) => li.tagName === 'LI' && li.getAttribute('role') === 'none')).toBe(true);
    expect(root(f).querySelector('.ih-card [aria-posinset], .ih-card [aria-setsize]')).toBeNull();
  });

  it('keeps the cards reachable by heading, and nothing is hidden from AT', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    for (const card of cards(f)) {
      expect(card.closest('[aria-hidden="true"]')).toBeNull();
      expect(card.querySelector('h2')!.closest('[aria-hidden="true"]')).toBeNull();
    }
  });
});

describe('reading order and stops', () => {
  it('is heading + status, type + date, score, duration, difficulty, topics, View Summary', async () => {
    seed([entry(90)]);
    const f = await render();
    expect(readingStops(cards(f)[0]!)).toEqual([
      'Interview number 90, Submitted',
      'Custom Interview, November 18, 2026',
      'Score: 88 out of 100, 88%',
      'Duration: 24 minutes 31 seconds',
      'Difficulty: Mixed',
      'Topics: Forms, HTTP',
      'View Summary'
    ]);
  });

  it('keeps the Time Expired status in the first stop, in the same place', async () => {
    seed([entry(5, 'time-expired')]);
    const f = await render();
    expect(readingStops(cards(f)[0]!)[0]).toBe('Interview number 5, Time expired');
  });

  it('makes the type and the date ONE stop, before the statistics, with the date as plain text', async () => {
    seed([entry(4), entry(3, 'submitted', { presetId: 'frontend', presetName: 'Frontend Developer', configKind: 'preset' })]);
    const f = await render();
    const [newer, older] = cards(f);
    for (const [card, phrase] of [
      [newer!, 'Frontend Developer, November 18, 2026'],
      [older!, 'Custom Interview, November 18, 2026']
    ] as const) {
      const group = card.querySelector('.ih-card__meta')!;
      expect(group.getAttribute('role')).toBe('group');
      expect(group.querySelectorAll(':scope > .intro-exposed-text')).toHaveLength(1);
      expect(norm(group.querySelector(':scope > .intro-exposed-text')!.textContent)).toBe(phrase);
      const visible = group.querySelector(':scope > [data-intro-visible]')!;
      expect(visible.getAttribute('aria-hidden')).toBe('true');
      expect(visible.querySelector('p.ih-card__date')!.childNodes).toHaveLength(1);
      expect(group.querySelector('time')).toBeNull();
      expect(group.nextElementSibling!.classList.contains('ih-card__stats')).toBe(true);
    }
  });

  it('keeps the visible type and date lines exactly as they were', async () => {
    seed([entry(4)]);
    const f = await render();
    const card = cards(f)[0]!;
    expect(norm(card.querySelector('.ih-card__kind')!.textContent)).toBe('Custom Interview');
    expect(norm(card.querySelector('.ih-card__date')!.textContent)).toBe('November 18, 2026');
  });

  it('uses a colon between each statistic’s label and value', async () => {
    seed([entry(4)]);
    const f = await render();
    const phrases = Array.from(
      cards(f)[0]!.querySelectorAll('.ih-card__stats > [role="group"] > .intro-exposed-text')
    ).map((n) => norm(n.textContent));
    expect(phrases).toEqual([
      'Score: 88 out of 100, 88%',
      'Duration: 24 minutes 31 seconds',
      'Difficulty: Mixed'
    ]);
    expect(phrases.every((p) => /^[A-Za-z]+: /.test(p))).toBe(true);
  });

  it('adds no live region, timer-based pause or extra group name inside a card', async () => {
    seed([entry(4)]);
    const f = await render();
    const card = cards(f)[0]!;
    expect(card.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(card.querySelectorAll('[role="group"][aria-label], [role="group"][aria-labelledby]')).toHaveLength(0);
  });
});

describe('topics', () => {
  it('are ONE stop that carries the label and every topic name', async () => {
    seed([entry(4, 'submitted', {
      topicPerformance: [
        { topicId: 'a', topicName: 'Forms', correct: 1, total: 2, percentage: 50 },
        { topicId: 'b', topicName: 'HTTP', correct: 1, total: 2, percentage: 50 },
        { topicId: 'c', topicName: 'Router', correct: 1, total: 2, percentage: 50 }
      ]
    })]);
    const f = await render();
    const block = cards(f)[0]!.querySelector('.ih-card__topics')!;
    const exposed = block.querySelectorAll(':scope > .intro-exposed-text');
    expect(exposed).toHaveLength(1);
    expect(norm(exposed[0]!.textContent)).toBe('Topics: Forms, HTTP, Router');
  });

  it('hide the visible label and chips from AT, so no list or "n of 3" is read', async () => {
    seed([entry(4)]);
    const f = await render();
    const block = cards(f)[0]!.querySelector('.ih-card__topics')!;
    const visible = block.querySelector(':scope > [data-intro-visible]')!;
    expect(visible.getAttribute('aria-hidden')).toBe('true');
    expect(visible.querySelector('.ih-card__topics-label')!.textContent).toContain('Topics');
    expect(Array.from(visible.querySelectorAll('.ih-card__topic')).map((n) => norm(n.textContent))).toEqual([
      'Forms',
      'HTTP'
    ]);
  });

  it('are left out entirely when the attempt has none', async () => {
    seed([entry(4, 'submitted', { topicPerformance: [], selectedTopicIds: [] })]);
    const f = await render();
    expect(cards(f)[0]!.querySelector('.ih-card__topics')).toBeNull();
  });
});

describe('View Summary', () => {
  it('is a native button named exactly "View Summary", without a longer label', async () => {
    seed([entry(90)]);
    const f = await render();
    const button = cards(f)[0]!.querySelector<HTMLButtonElement>('.ih-card__actions button')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(norm(button.textContent)).toBe('View Summary');
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('role')).toBe(false);
    expect(cards(f)[0]!.querySelector('.ih-card__actions a[href*="/interview/history/"]')).toBeNull();
  });

  it('still opens that attempt’s summary, from a click', async () => {
    seed([entry(89), entry(90)]);
    const f = await render();
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    cards(f)[1]!.querySelector<HTMLButtonElement>('.ih-card__actions button')!.click();
    expect(String(navigate.mock.calls[0]![0])).toBe('/interview/history/att-89');
  });

  it('is a normal Tab stop: natively focusable, enabled, not taken out of the order', async () => {
    seed([entry(90)]);
    const f = await render();
    const button = cards(f)[0]!.querySelector<HTMLButtonElement>('.ih-card__actions button')!;
    // RouterLink writes tabindex="0" on a non-link element: the same as a native stop
    expect(button.tabIndex).toBe(0);
    expect(button.disabled).toBe(false);
  });
});

describe('the interviews section', () => {
  const section = (f: ComponentFixture<InterviewHistoryComponent>): Element =>
    root(f).querySelector('section.interview-history__interviews')!;

  it('is not a landmark: no label, no region role, so no "region" announcement', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    const el = section(f);
    expect(el).not.toBeNull();
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('aria-labelledby')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
    // scoped to this section: Topic Trends and Readiness keep their own labelled regions
    expect(el.querySelector('[role="region"], section[aria-label], section[aria-labelledby]')).toBeNull();
  });

  it('adds no heading, off-screen text or id of its own: it starts with the filters', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    const el = section(f);
    expect(el.hasAttribute('id')).toBe(false);
    expect(el.querySelector('.ih-sr-only')).toBeNull();
    expect(el.textContent).not.toContain('Your Interviews');
    expect(el.firstElementChild!.classList.contains('ih-filters-toolbar')).toBe(true);
  });

  it('has no Jump to Interviews link anywhere on the page', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    expect(root(f).querySelector('.ih-jump-link, .interview-history__jump')).toBeNull();
    expect(norm(root(f).textContent)).not.toContain('Jump to Interviews');
  });

  it('keeps the page heading first, then the card headings', async () => {
    seed([entry(1), entry(2)]); // stored oldest first, shown newest first
    const f = await render();
    expect(root(f).querySelectorAll('h1')).toHaveLength(1);
    const titles = Array.from(section(f).querySelectorAll('h2')).map((h) => accessibleTextOf(h));
    expect(titles).toEqual([
      'Interview number 2, Submitted',
      'Interview number 1, Submitted'
    ]);
  });
});

describe('earlier fixes are untouched', () => {
  it('keeps the top summary phrases, the filter buttons and no embedded Topic Trends', async () => {
    seed([entry(2), entry(1)]);
    const f = await render();
    const summary = Array.from(
      root(f).querySelectorAll('.ih-summary > [role="group"] > .intro-exposed-text')
    ).map((n) => norm(n.textContent));
    expect(summary[0]).toBe('Completed Interviews, 2');
    expect(root(f).querySelectorAll('.ih-filter[aria-pressed]')).toHaveLength(3);
    expect(root(f).querySelector('#topic-trends')).toBeNull();
  });
});
