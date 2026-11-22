import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizResourcesComponent } from './quiz-resources.component';
import type { Resource } from '@shared/models';

/**
 * The "Brush up your knowledge" panel.
 *
 * Presentational only — it renders whatever list it is given, which since S3
 * comes from `GET /api/quizzes/:quizId/resources` instead of the `resources`
 * block of `assets/data/quiz.json`. The panel itself did not change; these
 * tests pin the contract the new source has to satisfy, most importantly that
 * ORDER IS THE LIST'S OWN and the panel never reorders it.
 */

const RESOURCES: Resource[] = [
  { title: 'Angular docs', url: 'https://angular.dev', host: 'Angular website' },
  { title: 'RxJS docs', url: 'https://rxjs.dev', host: 'RxJS website' },
  { title: 'A third link', url: 'https://example.test/three', host: '' }
];

let fixture: ComponentFixture<QuizResourcesComponent>;

function render(resources: Resource[], milestone = 'Angular Router') {
  fixture = TestBed.createComponent(QuizResourcesComponent);
  fixture.componentRef.setInput('resources', resources);
  fixture.componentRef.setInput('milestoneName', milestone);
  fixture.detectChanges();
  TestBed.tick();
  return fixture;
}

/** The panel starts collapsed, so open it before asserting on the list. */
function expand() {
  fixture.nativeElement.querySelector('.resources-header').click();
  fixture.detectChanges();
  TestBed.tick();
}

const items = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('li'));

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [QuizResourcesComponent] }).compileComponents();
});

describe('rendering API-sourced resources', () => {
  it('renders every resource it is given', () => {
    render(RESOURCES);
    expand();
    expect(items()).toHaveLength(3);
  });

  it('PRESERVES THE GIVEN ORDER', () => {
    render(RESOURCES);
    expand();
    expect(items().map((li) => li.querySelector('.resource-title')!.textContent!.trim())).toEqual([
      'Angular docs',
      'RxJS docs',
      'A third link'
    ]);
  });

  // Each row is a native type="button" that opens the destination in a new tab (like the GitHub button).
  it('each row is a button that opens its resource url in a new tab with noopener,noreferrer', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    open.mockClear();
    render(RESOURCES);
    expand();
    const button = items()[0]!.querySelector('button')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('href')).toBe(false);
    button.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://angular.dev/', '_blank', 'noopener,noreferrer');
  });

  it('never opens a non-http(s) destination', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    open.mockClear();
    render([{ title: 'Bad', url: 'javascript:alert(1)', host: '' } as any]);
    expand();
    items()[0]!.querySelector('button')!.click();
    expect(open).not.toHaveBeenCalled();
  });

  it('shows the host attribution', () => {
    render(RESOURCES);
    expand();
    expect(items()[1]!.querySelector('.resource-host')!.textContent).toContain('RxJS website');
  });

  it('names each row link with its title and optional host exactly once', () => {
    render(RESOURCES);
    expand();

    const names = items().map((li) => {
      const link = li.querySelector('button')!;
      expect(link.hasAttribute('aria-label')).toBe(false);
      expect(link.hasAttribute('aria-labelledby')).toBe(false);
      expect(link.hasAttribute('role')).toBe(false);
      expect(link.hasAttribute('tabindex')).toBe(false);
      expect(link.hasAttribute('aria-hidden')).toBe(false);
      expect(li.querySelectorAll('a, button, input, select')).toHaveLength(1);
      expect(li.querySelector('a')).toBeNull(); // a button, not a link
      const visible = link.querySelector('[data-intro-visible]')!;
      expect(visible.getAttribute('aria-hidden')).toBe('true');
      const exposed = link.querySelector('.resource-exposed')!;
      expect(exposed.parentElement).toBe(link);
      expect(exposed.closest('[aria-hidden="true"]')).toBeNull();
      expect(exposed.childNodes).toHaveLength(1);
      expect(exposed.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(exposed.getAttribute('exposedTextBox')).toBe('group');
      expect(exposed.hasAttribute('exposedSingleRow')).toBe(true);
      return exposed.textContent;
    });

    expect(names).toEqual(['Angular docs Angular website', 'RxJS docs RxJS website', 'A third link']);
    expect(items()[2].querySelector('.resource-host')).toBeNull();
  });

  it('updates the link name and destination when its resource changes', () => {
    render(RESOURCES);
    expand();
    fixture.componentRef.setInput('resources', [
      { title: 'New title', url: 'https://example.test/new', host: 'New host' }
    ]);
    fixture.detectChanges();
    TestBed.tick();

    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    open.mockClear();
    const link = items()[0].querySelector('button')!;
    expect(link.querySelector('.resource-exposed')!.textContent).toBe('New title New host');
    link.click();
    expect(open).toHaveBeenCalledWith('https://example.test/new', '_blank', 'noopener,noreferrer');
  });

  it('takes the milestone name from the quiz, not from the resource list', () => {
    // The API resources payload carries no milestone; the panel is given one by
    // its parent, from quiz metadata. Nothing here should need the API to
    // supply it.
    render(RESOURCES, 'Angular Forms');
    expect(fixture.nativeElement.textContent).toContain('Angular Forms');
  });
});

describe('a quiz with no resources', () => {
  it('renders no list items', () => {
    // The ordinary state for most quizzes, and also what the service yields
    // when the API is unreachable — the panel cannot tell the two apart, which
    // is the point.
    render([]);
    expand();
    expect(items()).toHaveLength(0);
  });

  it('does not throw when the list is empty', () => {
    expect(() => {
      render([]);
      expand();
    }).not.toThrow();
  });
});
