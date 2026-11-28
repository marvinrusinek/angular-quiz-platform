import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { scrollToTopOnEntry } from './scroll-to-top-on-entry';

@Component({ selector: 'codelab-scroll-probe', standalone: true, template: '' })
class ProbeComponent {
  constructor() {
    scrollToTopOnEntry();
  }
}

describe('scrollToTopOnEntry', () => {
  const create = (trigger: 'imperative' | 'popstate' | undefined): void => {
    TestBed.configureTestingModule({
      imports: [ProbeComponent],
      providers: [
        { provide: Router, useValue: { currentNavigation: () => (trigger ? { trigger } : null) } }
      ]
    });
    const fixture = TestBed.createComponent(ProbeComponent);
    fixture.detectChanges();
  };

  let scrollTo: jest.SpyInstance;
  beforeEach(() => {
    scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });
  afterEach(() => scrollTo.mockRestore());

  it('scrolls to the top after the first render on a forward navigation', () => {
    create('imperative');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it('scrolls to the top when there is no navigation in flight (first load, refresh)', () => {
    create(undefined);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it('leaves Back/Forward (popstate) alone so the browser keeps the position', () => {
    create('popstate');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
