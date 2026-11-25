import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import type { InterviewAttemptHistoryEntry } from '@shared/models';
import { SK_INTERVIEW_HISTORY } from '@shared/constants/session-keys';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewHistoryComponent } from './interview-history.component';

/**
 * Narrator and the statistics on Interview History.
 *
 * Each statistic (the four summary tiles and the three stats on every
 * Interview # card) is ONE reading stop with its complete phrase, "Label,
 * value". The visible label and value are hidden from assistive technology and
 * a single exposed text item (IntroExposedTextDirective) carries the phrase,
 * laid over the visible label AND value, so it is spoken once and Narrator's
 * box surrounds the whole statistic. The visible markup is unchanged.
 *
 * jsdom has no layout, so the geometry of the exposed text (where Narrator
 * draws its box) is verified in a real browser; this spec protects the
 * structure and the spoken phrases.
 */

const readinessStub = { readiness: () => null } as unknown as InterviewReadinessService;

function entry(
  pct: number,
  i: number,
  extra: Partial<InterviewAttemptHistoryEntry> = {}
): InterviewAttemptHistoryEntry {
  return {
    id: `att-${i}`,
    completedAt: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
    score: pct,
    totalQuestions: 100,
    percentage: pct,
    completionReason: 'submitted',
    durationSeconds: 1471, // 24 minutes 31 seconds
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms'],
    topicPerformance: [
      { topicId: 'forms', topicName: 'Forms', correct: pct, total: 100, percentage: pct }
    ],
    ...extra
  };
}

function seed(attempts: InterviewAttemptHistoryEntry[]): void {
  localStorage.setItem(SK_INTERVIEW_HISTORY, JSON.stringify({ version: 2, attempts }));
}

function render(): ComponentFixture<InterviewHistoryComponent> {
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
  return fixture;
}

const root = (f: ComponentFixture<InterviewHistoryComponent>): HTMLElement =>
  f.nativeElement as HTMLElement;
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The text a screen reader can reach: everything NOT under aria-hidden. */
function accessibleText(el: Element): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if ((node as Element).getAttribute('aria-hidden') === 'true') return;
    node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return norm(out);
}

/** A statistic's group: role="group" holding the hidden visible markup + ONE exposed item. */
function exposed(group: Element): string {
  const items = group.querySelectorAll(':scope > .intro-exposed-text');
  expect(items).toHaveLength(1);
  return norm(items[0]!.textContent);
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('summary statistics', () => {
  beforeEach(() => seed([entry(70, 1), entry(90, 2), entry(84, 3)]));

  const groups = (f: ComponentFixture<InterviewHistoryComponent>): Element[] =>
    Array.from(root(f).querySelectorAll('.ih-summary > [role="group"]'));

  it('is four groups, each exposing ONE complete "Label, value" phrase', () => {
    const f = render();
    expect(groups(f).map(exposed)).toEqual([
      'Completed Interviews, 3',
      'Best Score, 90%',
      'Average Score, 81%',
      'Latest Score, 84%'
    ]);
  });

  it('hides the visible label and value from AT, so nothing is read twice', () => {
    const f = render();
    for (const group of groups(f)) {
      const visible = group.querySelector(':scope > [data-intro-visible]')!;
      expect(visible.getAttribute('aria-hidden')).toBe('true');
      expect(visible.querySelector('dt')).not.toBeNull();
      expect(visible.querySelector('dd')).not.toBeNull();
      // the only text a screen reader reaches in the tile is the one phrase
      expect(accessibleText(group)).toBe(exposed(group));
    }
  });

  it('reads each phrase once in the whole summary, with no separate label or value stop', () => {
    const f = render();
    const summary = root(f).querySelector('.ih-summary')!;
    const text = accessibleText(summary);
    for (const phrase of ['Completed Interviews, 3', 'Best Score, 90%', 'Average Score, 81%', 'Latest Score, 84%']) {
      expect(text.split(phrase)).toHaveLength(2); // exactly one occurrence
    }
    // the bare label/value of a tile is not reachable on its own
    expect(Array.from(summary.querySelectorAll('dt, dd')).every((n) => n.closest('[aria-hidden="true"]'))).toBe(true);
  });

  it('keeps the visible labels and values exactly as before', () => {
    const f = render();
    const dts = Array.from(root(f).querySelectorAll('.ih-summary dt')).map((n) => norm(n.textContent));
    const dds = Array.from(root(f).querySelectorAll('.ih-summary dd')).map((n) => norm(n.textContent));
    expect(dts).toEqual(['Completed Interviews', 'Best Score', 'Average Score', 'Latest Score']);
    expect(dds).toEqual(['3', '90%', '81%', '84%']);
  });

  it('is not announced as a named list, and keeps the reading order of the four statistics', () => {
    const f = render();
    const summary = root(f).querySelector('.ih-summary')!;
    // "Interview History Summary List" was spoken before the first statistic and said
    // nothing the statistics do not: no name, and no list role
    expect(summary.getAttribute('role')).toBe('none');
    expect(summary.hasAttribute('aria-label')).toBe(false);
    expect(summary.hasAttribute('aria-labelledby')).toBe(false);
    expect(groups(f).map((g) => norm(g.querySelector('dt')!.textContent))).toEqual([
      'Completed Interviews',
      'Best Score',
      'Average Score',
      'Latest Score'
    ]);
  });

  it('says how many are shown when older attempts have aged out, in the same phrase', () => {
    // 20 retained, but the lifetime attempt numbers reach 25
    seed(Array.from({ length: 20 }, (_, k) => entry(50 + k, k + 1, { attemptNumber: k + 6 })));
    const f = render();
    expect(exposed(groups(f)[0]!)).toBe('Completed Interviews, 25, last 20 shown');
    // the visible note is still there, and still hidden from AT with the rest of the tile
    const note = root(f).querySelector('.ih-summary__note')!;
    expect(norm(note.textContent)).toBe('· last 20 shown');
    expect(note.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('has no icon, live region or extra focusable item inside the statistics', () => {
    const f = render();
    const summary = root(f).querySelector('.ih-summary')!;
    expect(summary.querySelector('mat-icon, svg, img, i')).toBeNull();
    expect(summary.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(summary.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });

  it('keeps the exposed text out of sight and out of the way', () => {
    const f = render();
    const host = groups(f)[1]!.querySelector<HTMLElement>(':scope > .intro-exposed-text')!;
    expect(host.style.position).toBe('absolute');
    expect(host.style.color).toBe('transparent');
    expect(host.style.pointerEvents).toBe('none');
    expect(host.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('statistics on each Interview # card', () => {
  const cards = (f: ComponentFixture<InterviewHistoryComponent>): Element[] =>
    Array.from(root(f).querySelectorAll('.ih-card'));
  const statGroups = (card: Element): Element[] =>
    Array.from(card.querySelectorAll('.ih-card__stats > [role="group"]'));

  it('is three groups per card, each exposing ONE complete phrase, newest card first', () => {
    seed([
      entry(70, 1, { durationSeconds: 61, configuredDifficulty: 'easy' }),
      entry(90, 2)
    ]);
    const f = render();
    const [newest, oldest] = cards(f);
    expect(statGroups(newest!).map(exposed)).toEqual([
      'Score: 90 out of 100, 90%',
      'Duration: 24 minutes 31 seconds',
      'Difficulty: Mixed'
    ]);
    expect(statGroups(oldest!).map(exposed)).toEqual([
      'Score: 70 out of 100, 70%',
      'Duration: 1 minute 1 second',
      'Difficulty: Easy'
    ]);
  });

  it('hides each visible label and value, and reads nothing twice', () => {
    seed([entry(70, 1), entry(90, 2)]);
    const f = render();
    for (const card of cards(f)) {
      for (const group of statGroups(card)) {
        const visible = group.querySelector(':scope > [data-intro-visible]')!;
        expect(visible.getAttribute('aria-hidden')).toBe('true');
        expect(accessibleText(group)).toBe(exposed(group));
      }
      const stats = card.querySelector('.ih-card__stats')!;
      expect(Array.from(stats.querySelectorAll('dt, dd')).every((n) => n.closest('[aria-hidden="true"]'))).toBe(true);
    }
  });

  it('keeps the visible stats exactly as before, including the percentage beside the score', () => {
    seed([entry(90, 1)]);
    const f = render();
    const card = cards(f)[0]!;
    expect(Array.from(card.querySelectorAll('.ih-card__stats dt')).map((n) => norm(n.textContent))).toEqual([
      'Score',
      'Duration',
      'Difficulty'
    ]);
    const dds = Array.from(card.querySelectorAll('.ih-card__stats dd')).map((n) => norm(n.textContent));
    expect(dds).toEqual(['90 / 100 90%', '24m 31s', 'Mixed']);
    expect(card.querySelector('.ih-card__pct')!.textContent).toContain('90%');
  });

  it('speaks a missing duration as "Not recorded", never as a time', () => {
    seed([entry(80, 1, { durationSeconds: undefined })]);
    const f = render();
    expect(statGroups(cards(f)[0]!).map(exposed)[1]).toBe('Duration: Not recorded');
  });

  it('speaks durations as words: hours, singular units and zero seconds', () => {
    seed([entry(70, 1, { durationSeconds: 3725 }), entry(70, 2, { durationSeconds: 120 }), entry(70, 3, { durationSeconds: 5 })]);
    const f = render();
    const phrases = cards(f).map((c) => statGroups(c).map(exposed)[1]);
    // newest first: 5 s, 120 s, 3725 s
    expect(phrases).toEqual([
      'Duration: 5 seconds',
      'Duration: 2 minutes',
      'Duration: 1 hour 2 minutes 5 seconds'
    ]);
  });

  it('follows the filter: the phrases always belong to the cards that are shown', () => {
    seed([
      entry(60, 1, { completionReason: 'time-expired' }),
      entry(80, 2),
      entry(95, 3)
    ]);
    const f = render();
    root(f).querySelectorAll<HTMLButtonElement>('.ih-filter')[2]!.click();
    f.detectChanges();
    const shown = cards(f);
    expect(shown).toHaveLength(1);
    expect(statGroups(shown[0]!).map(exposed)[0]).toBe('Score: 60 out of 100, 60%');
  });

  it('keeps the reading order inside a card: title, kind, date, statistics, then topics and actions', () => {
    seed([entry(90, 1)]);
    const f = render();
    const card = cards(f)[0]!;
    const order = ['.ih-card__title', '.ih-card__kind', '.ih-card__date', '.ih-card__stats', '.ih-card__topics', '.ih-card__actions'];
    const nodes = order.map((sel) => card.querySelector(sel)!);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('adds no icon, live region or focusable item to the card statistics', () => {
    seed([entry(90, 1)]);
    const f = render();
    const stats = cards(f)[0]!.querySelector('.ih-card__stats')!;
    expect(stats.querySelector('mat-icon, svg, img, i')).toBeNull();
    expect(stats.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(stats.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });
});

describe('the rest of the page is untouched', () => {
  it('still puts the summary before the filters and the list, and keeps the filter buttons', () => {
    seed([entry(70, 1), entry(90, 2)]);
    const f = render();
    const summary = root(f).querySelector('.ih-summary')!;
    const list = root(f).querySelector('.interview-history__interviews')!;
    expect(summary.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root(f).querySelectorAll('.ih-filter')).toHaveLength(3);
  });

  it('keeps one page heading and the card titles as headings', () => {
    seed([entry(70, 1), entry(90, 2)]);
    const f = render();
    expect(root(f).querySelectorAll('h1')).toHaveLength(1);
    expect(Array.from(root(f).querySelectorAll('.ih-card__title')).map((n) => norm(n.textContent))).toEqual([
      'Interview #2',
      'Interview #1'
    ]);
  });
});
