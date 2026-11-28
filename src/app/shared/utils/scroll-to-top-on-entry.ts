import { afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';

import { swallow } from './error-logging';

/**
 * Open a routed page at the TOP instead of at whatever offset the previous (long) page had. The router does not restore
 * or reset scroll (no `scrollPositionRestoration`), so each page that opens a new view does this itself.
 *
 * Call it from a constructor (it needs an injection context). It runs after the page's first render, so it holds for a
 * lazy-loaded page too: no timer, and nothing to race with the route activating. A Back/Forward navigation
 * (`popstate`) is left alone so the browser keeps the position the user came from.
 */
export function scrollToTopOnEntry(): void {
  const trigger = inject(Router).currentNavigation()?.trigger;
  afterNextRender(() => {
    if (trigger === 'popstate') return;
    try {
      window.scrollTo({ top: 0, left: 0 });
    } catch (err: unknown) {
      // Non-fatal in non-browser test environments.
      swallow('scroll-to-top-on-entry', err);
    }
  });
}
