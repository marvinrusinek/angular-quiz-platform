import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, provideRouter } from '@angular/router';

import { interviewHistoryFragmentGuard } from './interview-history-fragment-guard';

function run(fragment: string | null): boolean | UrlTree {
  const route = { fragment } as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(
    () => interviewHistoryFragmentGuard(route, {} as never) as boolean | UrlTree
  );
}

describe('interviewHistoryFragmentGuard', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  it('redirects the old #topic-trends link to the Topic Trends page', () => {
    const result = run('topic-trends');
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/interview/trends');
  });

  it('redirects a #readiness link to the Interview Readiness page', () => {
    expect(router.serializeUrl(run('readiness') as UrlTree)).toBe('/interview/readiness');
  });

  it('lets Interview History open for no fragment or an unrelated one', () => {
    expect(run(null)).toBe(true);
    expect(run('something-else')).toBe(true);
  });
});
