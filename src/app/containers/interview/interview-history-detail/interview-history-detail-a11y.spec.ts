import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideApiBaseUrl } from '@shared/tokens/api-base-url.token';

import { InterviewAttemptHistoryEntry } from '@shared/models';
import { SK_INTERVIEW_HISTORY } from '@shared/constants/session-keys';
import { InterviewHistoryDetailComponent } from './interview-history-detail.component';

function entry(over: Partial<InterviewAttemptHistoryEntry> = {}): InterviewAttemptHistoryEntry {
  return {
    id: 'a1',
    attemptNumber: 90,
    completedAt: '2026-11-18T10:00:00.000Z',
    score: 10,
    totalQuestions: 10,
    percentage: 100,
    completionReason: 'submitted',
    durationSeconds: 905,
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms'],
    topicPerformance: [{ topicId: 'forms', topicName: 'Forms', correct: 3, total: 3, percentage: 100 }],
    ...over
  };
}

function render(
  over: Partial<InterviewAttemptHistoryEntry> = {},
  fragment: string | null = null
): HTMLElement {
  localStorage.setItem(
    SK_INTERVIEW_HISTORY,
    JSON.stringify({ version: 2, attempts: [entry(over)] })
  );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InterviewHistoryDetailComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id: 'a1' })), snapshot: { fragment } }
      },
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiBaseUrl('http://test.local/api')
    ]
  });
  const fixture: ComponentFixture<InterviewHistoryDetailComponent> =
    TestBed.createComponent(InterviewHistoryDetailComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  TestBed.inject(ApplicationRef).tick();
  return fixture.nativeElement as HTMLElement;
}

const exposed = (root: Element): string[] =>
  Array.from(root.querySelectorAll('.intro-exposed-text')).map((e) =>
    (e.textContent ?? '').replace(/\s+/g, ' ').trim()
  );

describe('InterviewHistoryDetailComponent — Narrator reading stops', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('has one native h1 with the plain visible text "Interview #90"', () => {
    const h1s = render().querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent!.trim()).toBe('Interview #90');
    expect(h1s[0].querySelector('.intro-exposed-text')).toBeNull();
  });

  it('shows the date as plain text: no <time> element to be announced as "Time"', () => {
    const el = render();
    expect(el.querySelector('time')).toBeNull();
    expect(el.querySelector('.ihd__date-text')!.textContent!.trim()).toMatch(/2026/);
    // the read-only status is still its own meaningful stop
    expect(el.querySelector('.ihd__readonly')!.getAttribute('role')).toBe('status');
  });

  it('reads the score summary as one phrase: "100 percent, 10 out of 10 correct"', () => {
    const el = render();
    const hero = el.querySelector('.score-hero')!;
    expect(hero.getAttribute('role')).toBe('group');
    expect(hero.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    expect(hero.querySelector('.intro-exposed-text')!.textContent).toBe(
      '100 percent, 10 out of 10 correct'
    );
    expect(hero.querySelector('[role="img"], img, svg')).toBeNull();
  });

  it('uses dynamic values in the score phrase', () => {
    const el = render({ score: 7, totalQuestions: 12, percentage: 58 });
    expect(el.querySelector('.score-hero .intro-exposed-text')!.textContent).toBe(
      '58 percent, 7 out of 12 correct'
    );
  });

  it('makes each statistic its own "Label, value" stop, with no list position', () => {
    const el = render();
    const dl = el.querySelector('.ihd-stats')!;
    expect(dl.getAttribute('role')).toBe('none');
    const groups = Array.from(dl.querySelectorAll(':scope > [role="group"]'));
    expect(groups).toHaveLength(6);
    expect(exposed(dl)).toEqual([
      'Questions, 10',
      'Correct, 10',
      'Incorrect, 0',
      'Duration, 15 minutes 5 seconds',
      'Difficulty, Mixed',
      'Completion, Submitted'
    ]);
    for (const g of groups) {
      expect(g.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
      expect(g.querySelectorAll('.intro-exposed-text')).toHaveLength(1);
    }
  });

  it('speaks durations in full words and reports a missing duration honestly', () => {
    expect(exposed(render({ durationSeconds: 3725 }).querySelector('.ihd-stats')!)[3]).toBe(
      'Duration, 1 hour 2 minutes 5 seconds'
    );
    expect(exposed(render({ durationSeconds: undefined }).querySelector('.ihd-stats')!)[3]).toBe(
      'Duration, Not recorded'
    );
  });

  it('says "Time expired" for an interview that ran out of time', () => {
    const el = render({ completionReason: 'time-expired' });
    expect(exposed(el.querySelector('.ihd-stats')!)[5]).toBe('Completion, Time expired');
  });


  it('keeps "Viewing Interview" as the plain eyebrow line (the verified structure)', () => {
    const eyebrow = render().querySelector('.ihd__eyebrow')!;
    expect(eyebrow.tagName).toBe('P');
    expect(eyebrow.textContent!.trim()).toBe('Viewing Interview');
    expect(eyebrow.querySelector('.intro-exposed-text')).toBeNull();
  });
});
