import { test, expect, Page } from '@playwright/test';

/**
 * Interview History, Interview Readiness and Topic Trends are three pages.
 * History is seeded the way the app itself writes it (the interview itself is
 * covered in interview.spec.ts), so these tests are about routing, navigation,
 * refresh, the old fragment links and the heading / landmark structure.
 */

const KEY = 'interviewAttemptHistory:v2';

function attempts(count: number) {
  return Array.from({ length: count }, (_, k) => ({
    id: `att-${k}`,
    sessionId: `s${k}`,
    attemptNumber: k + 1,
    completedAt: `2026-11-${String(10 + k).padStart(2, '0')}T12:00:00.000Z`,
    score: 80 + k,
    totalQuestions: 100,
    percentage: 80 + k,
    completionReason: 'submitted',
    durationSeconds: 900,
    configuredDifficulty: 'mixed',
    selectedTopicIds: ['forms', 'http'],
    topicPerformance: [
      { topicId: 'forms', topicName: 'Forms', correct: 8 + k, total: 10, percentage: (8 + k) * 10 },
      { topicId: 'http', topicName: 'HTTP', correct: 8, total: 10, percentage: 80 }
    ]
  }));
}

async function seed(page: Page, count = 3) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        /* storage unavailable */
      }
    },
    [KEY, JSON.stringify({ version: 2, attempts: attempts(count) })]
  );
}

const H1 = 'main h1';

test.describe('Interview History / Readiness / Topic Trends pages', () => {
  test('each page opens by direct URL and survives a refresh, with one h1 and one main', async ({ page }) => {
    await seed(page);
    const pages: [string, string][] = [
      ['/interview/history', 'Interview History'],
      ['/interview/readiness', 'Interview Readiness'],
      ['/interview/trends', 'Topic Trends']
    ];
    for (const [url, title] of pages) {
      await page.goto(url);
      await expect(page.locator(H1)).toContainText(title);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      await page.reload();
      await expect(page.locator(H1)).toContainText(title);
      await expect(page.locator('h1')).toHaveCount(1);
    }
  });

  test('Interview History no longer embeds Readiness or Topic Trends, and links to them', async ({ page }) => {
    await seed(page);
    await page.goto('/interview/history');
    await expect(page.locator('.ih-card').first()).toBeVisible();
    await expect(page.locator('.readiness, .topic-trends')).toHaveCount(0);
    await expect(page.locator('.interview-history__footer a[href$="/interview/readiness"]')).toBeVisible();
    await expect(page.locator('.interview-history__footer a[href$="/interview/trends"]')).toBeVisible();
  });

  test('navigates History → Readiness → Trends → History with focus on each h1, and Back/Forward work', async ({ page }) => {
    await seed(page);
    await page.goto('/interview/history');
    await page.locator('.interview-history__footer a', { hasText: 'Interview Readiness' }).click();
    await expect(page).toHaveURL(/\/interview\/readiness$/);
    await expect(page.locator(H1)).toBeFocused();
    await expect(page.locator('.readiness__factor')).toHaveCount(4); // the full presentation

    await page.locator('.insight-page__links a', { hasText: 'Topic Trends' }).click();
    await expect(page).toHaveURL(/\/interview\/trends$/);
    await expect(page.locator(H1)).toBeFocused();
    await expect(page.locator('.tt-card').first()).toBeVisible(); // rendered at once, no placeholder

    await page.locator('.insight-page__links a', { hasText: 'Interview History' }).click();
    await expect(page).toHaveURL(/\/interview\/history$/);
    await expect(page.locator(H1)).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/interview\/trends$/);
    await expect(page.locator(H1)).toContainText('Topic Trends');
    await page.goBack();
    await expect(page).toHaveURL(/\/interview\/readiness$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/interview\/trends$/);
  });

  test('old /interview/history#topic-trends and #readiness links land on the new pages', async ({ page }) => {
    await seed(page);
    await page.goto('/interview/history#topic-trends');
    await expect(page).toHaveURL(/\/interview\/trends$/);
    await expect(page.locator(H1)).toContainText('Topic Trends');
    await page.goto('/interview/history#readiness');
    await expect(page).toHaveURL(/\/interview\/readiness$/);
    await expect(page.locator(H1)).toContainText('Interview Readiness');
  });

  test('the redirect replaces the old URL: Back does not return to the fragment link', async ({ page }) => {
    await seed(page);
    await page.goto('/interview/history');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/interview/history#topic-trends');
    });
    await page.goto('/interview/history#topic-trends');
    await expect(page).toHaveURL(/\/interview\/trends$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/#topic-trends/);
  });

  test('the Topic Trends filters and View Details work on the page', async ({ page }) => {
    await seed(page);
    await page.goto('/interview/trends');
    const cards = page.locator('.tt-card');
    await expect(cards).toHaveCount(2);
    await page.locator('.tt-filter', { hasText: 'Improving' }).click();
    await expect(cards).toHaveCount(1);
    const toggle = cards.first().locator('.tt-card__toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('empty history: every page keeps its h1 and an empty state', async ({ page }) => {
    await page.goto('/interview/readiness');
    await expect(page.locator(H1)).toContainText('Interview Readiness');
    await expect(page.locator('.insight-page__empty')).toBeVisible();
    await page.goto('/interview/trends');
    await expect(page.locator(H1)).toContainText('Topic Trends');
    await expect(page.locator('.topic-trends__empty')).toBeVisible();
  });

  test('no horizontal overflow at phone, tablet and desktop widths on all three pages', async ({ page }) => {
    await seed(page, 6);
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const url of ['/interview/history', '/interview/readiness', '/interview/trends']) {
        await page.goto(url);
        await expect(page.locator(H1)).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${url} @ ${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});
