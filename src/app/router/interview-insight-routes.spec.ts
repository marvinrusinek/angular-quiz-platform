import { routes } from './quiz-routing.routes';
import { interviewHistoryFragmentGuard } from './guards/interview-history-fragment-guard';

const find = (path: string) => routes.find((r) => r.path === path);

describe('Interview insight routes', () => {
  it.each([
    ['interview/readiness', 'InterviewReadinessPageComponent'],
    ['interview/trends', 'InterviewTopicTrendsPageComponent']
  ])('%s is lazy-loaded: loadComponent, no eager component', async (path, className) => {
    const route = find(path)!;
    expect(route).toBeDefined();
    expect(route.component).toBeUndefined();
    expect(typeof route.loadComponent).toBe('function');
    const loaded = (await (route.loadComponent as () => Promise<{ name: string }>)()) as {
      name: string;
    };
    expect(loaded.name).toBe(className);
  });

  it('Interview History stays eager and redirects old fragment links through its guard', () => {
    const route = find('interview/history')!;
    expect(route.component).toBeDefined();
    expect(route.canActivate).toContain(interviewHistoryFragmentGuard);
  });

  it('keeps the per-attempt history route unchanged', () => {
    expect(find('interview/history/:id')?.component).toBeDefined();
  });
});
