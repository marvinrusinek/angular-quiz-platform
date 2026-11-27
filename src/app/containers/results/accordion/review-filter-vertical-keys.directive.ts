import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Lets Up/Down Arrow pass the Quiz Review filter toolbar untouched.
 *
 * Angular Aria's horizontal toolbar also binds ArrowUp/ArrowDown ("previous/next filter in the group")
 * and consumes them (preventDefault + stopPropagation); on the last filter it wraps back to the first.
 * With Narrator's scan mode that trapped Down Arrow inside the filters, so the accordion questions
 * could not be reached. A capture-phase listener on the toolbar host stops those two keys before the
 * toolbar's own (bubble-phase) handler sees them, WITHOUT preventDefault, so the browser and the
 * screen reader keep their normal behaviour. Left/Right, Home/End, Space/Enter are untouched.
 */
@Directive({
  selector: '[codelabLetVerticalKeysPass]',
  standalone: true
})
export class ReviewFilterVerticalKeysDirective {
  constructor() {
    const host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.stopPropagation();
    };
    host.addEventListener('keydown', onKeydown, true);
    inject(DestroyRef).onDestroy(() => host.removeEventListener('keydown', onKeydown, true));
  }
}
