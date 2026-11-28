import { routes } from './quiz-routing.routes';

/**
 * Your Progress is lazy-loaded (its own chunk, like Interview Readiness and Topic Trends). The route's path, its
 * absence of guards and its component are unchanged: only HOW the component is loaded changed.
 */
describe('Your Progress route', () => {
  const route = routes.find((r) => r.path === 'progress')!;

  it('exists once, at /progress', () => {
    expect(route).toBeDefined();
    expect(routes.filter((r) => r.path === 'progress')).toHaveLength(1);
  });

  it('is lazy-loaded: loadComponent, no eager component', () => {
    expect(route.component).toBeUndefined();
    expect(typeof route.loadComponent).toBe('function');
  });

  it('loads ProgressPageComponent through its own dynamic import', async () => {
    const loaded = (await (route.loadComponent as () => Promise<{ name: string }>)()) as { name: string };
    expect(loaded.name).toBe('ProgressPageComponent');
  });

  it('stays unguarded and carries no resolver, so a user with no history still gets the page (empty state)', () => {
    expect(route.canActivate).toBeUndefined();
    expect(route.canMatch).toBeUndefined();
    expect(route.resolve).toBeUndefined();
  });

  it('leaves the other routes as they were (the two existing lazy routes stay lazy; Interview History stays eager)', () => {
    expect(typeof routes.find((r) => r.path === 'interview/readiness')!.loadComponent).toBe('function');
    expect(typeof routes.find((r) => r.path === 'interview/trends')!.loadComponent).toBe('function');
    expect(routes.find((r) => r.path === 'interview/history')!.component).toBeDefined();
  });
});
