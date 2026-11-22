import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { TopicQuizMetadataService } from '@shared/services/api/topic-quiz-metadata.service';
import { QuizService } from '@shared/services/data/quiz.service';
import { TimerService } from '@shared/services/features/timer/timer.service';
import { API_BASE_URL } from '@shared/tokens/api-base-url.token';

import { StatisticsComponent } from './statistics.component';
import { QuizResourcesComponent } from './quiz-resources/quiz-resources.component';

/**
 * Results → Learning Resources (the dedicated view).
 *
 * The page's own h2 "Learning Resources" comes first; this view then shows the links as an ALWAYS-VISIBLE list (no
 * subtitle, no "Brush up…" toggle, no caret), each one a native link, with real loading / none / could-not-load states.
 * A failed request must NOT look like a quiz that simply has no resources.
 */
const BASE = 'https://api.test/api';
const QUIZ_ID = 'router';
const LINKS = [
  { title: 'Router guide', url: 'https://angular.dev/router', host: 'Angular' },
  { title: 'Router API', url: 'https://angular.dev/api/router', host: 'Angular' }
];

let http: HttpTestingController;
let fixture: ComponentFixture<StatisticsComponent>;

function build(): void {
  TestBed.configureTestingModule({
    imports: [StatisticsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      {
        provide: QuizService,
        useValue: {
          quizId: QUIZ_ID,
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
      { provide: TopicQuizMetadataService, useValue: { load: () => of([]), milestoneFor: () => 'Angular Router' } }
    ]
  });
  http = TestBed.inject(HttpTestingController);
  fixture = TestBed.createComponent(StatisticsComponent);
  fixture.componentRef.setInput('quizId', QUIZ_ID);
  fixture.componentRef.setInput('viewMode', 'resources');
  fixture.detectChanges();
}

const request = () => http.expectOne(`${BASE}/quizzes/${QUIZ_ID}/resources`);
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
// The resource rows are native buttons (not links) that open the destination in a new tab.
const links = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('.resources-view .resources-rows button'));
/** The VISIBLE text of a row link (its aria-hidden <strong>), not the one exposed text phrase. */
const visibleText = (a: HTMLElement): string => a.querySelector('[data-intro-visible]')!.textContent!.replace(/\s+/g, ' ').trim();
/** The ONE exposed phrase of a row link. */
const exposedText = (a: HTMLElement): string => a.querySelector('.resource-exposed')!.textContent!;
const status = (): string => (el().querySelector('.resources-status')?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => http.verify({ ignoreCancelled: true }));

describe('Learning Resources view: always-visible list', () => {
  beforeEach(() => {
    build();
    request().flush({ quizId: QUIZ_ID, resources: LINKS });
    fixture.detectChanges();
  });

  it('shows every link at once, in the API order, with nothing to expand', () => {
    expect(links().map((a) => visibleText(a))).toEqual(['Router guide — Angular', 'Router API — Angular']);
  });

  it('has no subtitle, no "Brush up…" toggle, no caret and no aria-expanded control', () => {
    expect(el().querySelector('.resources-header, .resources-caret, h3, .section-title')).toBeNull();
    expect(el().querySelector('[aria-expanded]')).toBeNull();
    expect(el().textContent).not.toContain('Brush up');
    expect(el().textContent).not.toContain('Use these resources');
  });

  it('every resource is a native, keyboard-reachable type="button" that opens its destination in a new tab (noopener,noreferrer)', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    open.mockClear();
    for (const [i, a] of links().entries()) {
      expect(a.tagName).toBe('BUTTON');
      expect(a.getAttribute('type')).toBe('button');
      expect(a.hasAttribute('href')).toBe(false);
      a.click();
      expect(open).toHaveBeenLastCalledWith(new URL(LINKS[i].url).href, '_blank', 'noopener,noreferrer');
      expect(a.hasAttribute('tabindex')).toBe(false);
      expect(a.hasAttribute('role')).toBe(false);
      expect(a.closest('[aria-hidden="true"], [role="group"], [role="img"]')).toBeNull();
    }
  });

  // Each row link IS the whole visual row. Its visible text (ONE text node, "[Title] — [Source]", inside a <strong>) is
  // aria-hidden, and ONE transparent text node "[Title] [Source]" is exposed and fitted to the link's own box. There is
  // no aria-label or aria-labelledby competing with it.
  it('each row is ONE native link with ONE exposed "[Title] [Source]" phrase and its visible text hidden', () => {
    expect(links().map((a) => visibleText(a))).toEqual(['Router guide — Angular', 'Router API — Angular']);
    expect(links().map((a) => exposedText(a))).toEqual(['Router guide Angular', 'Router API Angular']);
    for (const a of links()) {
      expect(a.hasAttribute('aria-label')).toBe(false);
      expect(a.hasAttribute('aria-labelledby')).toBe(false);
      expect(a.hasAttribute('aria-hidden')).toBe(false); // the link itself stays exposed
      const visible = a.querySelector(':scope > [data-intro-visible]') as HTMLElement;
      expect(visible.getAttribute('aria-hidden')).toBe('true');
      const strong = visible.firstElementChild as HTMLElement;
      expect(strong.hasAttribute('data-intro-font-ref')).toBe(true);
      expect(strong.childNodes).toHaveLength(1);
      expect(strong.firstChild!.nodeType).toBe(3);
      expect(strong.querySelector('*')).toBeNull();
      const exposed = a.querySelector(':scope > .resource-exposed') as HTMLElement;
      expect(exposed.closest('[aria-hidden="true"]')).toBeNull();
      expect(exposed.childNodes).toHaveLength(1);
      expect(exposed.firstChild!.nodeType).toBe(3);
      expect(exposed.getAttribute('exposedTextBox')).toBe('group');
      expect(exposed.hasAttribute('exposedSingleRow')).toBe(true);
    }
  });

  it('the link itself is not hidden, and has no role or tabindex of its own', () => {
    for (const a of links()) {
      expect(a.closest('[aria-hidden="true"]')).toBeNull();
      expect(a.hasAttribute('role')).toBe(false);
      expect(a.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('a resource with no source shows just its title', () => {
    const c = TestBed.createComponent(QuizResourcesComponent);
    c.componentRef.setInput('variant', 'list');
    c.componentRef.setInput('status', 'ready');
    c.componentRef.setInput('resources', [{ title: 'Docs', url: 'https://d.test', host: '' }]);
    c.detectChanges();
    const a = (c.nativeElement as HTMLElement).querySelector('button')!;
    expect(visibleText(a)).toBe('Docs');
    expect(exposedText(a)).toBe('Docs'); // no trailing host
    expect(a.querySelectorAll('strong')).toHaveLength(1);
  });

  it('is a native unordered list of items, each holding exactly one link (no roles, landmarks or extra elements)', () => {
    const view = el().querySelector('.resources-view')!;
    expect(view.querySelectorAll('ol, table, [role], [aria-labelledby]')).toHaveLength(0);
    // no aria-label anywhere in the list: each row's name is its one exposed text phrase
    expect(view.querySelectorAll('.resources-rows [aria-label]')).toHaveLength(0);
    const list = view.querySelector('.resources-list > ul.resources-rows')!;
    expect(list).not.toBeNull();
    const items = Array.from(list.children);
    expect(items.map((c) => c.tagName)).toEqual(['LI', 'LI']);
    for (const li of items) {
      expect(li.classList.contains('resource-item')).toBe(true);
      expect(Array.from(li.children).map((c) => c.tagName)).toEqual(['BUTTON']);
      expect(li.childNodes).toHaveLength(1);
    }
  });

  it('the decorative icon is CSS only: no icon element or text is exposed next to the links', () => {
    const view = el().querySelector('.resources-view')!;
    expect(view.querySelectorAll('mat-icon, i, svg, img, [class*="icon"]')).toHaveLength(0);
    expect(view.textContent).not.toContain('🔗');
  });
});

describe('Learning Resources view: loading, none, could not load', () => {
  it('says it is loading until the request settles', () => {
    build();
    expect(status()).toContain('Loading learning resources');
    expect(el().querySelector('.resources-status')!.getAttribute('role')).toBe('status');
    request().flush({ quizId: QUIZ_ID, resources: LINKS });
    fixture.detectChanges();
    expect(el().querySelector('.resources-status')).toBeNull();
  });

  it('a quiz that genuinely has no resources says so, naming the quiz', () => {
    build();
    request().flush({ quizId: QUIZ_ID, resources: [] });
    fixture.detectChanges();
    expect(status()).toBe('There are no learning resources for Angular Router yet.');
    expect(links()).toHaveLength(0);
    expect(el().querySelector('.resources-retry')).toBeNull();
  });

  it('a FAILED request says it could not be loaded, as an alert with a Try again button (not the empty message)', () => {
    build();
    request().error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(status()).toContain("couldn't be loaded");
    expect(status()).not.toContain('There are no learning resources');
    expect(el().querySelector('.resources-status')!.getAttribute('role')).toBe('alert');
    expect(el().querySelector<HTMLButtonElement>('button.resources-retry')!.type).toBe('button');
  });

  it('Try again requests the resources again and shows the links when it works', () => {
    build();
    request().error(new ProgressEvent('error'));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.resources-retry')!.click();
    fixture.detectChanges();
    expect(status()).toContain('Loading learning resources');
    request().flush({ quizId: QUIZ_ID, resources: LINKS });
    fixture.detectChanges();
    expect(links()).toHaveLength(2);
  });
});
