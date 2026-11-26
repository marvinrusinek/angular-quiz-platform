import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

/**
 * Where an old in-page link on Interview History now lives. Topic Trends and
 * Interview Readiness used to be sections of /interview/history, reached by
 * `/interview/history#topic-trends`; each is now its own page.
 */
const MOVED_SECTIONS: Readonly<Record<string, string>> = {
  'topic-trends': '/interview/trends',
  readiness: '/interview/readiness'
};

/**
 * Keeps old `/interview/history#topic-trends` (and `#readiness`) links,
 * bookmarks and history entries working by redirecting them to the dedicated
 * page. A redirect from a guard replaces the navigation, so browser Back does
 * not bounce the user into the redirecting URL again. Any other fragment, or
 * none, opens Interview History as usual.
 */
export const interviewHistoryFragmentGuard: CanActivateFn = (route): boolean | UrlTree => {
  const target = route.fragment ? MOVED_SECTIONS[route.fragment] : undefined;
  return target ? inject(Router).createUrlTree([target]) : true;
};
