import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StatisticsComponent } from './statistics.component';
import { TopicQuizMetadataService } from '@shared/services/api/topic-quiz-metadata.service';
import { QuizService } from '@shared/services/data/quiz.service';
import { TimerService } from '@shared/services/features/timer/timer.service';
import { API_BASE_URL } from '@shared/tokens/api-base-url.token';

/**
 * THE LEARNING RESOURCES LOAD (rxResource over the existing service).
 *
 * What this protects, against the INSTALLED runtime (not an assumption about it):
 *  - no quiz id: no request, and the normal empty UI;
 *  - a different quiz id cancels the request for the previous one, and that request's late response is never shown;
 *  - Try again is `reload()`, shows the loading state first, and is ignored while a load is already running;
 *  - destroying the component cancels the request;
 *  - the existing contracts hold: a failure is an alert with a retry, an empty or malformed body is the empty state.
 */

const BASE = 'https://api.test/api';
const url = (id: string): string => `${BASE}/quizzes/${id}/resources`;
const LINKS = [
  { title: 'Router guide', url: 'https://angular.dev/router', host: 'Angular' },
  { title: 'Router API', url: 'https://angular.dev/api/router', host: 'Angular' }
];

let http: HttpTestingController;
let fixture: ComponentFixture<StatisticsComponent>;

function build(opts: { inputId?: string; serviceId?: string } = {}): void {
  TestBed.configureTestingModule({
    imports: [StatisticsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      {
        provide: QuizService,
        useValue: {
          quizId: opts.serviceId ?? opts.inputId ?? '',
          totalQuestions: () => 5,
          correctAnswersCountSig: signal(3),
          getFinalResultSnapshot: () => null,
          patchFinalResultCompletionTime: () => undefined,
          setQuizStatus: () => undefined
        }
      },
      {
        provide: TimerService,
        useValue: {
          calculateTotalElapsedTime: () => 42,
          completionTime: 42,
          elapsedTimes: [10, 10, 10, 12],
          getDurableCompletionTime: () => 42,
          setDurableCompletionTime: () => undefined,
          isCountdown: () => false,
          timePerQuestion: 30
        }
      },
      {
        provide: TopicQuizMetadataService,
        useValue: { load: () => of([]), milestoneFor: (id: string) => id }
      }
    ]
  });
  http = TestBed.inject(HttpTestingController);
  fixture = TestBed.createComponent(StatisticsComponent);
  if (opts.inputId !== undefined) fixture.componentRef.setInput('quizId', opts.inputId);
  fixture.componentRef.setInput('viewMode', 'resources');
  fixture.detectChanges();
}

/**
 * Let the reactive graph and the resource's microtasks run. `whenStable()` is deliberately NOT used: while a request is
 * pending the resource holds a pending task, so the app is (correctly) not stable until the response is flushed.
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
const status = (): string => (el().querySelector('.resources-status')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const titles = (): string[] =>
  Array.from(el().querySelectorAll('.resources-rows .resource-visible')).map((n) => n.textContent!.replace(/\s+/g, ' ').trim());
const retryButton = (): HTMLButtonElement | null => el().querySelector<HTMLButtonElement>('button.resources-retry');
const comp = (): StatisticsComponent => fixture.componentInstance;

afterEach(() => {
  http.verify({ ignoreCancelled: true });
  localStorage.removeItem('quizId');
});

describe('an empty quiz id', () => {
  it('makes NO request and shows the normal empty state, not a loading spinner or an alert', async () => {
    localStorage.removeItem('quizId');
    build({ inputId: '', serviceId: '' });
    await settle();

    http.expectNone((r) => r.url.includes('/resources'));
    expect(comp().resourcesStatus()).toBe('ready');
    expect(comp().resources()).toEqual([]);
    expect(retryButton()).toBeNull();
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });
});

describe('the quiz id lifecycle', () => {
  it('uses the service quiz id when no input id is given (the existing fallback), with a single request', async () => {
    build({ serviceId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();
    expect(titles()).toEqual(['Router guide — Angular', 'Router API — Angular']);
  });

  it('requests for an id given ONLY as the input (the service has none)', async () => {
    build({ inputId: 'router', serviceId: '' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();
    expect(titles()).toHaveLength(2);
  });

  it('re-emitting the SAME id does not request again (it used to fetch on every re-init)', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();

    fixture.componentRef.setInput('quizId', 'router');
    await settle();
    http.expectNone(url('router'));
    expect(titles()).toHaveLength(2);
  });

  it('a DIFFERENT id cancels the first request, and the first quiz response is never shown', async () => {
    build({ inputId: 'router' });
    await settle();
    const first = http.expectOne(url('router'));
    expect(first.cancelled).toBe(false);

    fixture.componentRef.setInput('quizId', 'signals');
    await settle();
    // the installed runtime unsubscribed the in-flight request
    expect(first.cancelled).toBe(true);
    const second = http.expectOne(url('signals'));
    expect(status()).toContain('Loading learning resources');
    expect(titles()).toEqual([]);

    // a late response for the cancelled request is ignored, whatever it carried
    if (!first.cancelled) first.flush({ quizId: 'router', resources: LINKS });
    await settle();
    expect(titles()).toEqual([]);
    expect(comp().resources()).toEqual([]);

    second.flush({ quizId: 'signals', resources: [{ title: 'Signals guide', url: 'https://angular.dev/signals', host: 'Angular' }] });
    await settle();
    expect(titles()).toEqual(['Signals guide — Angular']);
  });

  it('never shows the previous quiz’s links while the next quiz is loading', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();
    expect(titles()).toHaveLength(2);

    fixture.componentRef.setInput('quizId', 'signals');
    await settle();
    expect(comp().resources()).toEqual([]);
    expect(titles()).toEqual([]);
    expect(comp().resourcesStatus()).toBe('loading');
    http.expectOne(url('signals'));
  });

  it('clearing the id never leaves stale links behind', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();

    comp().quizId.set('');
    await settle();
    expect(comp().resourcesStatus()).toBe('ready');
    expect(comp().resources()).toEqual([]);
  });
});

describe('existing result contracts', () => {
  it('a FAILED request is the alert with a Try again button, never the empty message', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(comp().resourcesStatus()).toBe('failed');
    expect(el().querySelector('.resources-status')!.getAttribute('role')).toBe('alert');
    expect(status()).toContain("couldn't be loaded");
    expect(status()).not.toContain('no learning resources');
    expect(retryButton()).not.toBeNull();
    expect(comp().resources()).toEqual([]);
  });

  it('an EMPTY list is the empty state, not an alert', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: [] });
    await settle();
    expect(comp().resourcesStatus()).toBe('ready');
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(retryButton()).toBeNull();
    expect(titles()).toEqual([]);
  });

  it('a MALFORMED body (not the expected shape) is the empty state, exactly as before, not an alert', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({ nonsense: true });
    await settle();
    expect(comp().resourcesStatus()).toBe('ready');
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(titles()).toEqual([]);
  });

  it('malformed ITEMS are dropped and the rest are shown, in server order', async () => {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush({
      resources: [{ title: 'Good', url: 'https://a.test', host: 'A' }, { title: '', url: 'https://b.test' }, null, { title: 'No url' }]
    });
    await settle();
    expect(titles()).toEqual(['Good — A']);
  });
});

describe('Try again', () => {
  async function failFirst(): Promise<void> {
    build({ inputId: 'router' });
    await settle();
    http.expectOne(url('router')).flush('boom', { status: 503, statusText: 'Unavailable' });
    await settle();
  }

  it('shows the loading state first, then the links, with exactly one new request', async () => {
    await failFirst();
    retryButton()!.click();
    await settle();

    expect(status()).toContain('Loading learning resources');
    expect(el().querySelector('.resources-status')!.getAttribute('role')).toBe('status');
    expect(retryButton()).toBeNull();
    http.expectOne(url('router')).flush({ quizId: 'router', resources: LINKS });
    await settle();
    expect(titles()).toHaveLength(2);
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });

  it('can fail again and be retried again', async () => {
    await failFirst();
    retryButton()!.click();
    await settle();
    http.expectOne(url('router')).flush('boom', { status: 500, statusText: 'x' });
    await settle();
    expect(comp().resourcesStatus()).toBe('failed');

    retryButton()!.click();
    await settle();
    http.expectOne(url('router')).flush({ resources: LINKS });
    await settle();
    expect(titles()).toHaveLength(2);
  });

  it('is ignored while a load is already running: no second request', async () => {
    await failFirst();
    retryButton()!.click();
    await settle();
    const pending = http.expectOne(url('router'));

    comp().retryResources(); // e.g. a double activation
    comp().retryResources();
    await settle();
    http.expectNone(url('router'));
    expect(pending.cancelled).toBe(false);
    expect(comp().resourcesStatus()).toBe('loading');

    pending.flush({ resources: LINKS });
    await settle();
    expect(titles()).toHaveLength(2);
  });

  it('while reloading, the earlier FAILED result is not shown as current', async () => {
    await failFirst();
    retryButton()!.click();
    await settle();
    expect(comp().resourcesStatus()).toBe('loading');
    expect(el().querySelector('[role="alert"]')).toBeNull();
    http.expectOne(url('router'));
  });
});

describe('destruction', () => {
  it('cancels an in-flight request', async () => {
    build({ inputId: 'router' });
    await settle();
    const pending = http.expectOne(url('router'));
    expect(pending.cancelled).toBe(false);

    fixture.destroy();
    expect(pending.cancelled).toBe(true);
  });

  it('leaves nothing to apply after a late response', async () => {
    build({ inputId: 'router' });
    await settle();
    const pending = http.expectOne(url('router'));
    fixture.destroy();
    expect(() => {
      if (!pending.cancelled) pending.flush({ resources: LINKS });
    }).not.toThrow();
  });
});
