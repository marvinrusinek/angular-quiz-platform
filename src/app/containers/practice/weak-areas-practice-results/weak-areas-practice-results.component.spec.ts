import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { WeakAreasPracticeResultsComponent } from './weak-areas-practice-results.component';
import { PracticeSessionService } from '@shared/services/features/practice/practice-session.service';
import { WeakAreasService } from '@shared/services/progress/weak-areas.service';
import { PracticeResult } from '@shared/models';

const RESULT: PracticeResult = {
  sessionId: 'wap_test',
  completedAt: '2026-08-01T10:00:00.000Z',
  total: 3,
  answered: 2,
  unanswered: 1,
  correct: 1,
  incorrect: 2,
  percentage: 33,
  perTopic: [
    { topicId: 'rxjs', topicName: 'RxJS', correct: 1, total: 2, percentage: 50 },
    { topicId: 'signals', topicName: 'Signals', correct: 0, total: 1, percentage: 0 }
  ],
  review: [
    {
      index: 0,
      questionText: 'What is a subject?',
      topicId: 'rxjs',
      topicName: 'RxJS',
      selectedTexts: ['A multicast observable'],
      correctTexts: ['A multicast observable'],
      answered: true,
      isCorrect: true,
      explanation: 'CORRECT-FET'
    },
    {
      index: 1,
      questionText: 'Pick two operators',
      topicId: 'rxjs',
      topicName: 'RxJS',
      selectedTexts: ['map'],
      correctTexts: ['map', 'filter'],
      answered: true,
      isCorrect: false,
      explanation: 'PARTIAL-FET'
    },
    {
      index: 2,
      questionText: 'Signals are?',
      topicId: 'signals',
      topicName: 'Signals',
      selectedTexts: [],
      correctTexts: ['Reactive primitives'],
      answered: false,
      isCorrect: false,
      explanation: 'SKIPPED-FET'
    }
  ]
};

function makeStubs(options: { practiceAgainSucceeds?: boolean; hasWeak?: boolean } = {}) {
  const session = {
    result: signal<PracticeResult | null>(RESULT),
    ensureRecorded: jest.fn(),
    // The real method returns Promise<boolean>; a synchronous stub hid the bug
    // where the component treated the (always-truthy) Promise as the answer.
    practiceAgain: jest.fn(() => Promise.resolve(options.practiceAgainSucceeds !== false)),
    clear: jest.fn()
  };
  const weakAreas = { hasWeakTopics: signal(options.hasWeak !== false) };
  return { session, weakAreas };
}

type Stubs = ReturnType<typeof makeStubs>;

function mount(stubs: Stubs): ComponentFixture<WeakAreasPracticeResultsComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WeakAreasPracticeResultsComponent],
    providers: [
      provideRouter([]),
      { provide: PracticeSessionService, useValue: stubs.session },
      { provide: WeakAreasService, useValue: stubs.weakAreas }
    ]
  });
  const fixture = TestBed.createComponent(WeakAreasPracticeResultsComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<WeakAreasPracticeResultsComponent>): string {
  return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
}

describe('WeakAreasPracticeResultsComponent — overall score', () => {
  it('shows the percentage alongside the raw counts', () => {
    const fixture = mount(makeStubs());
    const body = text(fixture);
    expect(body).toContain('33%');
    expect(body).toContain('1 of 3 correct');
  });

  it('reports unanswered questions', () => {
    const fixture = mount(makeStubs());
    expect(text(fixture)).toContain('1 left unanswered');
  });

  it('omits the unanswered note when everything was answered', () => {
    const stubs = makeStubs();
    stubs.session.result.set({ ...RESULT, unanswered: 0 });
    const fixture = mount(stubs);
    expect(text(fixture)).not.toContain('left unanswered');
  });
});

describe('WeakAreasPracticeResultsComponent — per-topic breakdown', () => {
  it('lists each topic with its raw counts and percentage', () => {
    const fixture = mount(makeStubs());
    const rows = [...fixture.nativeElement.querySelectorAll('.wapr__topic')] as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('RxJS');
    expect(rows[0].textContent).toContain('1/2');
    expect(rows[0].textContent).toContain('50%');
    expect(rows[1].textContent).toContain('Signals');
    expect(rows[1].textContent).toContain('0%');
  });
});

describe('WeakAreasPracticeResultsComponent — Answer Review', () => {
  it('renders one entry per question', () => {
    const fixture = mount(makeStubs());
    expect(fixture.nativeElement.querySelectorAll('.wapr__entry').length).toBe(3);
  });

  it('shows the question, its source topic and the result as TEXT', () => {
    const fixture = mount(makeStubs());
    const entries = [...fixture.nativeElement.querySelectorAll('.wapr__entry')] as HTMLElement[];

    expect(entries[0].textContent).toContain('What is a subject?');
    expect(entries[0].textContent).toContain('RxJS');
    expect(entries[0].textContent).toContain('Correct');

    expect(entries[1].textContent).toContain('Incorrect');
    expect(entries[2].textContent).toContain('Not answered');
  });

  it('shows the user selection and the COMPLETE correct set', () => {
    const fixture = mount(makeStubs());
    const partial = fixture.nativeElement.querySelectorAll('.wapr__entry')[1] as HTMLElement;
    const body = partial.textContent!.replace(/\s+/g, ' ');
    expect(body).toContain('Your answer');
    expect(body).toContain('map');
    expect(body).toContain('Correct answer');
    expect(body).toContain('filter'); // the missing half of a partial answer
  });

  it('states "No answer selected" for a skipped question', () => {
    const fixture = mount(makeStubs());
    const skipped = fixture.nativeElement.querySelectorAll('.wapr__entry')[2] as HTMLElement;
    expect(skipped.textContent).toContain('No answer selected');
  });

  it('shows the explanation for INCORRECT answers — the FET withheld during play', () => {
    const fixture = mount(makeStubs());
    const body = text(fixture);
    expect(body).toContain('PARTIAL-FET');
    expect(body).toContain('SKIPPED-FET');
    expect(body).toContain('CORRECT-FET');
  });
});

describe('WeakAreasPracticeResultsComponent — recording', () => {
  it('ensures the attempt is recorded on mount', () => {
    const stubs = makeStubs();
    mount(stubs);
    expect(stubs.session.ensureRecorded).toHaveBeenCalledTimes(1);
  });

  it('a REMOUNT calls the idempotent recorder again rather than a second write path', () => {
    const stubs = makeStubs();
    mount(stubs);
    mount(stubs);
    // Two mounts, two idempotent calls — dedup lives in the history service,
    // keyed by attemptId against persisted state.
    expect(stubs.session.ensureRecorded).toHaveBeenCalledTimes(2);
  });
});

describe('WeakAreasPracticeResultsComponent — Practice Again', () => {
  it('starts a new session and navigates when weak topics remain', async () => {
    const stubs = makeStubs({ practiceAgainSucceeds: true });
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.practiceAgain();

    expect(stubs.session.practiceAgain).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/practice/weak-areas']);
    expect(fixture.componentInstance.noWeakAreasRemaining()).toBe(false);
  });

  it('shows "No weak areas detected" instead of starting an empty session', async () => {
    const stubs = makeStubs({ practiceAgainSucceeds: false });
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.practiceAgain();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('No weak areas detected');
  });

  it('offers Back to Quizzes from the no-weak-areas state, and hides Practice Again', async () => {
    const stubs = makeStubs({ practiceAgainSucceeds: false });
    const fixture = mount(stubs);
    await fixture.componentInstance.practiceAgain();
    fixture.detectChanges();

    const buttons = [
      ...fixture.nativeElement.querySelectorAll('.wapr__actions button')
    ] as HTMLButtonElement[];
    const labels = buttons.map((b) => b.textContent!.trim());
    expect(labels).toContain('Back to Quizzes');
    expect(labels).not.toContain('Practice Again');
  });
});

describe('WeakAreasPracticeResultsComponent — Practice Again (asynchronous session creation)', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('does not navigate while the session is still being created, then navigates once it exists', async () => {
    const stubs = makeStubs();
    const pending = deferred<boolean>();
    stubs.session.practiceAgain.mockReturnValue(pending.promise);
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const run = fixture.componentInstance.practiceAgain();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled(); // session not created yet

    pending.resolve(true);
    await run;
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/practice/weak-areas']);
  });

  it('a resolved false never navigates and keeps the no-weak-areas state', async () => {
    const stubs = makeStubs({ practiceAgainSucceeds: false });
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.practiceAgain();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.noWeakAreasRemaining()).toBe(true);
  });

  it('rapid repeated activation creates ONE session and ONE navigation', async () => {
    const stubs = makeStubs();
    const pending = deferred<boolean>();
    stubs.session.practiceAgain.mockReturnValue(pending.promise);
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const first = fixture.componentInstance.practiceAgain();
    const second = fixture.componentInstance.practiceAgain();
    const third = fixture.componentInstance.practiceAgain();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.wapr__actions button'
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true); // the UI also refuses while pending

    pending.resolve(true);
    await Promise.all([first, second, third]);

    expect(stubs.session.practiceAgain).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.practiceAgainPending()).toBe(false);
  });

  it('a rejection does not navigate, is not an unhandled rejection, and re-enables the button', async () => {
    const stubs = makeStubs();
    stubs.session.practiceAgain.mockReturnValue(Promise.reject(new Error('boom')));
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await expect(fixture.componentInstance.practiceAgain()).resolves.toBeUndefined();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.noWeakAreasRemaining()).toBe(false);
    expect(fixture.componentInstance.practiceAgainPending()).toBe(false);
    const button = fixture.nativeElement.querySelector(
      '.wapr__actions button'
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe('WeakAreasPracticeResultsComponent — Back to Quizzes', () => {
  it('clears the completed snapshot and replaces the history entry', async () => {
    const stubs = makeStubs();
    const fixture = mount(stubs);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.backToQuizzes();

    expect(stubs.session.clear).toHaveBeenCalled();
    // replaceUrl keeps browser Back from returning to the finished session.
    expect(navigate).toHaveBeenCalledWith(['/quiz'], { replaceUrl: true });
  });
});

/**
 * Narrator: each summary is ONE group. The visible values are hidden from assistive technology and the group
 * exposes ONE text node with the full phrase, built from the same data (see IntroExposedTextDirective).
 */
describe('WeakAreasPracticeResultsComponent — one Narrator stop per summary', () => {
  const exposed = (el: Element): string[] =>
    [...el.querySelectorAll('.intro-exposed-text')].map((e) => e.textContent ?? '');

  it('Your Score: no region landmark, the heading stays, and the score is one phrase', () => {
    const fixture = mount(makeStubs());
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.wapr__score')!.tagName).toBe('DIV');
    expect(root.querySelector('section[aria-labelledby="wapr-score-heading"]')).toBeNull();
    expect(root.querySelector('#wapr-score-heading')!.textContent).toContain('Your Score');
    const group = root.querySelector('.wapr__score-group')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    expect(exposed(group)).toEqual(['33%,\n1 out of 3 correct,\n1 left unanswered']);
  });

  it('Your Score: uses the real values and omits the unanswered line when there are none', () => {
    const stubs = makeStubs();
    stubs.session.result.set({ ...RESULT, total: 10, correct: 10, unanswered: 0, percentage: 100 });
    const fixture = mount(stubs);
    expect(exposed(fixture.nativeElement.querySelector('.wapr__score-group'))).toEqual(['100%,\n10 out of 10 correct']);
  });

  it('By Topic: "RxJS, 1 out of 2, 50%" for every topic, with the visible slash notation kept', () => {
    const fixture = mount(makeStubs());
    const rows = [...fixture.nativeElement.querySelectorAll('.wapr__topic')] as HTMLElement[];
    expect(rows.map((r) => exposed(r))).toEqual([['RxJS, 1 out of 2, 50%'], ['Signals, 0 out of 1, 0%']]);
    const visible = rows[0].querySelector('[data-intro-visible]')!;
    expect(visible.getAttribute('aria-hidden')).toBe('true');
    expect(visible.textContent!.replace(/\s+/g, ' ')).toContain('1/2');
  });

  it('Answer Review: "Question 1, RxJS" is one stop for every question', () => {
    const fixture = mount(makeStubs());
    const metas = [...fixture.nativeElement.querySelectorAll('.wapr__entry-meta')] as HTMLElement[];
    expect(metas.map((m) => exposed(m))).toEqual([['Question 1, RxJS'], ['Question 2, RxJS'], ['Question 3, Signals']]);
    for (const m of metas) {
      expect(m.getAttribute('role')).toBe('group');
      expect(m.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('Answer Review: each answer label and text is one stop, multi-answer and unanswered included', () => {
    const fixture = mount(makeStubs());
    const entries = [...fixture.nativeElement.querySelectorAll('.wapr__entry')] as HTMLElement[];
    const answers = (e: HTMLElement): string[][] => [...e.querySelectorAll('.wapr__answer')].map((a) => exposed(a));
    expect(answers(entries[0])).toEqual([['Your answer:\nA multicast observable'], ['Correct answer:\nA multicast observable']]);
    expect(answers(entries[1])).toEqual([['Your answer:\nmap'], ['Correct answer:\nmap\nfilter']]);
    expect(answers(entries[2])).toEqual([['Your answer:\nNo answer selected'], ['Correct answer:\nReactive primitives']]);
    for (const e of entries) {
      expect(e.querySelector('dl, dt, dd, [role="img"], svg')).toBeNull();
      for (const a of Array.from(e.querySelectorAll('.wapr__answer'))) expect(a.getAttribute('role')).toBe('group');
    }
  });

  it('By Topic: the list and its items carry no list semantics (no "1 of 3" positions)', () => {
    const fixture = mount(makeStubs());
    const list = fixture.nativeElement.querySelector('.wapr__topic-list') as HTMLElement;
    expect(list.getAttribute('role')).toBe('none');
    for (const li of Array.from(list.querySelectorAll('.wapr__topic'))) expect(li.getAttribute('role')).toBe('none');
  });

  it('status pill: Correct, Incorrect and Not answered are each one group with ONE exposed text node, no image role', () => {
    const fixture = mount(makeStubs());
    const pills = [...fixture.nativeElement.querySelectorAll('.wapr__badge')] as HTMLElement[];
    expect(pills.map((p) => exposed(p))).toEqual([['Correct'], ['Incorrect'], ['Not answered']]);
    for (const p of pills) {
      expect(p.getAttribute('role')).toBe('group');
      expect(p.querySelector('[data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
      expect(p.querySelectorAll('.intro-exposed-text')).toHaveLength(1);
      expect(p.querySelector('[role="img"], svg, img')).toBeNull();
    }
    // the visible pill text and its colour classes are unchanged
    expect(pills.map((p) => p.querySelector('[data-intro-visible]')!.textContent!.trim())).toEqual(['Correct', 'Incorrect', 'Not answered']);
    expect(pills.map((p) => p.className)).toEqual([
      'wapr__badge wapr__badge--correct',
      'wapr__badge wapr__badge--incorrect',
      'wapr__badge wapr__badge--skipped'
    ]);
  });

  it('keeps the explanation text exactly as written (no capitalization change)', () => {
    const fixture = mount(makeStubs());
    const exp = [...fixture.nativeElement.querySelectorAll('.wapr__entry-explanation')].map((e) => (e as HTMLElement).textContent!.trim());
    expect(exp).toEqual(['CORRECT-FET', 'PARTIAL-FET', 'SKIPPED-FET']);
  });
});
