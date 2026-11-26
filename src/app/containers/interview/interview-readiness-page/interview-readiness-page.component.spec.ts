import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { InterviewReadiness } from '@shared/models';
import { InterviewReadinessService } from '@shared/services/features/interview/interview-readiness.service';
import { InterviewReadinessPageComponent } from './interview-readiness-page.component';

const READY: InterviewReadiness = {
  status: 'ready',
  score: 84,
  band: 'strong',
  recentPerformance: 86,
  consistency: 78,
  rawConsistency: 90,
  topicCoverage: 70,
  topicStrength: 82,
  coverageAvailable: true,
  practicedTopicCount: 6,
  eligibleTopicCount: 8,
  strongestFactor: 'recent-performance',
  limitingFactor: 'topic-coverage',
  explanation: 'Your recent interview scores are strong.',
  recommendations: ['Review Signals and HTTP.'],
  attemptsUsed: 4,
  totalAttempts: 4
};
const LIMITED: InterviewReadiness = {
  ...READY,
  status: 'insufficient',
  score: 0,
  totalAttempts: 1,
  attemptsUsed: 1,
  recommendations: [],
  explanation: ''
};

describe('InterviewReadinessPageComponent', () => {
  const readiness = signal<InterviewReadiness | null>(READY);
  let fixture: ComponentFixture<InterviewReadinessPageComponent>;

  async function render(value: InterviewReadiness | null): Promise<HTMLElement> {
    readiness.set(value);
    fixture = TestBed.createComponent(InterviewReadinessPageComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [InterviewReadinessPageComponent],
      providers: [
        provideRouter([]),
        { provide: InterviewReadinessService, useValue: { readiness } }
      ]
    })
  );
  afterEach(() => fixture.nativeElement.remove());

  it('has exactly one h1, "Interview Readiness", focused once and never a Tab stop', async () => {
    const el = await render(READY);
    const h1s = el.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    const h1 = h1s[0] as HTMLElement;
    expect(h1.id).toBe('readiness-heading');
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(h1.querySelector('.intro-exposed-text')!.textContent).toBe('Interview Readiness');
    expect(document.activeElement).toBe(h1);
    expect(el.querySelector('h2#readiness-heading')).toBeNull();
  });

  it('renders the full (non-compact) presentation: score, band and the four factor rows', async () => {
    const el = await render(READY);
    expect(el.querySelector('.readiness--compact')).toBeNull();
    expect(el.querySelector('.readiness__score')!.textContent).toContain('84');
    expect(el.querySelectorAll('.readiness__factor')).toHaveLength(4);
    expect(el.querySelector('.readiness__basedon')).not.toBeNull();
  });

  it('adds no landmark of its own: no region, no main (the app shell owns <main>)', async () => {
    const el = await render(READY);
    expect(el.querySelector('section[aria-labelledby], [role="region"], main, [role="main"]')).toBeNull();
  });

  it('reads the summary as one exposed item and keeps the visible text out of AT', async () => {
    const el = await render(READY);
    const summary = el.querySelector('.readiness__summary')!;
    expect(summary.getAttribute('role')).toBe('group');
    expect(summary.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    expect(summary.querySelector('.intro-exposed-text')!.textContent).toContain(
      'Interview readiness score: 84 out of 100. Band: Strong.'
    );
    expect(el.querySelector('.readiness [role="img"]')).toBeNull();
  });

  it('keeps the limited-data state (one completed interview)', async () => {
    const el = await render(LIMITED);
    expect(el.querySelector('.readiness__limited')!.textContent).toContain('at least one more');
    expect(el.querySelector('.readiness__score')).toBeNull();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
  });

  it('keeps an empty state, with its own h1, when there is no history', async () => {
    const el = await render(null);
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('Interview Readiness');
    expect(el.querySelector('[role="status"]')!.textContent).toContain('first Interview Mode');
    expect(el.querySelector('a[href="/interview"]')).not.toBeNull();
    expect(document.activeElement).toBe(el.querySelector('h1'));
  });

  it('gives every navigation link the same bubble class, so none can differ in style', async () => {
    const el = await render(READY);
    const classes = Array.from(el.querySelectorAll('.insight-page__links a')).map((a) => a.className);
    expect(classes.length).toBeGreaterThan(1);
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toBe('insight-btn');
  });

  it('links to Interview History and Topic Trends with native anchors', async () => {
    const el = await render(READY);
    const hrefs = Array.from(el.querySelectorAll('.insight-page__links a')).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual(['/interview/history', '/interview/trends']);
  });
});
