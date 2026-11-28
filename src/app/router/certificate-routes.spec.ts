import { routes } from './quiz-routing.routes';

/**
 * The three Angular Interview Master Certificate pages are lazy-loaded (each its own chunk, like Your Progress). Only HOW
 * the component is loaded changed: the paths, their order and their (absent) guards are as they were.
 */
const CERTIFICATE = [
  { path: 'interview/certificate', component: 'InterviewCertificateComponent' },
  { path: 'interview/certificate/claim', component: 'InterviewCertificateClaimComponent' },
  { path: 'interview/certificate/verify', component: 'InterviewCertificateVerifyComponent' }
] as const;

describe('Certificate routes', () => {
  it.each(CERTIFICATE)('$path exists exactly once', ({ path }) => {
    expect(routes.filter((r) => r.path === path)).toHaveLength(1);
  });

  it.each(CERTIFICATE)('$path is lazy-loaded: loadComponent, no eager component', ({ path }) => {
    const route = routes.find((r) => r.path === path)!;
    expect(route.component).toBeUndefined();
    expect(typeof route.loadComponent).toBe('function');
  });

  it.each(CERTIFICATE)('$path loads $component through its own dynamic import', async ({ path, component }) => {
    const route = routes.find((r) => r.path === path)!;
    const loaded = (await (route.loadComponent as () => Promise<{ name: string }>)()) as { name: string };
    expect(loaded.name).toBe(component);
  });

  it.each(CERTIFICATE)('$path stays unguarded with no resolver or matcher', ({ path }) => {
    const route = routes.find((r) => r.path === path)!;
    expect(route.canActivate).toBeUndefined();
    expect(route.canMatch).toBeUndefined();
    expect(route.canDeactivate).toBeUndefined();
    expect(route.resolve).toBeUndefined();
    expect(route.data).toBeUndefined();
  });

  it('keeps the order: view, then claim, then verify', () => {
    const paths = routes.map((r) => r.path);
    const i = CERTIFICATE.map((c) => paths.indexOf(c.path));
    expect(i[0]).toBeGreaterThan(-1);
    expect(i[0]).toBeLessThan(i[1]);
    expect(i[1]).toBeLessThan(i[2]);
  });

  it('leaves Your Progress lazy and Interview History eager', () => {
    expect(typeof routes.find((r) => r.path === 'progress')!.loadComponent).toBe('function');
    expect(routes.find((r) => r.path === 'interview/history/:id')!.component).toBeDefined();
  });
});
