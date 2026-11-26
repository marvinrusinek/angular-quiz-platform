import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';

import { QuizDifficultyFilterComponent } from './quiz-difficulty-filter.component';
import type { DifficultyFilter } from '@shared/models';

/**
 * The difficulty FILTER is a compact NATIVE select: "All Difficulties",
 * "Beginner", "Intermediate", "Advanced". It is presentational — it shows the
 * value it is given and emits the new one; the parent owns the state and does the
 * filtering. Keyboard and screen-reader behaviour come from the native select
 * itself (combobox semantics, arrow keys, type-ahead), so these tests check the
 * name, the options and values, the shown selection and the emitted change rather
 * than re-implementing any of it. Narrator behaviour is verified by hand.
 *
 * Wording is asserted as literals on purpose, so a copy change fails here.
 */
describe('QuizDifficultyFilterComponent', () => {
  let fixture: ComponentFixture<QuizDifficultyFilterComponent>;
  let emitted: DifficultyFilter[];

  function render(value: DifficultyFilter = 'all'): void {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(QuizDifficultyFilterComponent);
    emitted = [];
    fixture.componentInstance.difficultyChange.subscribe((v) => emitted.push(v));
    fixture.componentRef.setInput('difficulty', value);
    fixture.detectChanges();
  }

  const select = (): HTMLSelectElement => fixture.nativeElement.querySelector('select')!;
  const options = (): HTMLOptionElement[] => Array.from(select().options);
  const text = (e: Element): string => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
  const shown = (): string => text(select().options[select().selectedIndex]);

  /** Choose an option the way the browser reports it: set the value, then fire "change". */
  function choose(value: DifficultyFilter): void {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  describe('what the control shows', () => {
    it.each([
      ['all', 'All Difficulties'],
      ['beginner', 'Beginner'],
      ['intermediate', 'Intermediate'],
      ['advanced', 'Advanced']
    ] as const)(
      'shows "%s" as the text "%s" — the selection is conveyed in words, not by colour',
      (value, label) => {
        render(value);

        expect(select().value).toBe(value);
        expect(shown()).toBe(label);
      }
    );

    it('offers exactly the four options, with their labels and values, in order', () => {
      render();

      expect(options().map((o) => [text(o), o.value])).toEqual([
        ['All Difficulties', 'all'],
        ['Beginner', 'beginner'],
        ['Intermediate', 'intermediate'],
        ['Advanced', 'advanced']
      ]);
    });

    it('marks the current option as the selected one', () => {
      render('intermediate');

      expect(options().map((o) => [text(o), o.selected])).toEqual([
        ['All Difficulties', false],
        ['Beginner', false],
        ['Intermediate', true],
        ['Advanced', false]
      ]);
    });

    it('follows the value it is given', () => {
      render('beginner');
      fixture.componentRef.setInput('difficulty', 'advanced');
      fixture.detectChanges();

      expect(select().value).toBe('advanced');
      expect(shown()).toBe('Advanced');
    });
  });

  describe('accessibility (native select semantics)', () => {
    it('is a native, single-choice select with the accessible name "Filter quizzes by difficulty", and no custom role', () => {
      render();

      expect(select().tagName).toBe('SELECT');
      expect(select().multiple).toBe(false);
      expect(select().getAttribute('aria-label')).toBe('Filter quizzes by difficulty');
      expect(select().hasAttribute('role')).toBe(false);
      expect(fixture.nativeElement.querySelector('mat-select, mat-option')).toBeNull();
    });

    it('is in the tab order and can take focus', () => {
      render();

      expect(select().tabIndex).toBe(0);
      select().focus();
      expect(document.activeElement).toBe(select());
    });
  });

  describe('tooltip and accessible name', () => {
    const TIP = 'Filter quizzes by difficulty';
    const tooltip = (): MatTooltip =>
      fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);

    it.each(['all', 'beginner', 'intermediate', 'advanced'] as const)(
      'the tooltip is "Filter quizzes by difficulty" when "%s" is selected — it never varies with the selection',
      (value) => {
        render(value);
        expect(tooltip().message).toBe(TIP);
      }
    );

    it('the tooltip does not change as the selection changes', () => {
      render('all');
      const seen: string[] = [tooltip().message];
      for (const next of ['beginner', 'intermediate', 'advanced', 'all'] as const) {
        fixture.componentRef.setInput('difficulty', next);
        fixture.detectChanges();
        seen.push(tooltip().message);
      }
      expect(new Set(seen)).toEqual(new Set([TIP]));
    });

    it('the accessible name is the same fixed text, so the tooltip is not announced as a second description', () => {
      render('beginner');
      expect(select().getAttribute('aria-label')).toBe(TIP);
      expect(select().getAttribute('aria-describedby') ?? '').not.toContain('cdk-describedby');
    });

    it('the tooltip steps aside when the select is pressed (the native list opens over it)', () => {
      render('all');
      const hide = jest.spyOn(tooltip(), 'hide');

      select().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('what is DISPLAYED is the current filter, never the tooltip text or a "Quiz Difficulties" placeholder', () => {
      render();

      expect(shown()).toBe('All Difficulties');
      expect(shown()).not.toBe(TIP);
      expect(fixture.nativeElement.textContent).not.toContain('Quiz Difficulties');
    });
  });

  describe('choosing a difficulty', () => {
    it.each([
      ['Beginner', 'beginner'],
      ['Intermediate', 'intermediate'],
      ['Advanced', 'advanced'],
      ['All Difficulties', 'all']
    ] as const)('picking "%s" emits "%s" — and only that', (_label, value) => {
      render(value === 'all' ? 'advanced' : 'all'); // start somewhere that makes the pick a change

      choose(value);

      expect(emitted).toEqual([value]);
    });

    it('emits nothing until the user chooses (rendering and re-rendering are silent)', () => {
      render('beginner');
      fixture.componentRef.setInput('difficulty', 'advanced');
      fixture.detectChanges();

      expect(emitted).toEqual([]);
      expect(shown()).toBe('Advanced');
    });
  });
});
