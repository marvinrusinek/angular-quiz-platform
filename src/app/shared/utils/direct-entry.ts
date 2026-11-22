import { QUESTION_ROUTE_REGEX } from '@shared/constants/route-patterns';

/**
 * DIRECT URL ENTRY.
 *
 * The question index (0-based) the browser landed on when the app's FIRST navigation (id 1) is a question route, i.e. the
 * user browsed (or reloaded) straight to /quiz/question/:quizId/:index. Every later, in-app navigation has an id above 1,
 * so it is never a direct entry. Returns null when the first navigation is not a question route, or when there is no
 * navigation to read.
 */
export function questionIndexFromUrl(url: string | null | undefined): number | null {
  const match = String(url ?? '').match(QUESTION_ROUTE_REGEX);
  if (!match?.[1]) return null;
  const oneBased = parseInt(match[1], 10);
  return Number.isFinite(oneBased) && oneBased >= 1 ? oneBased - 1 : null;
}

type NavigationLike = { readonly id: number; readonly extractedUrl?: { toString(): string } };

/**
 * A guard may REDIRECT the typed URL (a locked question sends the user to the furthest unlocked one). The redirect is a
 * new navigation (id 2) that does not reference the typed one, so it is recognized by the DOCUMENT's own URL
 * (`documentUrl`, the URL the browser loaded): when that is a question route, the first navigation (id 1) or its
 * redirect (id 2) is still the direct entry, and the question the user LANDS on (the current navigation's URL) is the
 * direct-entry question. When the document was not loaded on a question route, only a first navigation (id 1) onto one
 * counts. Anything later is an in-app navigation.
 */
export function directEntryIndexFromNavigation(
  navigation: NavigationLike | null | undefined,
  documentUrl?: string | null
): number | null {
  if (!navigation) return null;
  const landed = questionIndexFromUrl(navigation.extractedUrl?.toString());
  if (navigation.id === 1) return landed;
  if (navigation.id === 2 && questionIndexFromUrl(documentUrl) !== null) return landed;
  return null;
}

/** The URL the browser loaded this document with (typed, bookmarked or reloaded); '' when unavailable. */
export function loadedDocumentUrl(): string {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return entry?.name ?? '';
  } catch {
    return '';
  }
}
