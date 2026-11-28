import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { ProgressSummaryComponent } from './progress-summary.component';
import { ProgressSummary } from '@shared/models';
import { WeakAreasService } from '@shared/services/progress/weak-areas.service';
import { PracticeSessionService } from '@shared/services/features/practice/practice-session.service';
import { WeakTopic } from '@shared/utils/weak-areas';

/**
 * Narrator: every row of the Your Progress panel is ONE group and ONE reading stop. The visible label, value and bar are
 * hidden from assistive technology and the group exposes ONE text node with the whole phrase, built from the same data
 * (see IntroExposedTextDirective). The dl elements carry no list semantics (no "1 of 3" positions).
 */
const SUMMARY: ProgressSummary = {
  completedCount: 20,
  totalCount: 20,
  completionPercentage: 100,
  byDifficulty: [
    { difficulty: 'beginner', completed: 6, total: 6 },
    { difficulty: 'intermediate', completed: 8, total: 6 },
    { difficulty: 'advanced', completed: 6, total: 6 }
  ],
  strongestQuiz: { milestone: 'Components', bestScore: 90 },
  weakestQuiz: null,
  averageScore: 85,
  perfectScores: 8,
  questionsCompleted: 148
} as ProgressSummary;

const topic = (id: string, name: string, pct: number): WeakTopic => ({
  topicId: id,
  topicName: name,
  percentage: pct,
  correct: 1,
  incorrect: 1,
  total: 2,
  lastActivityAt: '2026-07-30T00:00:00.000Z'
});

const weakTopics = signal<WeakTopic[]>([]);
const insufficient = signal(false);

function mount(variant: 'full' | 'details' = 'details'): ComponentFixture<ProgressSummaryComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProgressSummaryComponent],
    providers: [
      provideRouter([]),
      {
        provide: WeakAreasService,
        useValue: { weakTopics, hasWeakTopics: signal(true), hasInsufficientData: insufficient, weakTopicIds: signal<string[]>([]) }
      },
      { provide: PracticeSessionService, useValue: { start: jest.fn() } }
    ]
  });
  const fixture = TestBed.createComponent(ProgressSummaryComponent);
  fixture.componentRef.setInput('summary', SUMMARY);
  fixture.componentRef.setInput('variant', variant);
  fixture.detectChanges();
  return fixture;
}

const exposed = (el: Element): string[] => [...el.querySelectorAll('.intro-exposed-text')].map((e) => e.textContent ?? '');

describe('ProgressSummaryComponent — one Narrator stop per row', () => {
  beforeEach(() => {
    weakTopics.set([]);
    insufficient.set(false);
  });

  it('Overall Progress is one phrase, "Overall Progress, 100%", with the bar hidden from assistive technology', () => {
    const el = mount().nativeElement as HTMLElement;
    const row = el.querySelector('.progress-summary__rows:not(.progress-summary__rows--difficulty):not(.progress-summary__rows--highlights) .progress-summary__row')!;
    expect(row.getAttribute('role')).toBe('group');
    expect(exposed(row)).toEqual(['Overall Progress, 100%']);
    expect(row.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    expect(row.querySelector('.progress-summary__bar')!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(row.querySelector('.intro-exposed-text')!.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('each difficulty is one phrase from its own numbers, with no list semantics', () => {
    const el = mount().nativeElement as HTMLElement;
    const list = el.querySelector('.progress-summary__rows--difficulty')!;
    expect(list.getAttribute('role')).toBe('none');
    const rows = [...list.querySelectorAll('.progress-summary__row')];
    expect(rows.map((r) => exposed(r))).toEqual([
      ['Beginner, 6 out of 6'],
      ['Intermediate, 8 out of 6'],
      ['Advanced, 6 out of 6']
    ]);
    for (const r of rows) expect(r.getAttribute('role')).toBe('group');
    // the visible labels, counts and bars are unchanged
    expect(rows.map((r) => r.querySelector('.progress-summary__label')!.textContent!.trim())).toEqual(['Beginner', 'Intermediate', 'Advanced']);
    expect(rows.map((r) => r.querySelector('.progress-summary__count')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['6 / 6', '8 / 6', '6 / 6']);
    expect(rows[0].querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('each key stat is one "Label, value" group', () => {
    const el = mount().nativeElement as HTMLElement;
    const stats = el.querySelector('.progress-summary__stats')!;
    expect(stats.getAttribute('role')).toBe('none');
    expect(stats.hasAttribute('aria-label')).toBe(false);
    const tiles = [...stats.querySelectorAll('.progress-summary__stat')];
    expect(tiles.map((t) => exposed(t))).toEqual([['Average Score, 85%'], ['Perfect Scores, 8'], ['Questions Completed, 148']]);
    for (const t of tiles) {
      expect(t.getAttribute('role')).toBe('group');
      expect(t.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('Strongest is one group: label, quiz name and percentage', () => {
    const el = mount().nativeElement as HTMLElement;
    const row = el.querySelector('.progress-summary__rows--highlights .progress-summary__row')!;
    expect(exposed(row)).toEqual(['Strongest,\nComponents, 90%']);
  });

  it('Needs Review lists every topic with its percentage in one group', () => {
    weakTopics.set([topic('rxjs', 'RxJS', 42.4), topic('signals', 'Signals', 61.1)]);
    const el = mount().nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.progress-summary__rows--highlights .progress-summary__row')];
    const review = rows[rows.length - 1];
    expect(exposed(review)).toEqual(['Needs Review,\nRxJS, 42%;\nSignals, 61%']);
    expect(review.querySelector('.progress-summary__weak-list')!.getAttribute('role')).toBe('none');
    expect([...review.querySelectorAll('li')].map((l) => l.textContent!.trim())).toEqual(['RxJS — 42%', 'Signals — 61%']);
  });

  it('Needs Review with a single quiz has no trailing semicolon', () => {
    weakTopics.set([topic('rxjs', 'RxJS', 42.4)]);
    const el = mount().nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.progress-summary__rows--highlights .progress-summary__row')];
    expect(exposed(rows[rows.length - 1])).toEqual(['Needs Review,\nRxJS, 42%']);
  });

  it('Needs Review empty states read the same message the panel shows', () => {
    insufficient.set(false);
    let el = mount().nativeElement as HTMLElement;
    let rows = [...el.querySelectorAll('.progress-summary__rows--highlights .progress-summary__row')];
    expect(exposed(rows[rows.length - 1])).toEqual(['Needs Review,\nNo weak areas detected.']);

    insufficient.set(true);
    el = mount().nativeElement as HTMLElement;
    rows = [...el.querySelectorAll('.progress-summary__rows--highlights .progress-summary__row')];
    expect(exposed(rows[rows.length - 1])).toEqual(['Needs Review,\nComplete a quiz or interview to identify weak areas.']);
  });

  it('the full variant adds "Completed, n out of m" and keeps its heading', () => {
    const el = mount('full').nativeElement as HTMLElement;
    expect(el.querySelector('.progress-summary__heading')!.textContent).toContain('Your Progress');
    const first = el.querySelector('.progress-summary__rows .progress-summary__row')!;
    expect(exposed(first)).toEqual(['Completed, 20 out of 20']);
  });

  it('uses no image role or graphic for the statistics, and every group has exactly one exposed text node', () => {
    weakTopics.set([topic('rxjs', 'RxJS', 42.4)]);
    const el = mount().nativeElement as HTMLElement;
    expect(el.querySelector('[role="img"], svg, img')).toBeNull();
    for (const g of Array.from(el.querySelectorAll('[role="group"]'))) {
      expect(g.querySelectorAll('.intro-exposed-text')).toHaveLength(1);
      expect(g.querySelector('.intro-exposed-text')!.childNodes).toHaveLength(1);
    }
  });
});
