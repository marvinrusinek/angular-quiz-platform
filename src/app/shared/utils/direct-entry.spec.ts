import { directEntryIndexFromNavigation, questionIndexFromUrl } from './direct-entry';

/**
 * DIRECT URL ENTRY is the app's FIRST navigation landing on a question route. Anything later is an in-app navigation.
 */
describe('directEntryIndexFromNavigation', () => {
  const nav = (id: number, url: string) => ({ id, extractedUrl: { toString: () => url } });

  it('names the question (0-based) when the first navigation is a question route', () => {
    expect(directEntryIndexFromNavigation(nav(1, '/quiz/question/dependency-injection/1'))).toBe(0);
    expect(directEntryIndexFromNavigation(nav(1, '/quiz/question/rxjs/7'))).toBe(6);
  });

  it('a guard redirect lands on the redirect target: the typed /3 sent to /2 makes Q2 the direct-entry question', () => {
    const typedDocument = 'http://localhost:4200/quiz/question/rxjs/3';
    expect(directEntryIndexFromNavigation(nav(2, '/quiz/question/rxjs/2'), typedDocument)).toBe(1);
    // an in-app navigation 2 (the document was NOT loaded on a question route, e.g. intro → Start) is never a direct entry
    expect(directEntryIndexFromNavigation(nav(2, '/quiz/question/rxjs/1'), 'http://localhost:4200/quiz/intro/rxjs')).toBeNull();
  });

  it('is null for any later, in-app navigation', () => {
    expect(directEntryIndexFromNavigation(nav(2, '/quiz/question/rxjs/3'))).toBeNull();
    expect(directEntryIndexFromNavigation(nav(15, '/quiz/question/rxjs/1'))).toBeNull();
  });

  it('is null when the first navigation is not a question route', () => {
    expect(directEntryIndexFromNavigation(nav(1, '/quiz'))).toBeNull();
    expect(directEntryIndexFromNavigation(nav(1, '/quiz/intro/rxjs'))).toBeNull();
    expect(directEntryIndexFromNavigation(nav(1, '/results/rxjs'))).toBeNull();
  });

  it('is null when there is no navigation to read, or a malformed index', () => {
    expect(directEntryIndexFromNavigation(null)).toBeNull();
    expect(directEntryIndexFromNavigation(undefined)).toBeNull();
    expect(directEntryIndexFromNavigation(nav(1, '/quiz/question/rxjs/0'))).toBeNull();
    expect(directEntryIndexFromNavigation({ id: 1 })).toBeNull();
  });
});

describe('questionIndexFromUrl (the question a guard redirect LANDS on)', () => {
  it('reads the final URL after a redirect: a typed /3 that a guard sends to /1 lands on Q1 (index 0)', () => {
    expect(questionIndexFromUrl('/quiz/question/dependency-injection/1')).toBe(0);
    expect(questionIndexFromUrl('/quiz/question/dependency-injection/3')).toBe(2);
  });

  it('is null for non-question URLs and malformed indexes', () => {
    expect(questionIndexFromUrl('/quiz')).toBeNull();
    expect(questionIndexFromUrl('/quiz/question/rxjs/0')).toBeNull();
    expect(questionIndexFromUrl(undefined)).toBeNull();
  });
});
