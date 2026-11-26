import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizSearchComponent } from './quiz-search.component';

describe('QuizSearchComponent — visual search hint', () => {
  let fixture: ComponentFixture<QuizSearchComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuizSearchComponent] });
    fixture = TestBed.createComponent(QuizSearchComponent);
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement;
  const input = (): HTMLInputElement => root().querySelector('input')!;
  const hint = (): HTMLElement | null =>
    root().querySelector('.search-placeholder');

  function connectParent(): string[] {
    const emitted: string[] = [];
    fixture.componentInstance.searchTermChange.subscribe((value) => {
      emitted.push(value);
      fixture.componentRef.setInput('searchTerm', value);
    });
    return emitted;
  }

  const nameSpan = (): HTMLElement | null => root().querySelector('span[hidden]');

  it('names the input by aria-labelledby to ONE permanent hidden span, present when empty, typed and cleared', () => {
    const check = (): void => {
      const spans = root().querySelectorAll('span[hidden]');
      expect(spans).toHaveLength(1);
      expect(spans[0].textContent?.trim()).toBe('Search quizzes');
      expect(spans[0].id).not.toBe('');
      expect(input().getAttribute('aria-labelledby')).toBe(spans[0].id);
      expect(input().hasAttribute('aria-label')).toBe(false);
      expect(root().querySelector('label')).toBeNull(); // not a native label/for association
      expect(input().hasAttribute('role')).toBe(false);
    };
    check(); // empty
    fixture.componentRef.setInput('searchTerm', 'signals');
    fixture.detectChanges();
    check(); // populated
    fixture.componentRef.setInput('searchTerm', '');
    fixture.detectChanges();
    check(); // cleared
  });

  it('gives every instance its own naming-span id', () => {
    const other = TestBed.createComponent(QuizSearchComponent);
    other.detectChanges();
    const otherSpan = (other.nativeElement as HTMLElement).querySelector('span[hidden]')!;
    expect(otherSpan.id).not.toBe(nameSpan()!.id);
    other.destroy();
  });

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('keeps an editable input named Search quizzes and a decorative hint', () => {
    expect(input().type).toBe('text');
    expect(input().hasAttribute('aria-label')).toBe(false);
    expect(input().getAttribute('aria-labelledby')).toBe(nameSpan()!.id);
    expect(nameSpan()?.textContent?.trim()).toBe('Search quizzes');
    expect(input().hasAttribute('placeholder')).toBe(false);
    expect(input().hasAttribute('aria-placeholder')).toBe(false);
    expect(input().readOnly).toBe(false);
    expect(input().disabled).toBe(false);
    expect(hint()?.textContent).toBe('Search quizzes…');
    expect(hint()?.getAttribute('aria-hidden')).toBe('true');
    expect(hint()?.hasAttribute('tabindex')).toBe(false);
  });

  it('emits the exact typed text and removes the hint while populated', () => {
    const emitted = connectParent();
    type('angular f');
    expect(emitted).toEqual(['angular f']);
    expect(input().value).toBe('angular f');
    expect(hint()).toBeNull();
    expect(root().querySelector('.clear-btn')).not.toBeNull();
  });

  it('clears through the existing output and restores the visual hint', () => {
    const emitted = connectParent();
    type('angular');
    (root().querySelector('.clear-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(emitted).toEqual(['angular', '']);
    expect(input().value).toBe('');
    expect(hint()?.textContent).toBe('Search quizzes…');
    expect(root().querySelector('.clear-btn')).toBeNull();
  });

  it('handles restored and externally cleared values without typing', () => {
    fixture.componentRef.setInput('searchTerm', 'signals');
    fixture.detectChanges();
    expect(input().value).toBe('signals');
    expect(hint()).toBeNull();
    fixture.componentRef.setInput('searchTerm', '');
    fixture.detectChanges();
    expect(input().value).toBe('');
    expect(hint()?.textContent).toBe('Search quizzes…');
  });

  it('supports custom and empty hints without changing the input name', () => {
    fixture.componentRef.setInput('placeholder', 'Find a topic…');
    fixture.detectChanges();
    expect(hint()?.textContent).toBe('Find a topic…');
    expect(nameSpan()?.textContent?.trim()).toBe('Search quizzes');
    fixture.componentRef.setInput('placeholder', '');
    fixture.detectChanges();
    expect(hint()).toBeNull();
  });

  it('preserves optional icons, clear controls and native input focus', () => {
    fixture.componentRef.setInput('showIcon', false);
    fixture.componentRef.setInput('showClear', false);
    connectParent();
    fixture.detectChanges();
    expect(root().querySelector('.search-icon')).toBeNull();
    expect(root().querySelector('.quiz-search--with-icon')).toBeNull();
    expect(hint()).not.toBeNull();
    type('angular');
    expect(root().querySelector('.clear-btn')).toBeNull();
    input().focus();
    expect(document.activeElement).toBe(input());
  });
});
