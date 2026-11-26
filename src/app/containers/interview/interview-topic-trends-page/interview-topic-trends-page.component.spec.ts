import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import {
  InterviewAttemptHistoryEntry,
  InterviewTopicHistoryEntry,
  InterviewTopicTrendsResult
} from '@shared/models';
import {
  InterviewTopicTrendsService,
  calculateTopicTrends
} from '@shared/services/features/interview/interview-topic-trends.service';
import { InterviewTopicTrendsPageComponent } from './interview-topic-trends-page.component';

function tp(topicId: string, correct: number, total: number): InterviewTopicHistoryEntry {
  return {
    topicId,
    topicName: topicId,
    correct,
    total,
    percentage: Math.round((correct / total) * 100)
  };
}
function att(i: number, topics: InterviewTopicHistoryEntry[]): InterviewAttemptHistoryEntry {
  return {
    id: `a${i}`,
    attemptNumber: i + 1,
    completedAt: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
    score: 50,
    totalQuestions: 10,
    percentage: 50,
    completionReason: 'submitted',
    selectedTopicIds: topics.map((t) => t.topicId),
    topicPerformance: topics
  };
}

// Signals improves 50 → 60; Router holds steady.
const MULTI = calculateTopicTrends([
  att(0, [tp('Signals', 5, 10), tp('Router', 8, 10)]),
  att(1, [tp('Signals', 6, 10), tp('Router', 8, 10)])
]);
const NO_TOPICS = calculateTopicTrends([att(0, [])]);

describe('InterviewTopicTrendsPageComponent', () => {
  const trends = signal<InterviewTopicTrendsResult>(MULTI);
  let fixture: ComponentFixture<InterviewTopicTrendsPageComponent>;

  async function render(value: InterviewTopicTrendsResult): Promise<HTMLElement> {
    trends.set(value);
    fixture = TestBed.createComponent(InterviewTopicTrendsPageComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [InterviewTopicTrendsPageComponent],
      providers: [provideRouter([]), { provide: InterviewTopicTrendsService, useValue: { trends } }]
    })
  );
  afterEach(() => fixture.nativeElement.remove());

  it('has exactly one h1, "Topic Trends", focused once and never a Tab stop', async () => {
    const el = await render(MULTI);
    const h1s = el.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    const h1 = h1s[0] as HTMLElement;
    expect(h1.id).toBe('topic-trends-heading');
    expect(h1.textContent!.trim()).toBe('Topic Trends');
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(h1);
    expect(el.querySelector('h2#topic-trends-heading')).toBeNull();
  });

  it('renders the content at once: no deferred placeholder, no landmark of its own', async () => {
    const el = await render(MULTI);
    expect(el.querySelector('.ih-trends-placeholder, [aria-busy="true"]')).toBeNull();
    expect(el.querySelectorAll('.tt-card')).toHaveLength(2);
    expect(el.querySelector('section[aria-labelledby], [role="region"], main, [role="main"]')).toBeNull();
  });

  it('reads each summary statistic as one "label, value" phrase', async () => {
    const el = await render(MULTI);
    const phrases = Array.from(el.querySelectorAll('.tt-summary .intro-exposed-text')).map((e) =>
      e.textContent!.replace(/\s+/g, ' ').trim()
    );
    expect(phrases).toEqual([
      'Topics Tracked, 2',
      'Improving, 1',
      'Holding Steady, 1',
      'Needs Attention, 1'
    ]);
    expect(el.querySelector('.tt-summary')!.getAttribute('role')).toBe('none');
  });

  it('filters topics and expands a card with View Details', async () => {
    const el = await render(MULTI);
    const filters = Array.from(el.querySelectorAll<HTMLButtonElement>('.tt-filter'));
    filters.find((b) => b.textContent!.includes('Improving'))!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tt-card')).toHaveLength(1);
    const toggle = el.querySelector<HTMLButtonElement>('.tt-card__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('.tt-card__toggle')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the empty state (no topic-level history) under the same h1', async () => {
    const el = await render(NO_TOPICS);
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('.topic-trends__empty')!.textContent).toContain('not available');
    expect(el.querySelectorAll('.tt-card')).toHaveLength(0);
  });

  it('gives every navigation link the same bubble class, so none can differ in style', async () => {
    const el = await render(MULTI);
    const classes = Array.from(el.querySelectorAll('.insight-page__links a')).map((a) => a.className);
    expect(classes.length).toBeGreaterThan(1);
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toBe('insight-btn');
  });

  it('links to Interview History and Interview Readiness with native anchors', async () => {
    const el = await render(MULTI);
    const hrefs = Array.from(el.querySelectorAll('.insight-page__links a')).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual(['/interview/history', '/interview/readiness']);
  });
});
