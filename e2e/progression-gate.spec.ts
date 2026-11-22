import { test, expect, Page } from '@playwright/test';

import { HEADING, NEXT_BTN, PREV_BTN, RESULTS_BTN, quizData, correctIndicesForHeading } from './helpers';

/**
 * DIRECT URL ENTRY — any valid question index may be opened directly.
 *
 * `QuizGuard` validates only that the requested index is IN RANGE (1..N) (malformed and out-of-range indexes still
 * redirect). It no longer redirects an unreached question to the furthest unlocked one: opening a question only DISPLAYS it
 * (its own text, nothing selected, nothing marked answered or completed, no score or verdict change). What leaving a question
 * (Next) and finishing the quiz (Results) require is unchanged and is decided by verdicts and expiry, not by the URL.
 *
 * NOTE: these expectations were rewritten for that behavior and have NOT been executed: Playwright is blocked in this
 * environment.
 *
 * These specs drive the real app end-to-end (real backend, real router,
 * real sessionStorage) and assert on the actual resulting URL/heading, never
 * an internal signal — the same discipline `restart-quiz-lifecycle.spec.ts`
 * uses for the sibling Restart regression.
 *
 * Unit/integration coverage for the pieces themselves lives in
 * `quiz-progression.service.spec.ts` (the service's own persistence and
 * fail-closed behavior) and `quiz-guard.spec.ts` (the guard's redirect
 * logic) — this file only proves the whole stack agrees through a real
 * browser.
 */

test.describe.configure({ timeout: 420_000 });

const ROW = '.option-row';
const RESTART_BTN = '.restart-btn';
const CONFIRM_RESTART_BTN = '.confirm-actions button:has-text("Restart")';
const TILE = '.quiz-tile';

const widgetsQuiz = (quizData as any[]).find((q) => (q.quizId || q.id) === 'fixture-widgets');
const gadgetsQuiz = (quizData as any[]).find((q) => (q.quizId || q.id) === 'fixture-gadgets');

function quizIdFromUrl(page: Page): string {
  const m = page.url().match(/\/quiz\/question\/([^/]+)\//);
  if (!m) throw new Error(`no quizId in URL: ${page.url()}`);
  return m[1];
}

function questionIndexFromUrl(page: Page): number {
  const m = page.url().match(/\/quiz\/question\/[^/]+\/(\d+)/);
  return m ? Number(m[1]) : -1;
}

/** Types/pastes a question URL directly — a fresh navigation, not an SPA route change. */
async function gotoQuestionDirect(page: Page, quizId: string, index: number): Promise<void> {
  await page.goto(`/quiz/question/${quizId}/${index}`);
  await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
}

/** Question N's own text: the lower-cased start of its stem, which only the question text (not an explanation) contains. */
function stemOf(quiz: any, n: number): string {
  return quiz.questions[n - 1].questionText.split('?')[0].slice(0, 15).toLowerCase();
}
async function headingText(page: Page): Promise<string> {
  return ((await page.locator(HEADING).first().textContent()) ?? '').toLowerCase();
}
async function expectQuestionText(page: Page, quiz: any, n: number): Promise<void> {
  expect(await headingText(page), "the heading shows question " + n + "'s own text").toContain(stemOf(quiz, n));
}
/** The heading no longer shows question N's text: its explanation has taken its place (reveal or restored revisit). */
async function expectExplanationShown(page: Page, quiz: any, n: number, timeout = 15_000): Promise<void> {
  await expect
    .poll(async () => (await headingText(page)).includes(stemOf(quiz, n)), { timeout })
    .toBe(false);
}

/** Start a quiz the way a user does: tile → intro → "Start the Quiz!". */
async function startViaUi(page: Page, needle: RegExp): Promise<void> {
  await page.goto('/quiz');
  await page.locator(TILE).first().waitFor({ state: 'visible', timeout: 30_000 });
  const tile = page.locator(TILE).filter({ hasText: needle }).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await page.waitForTimeout(1200);
  const start = page.locator('.start-btn').first();
  if ((await start.count()) > 0) await start.click().catch(() => {});
  await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 30_000 });
}

/** Answers the CURRENT (single-answer) question correctly and clicks Next. */
async function answerCorrectlyAndAdvance(page: Page, quiz: any): Promise<void> {
  await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
  const heading = (await page.locator(HEADING).first().textContent()) ?? '';
  const correct = correctIndicesForHeading(quiz, heading);
  const pick = correct.length ? correct[0] : 0;

  await page.locator(ROW).nth(pick).click({ timeout: 5000 });
  // Wait for the real backend verdict, not a fixed delay — proves Next only
  // became clickable once the check actually resolved correct.
  await expect(page.locator(ROW).nth(pick)).toHaveClass(/correct-option/, { timeout: 15_000 });

  await page.locator(NEXT_BTN).first().click({ timeout: 5000 });
  await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
}

test.describe('Direct-route progression bypass — fresh direct URL', () => {
  test('a brand-new attempt: typing a future question URL opens THAT question, with its own text and nothing selected or marked', async ({ page }) => {
    await gotoQuestionDirect(page, 'fixture-widgets', 5);

    expect(questionIndexFromUrl(page), 'no redirect: the requested question opens').toBe(5);
    await expectQuestionText(page, widgetsQuiz, 5);
    await expect(page.locator(ROW + '.selected-option')).toHaveCount(0);
    await expect(page.locator(ROW + '.correct-option')).toHaveCount(0);
    await expect(page.locator(NEXT_BTN)).toBeDisabled();
  });

  test('an invalid index is still validated: out of range goes to the last question, malformed goes to the intro', async ({ page }) => {
    await page.goto('/quiz/question/fixture-widgets/' + (widgetsQuiz.questions.length + 5));
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    expect(questionIndexFromUrl(page)).toBe(widgetsQuiz.questions.length);

    await page.goto('/quiz/question/fixture-widgets/abc');
    await page.waitForURL(/\/quiz\/intro\/fixture-widgets/, { timeout: 15_000 });
  });

  test('a brand-new attempt: question 1 itself is allowed directly, with no redirect', async ({ page }) => {
    await gotoQuestionDirect(page, 'fixture-widgets', 1);
    expect(questionIndexFromUrl(page)).toBe(1);
  });
});

test.describe('Direct-route progression bypass — progressive unlock', () => {
  test('completing question 1 does not restrict the URL: question 3 opens directly with its own text', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz);
    expect(questionIndexFromUrl(page), 'Next legitimately landed on question 2').toBe(2);

    const quizId = quizIdFromUrl(page);
    await gotoQuestionDirect(page, quizId, 3);
    expect(questionIndexFromUrl(page), 'question 3 opens directly').toBe(3);
    await expectQuestionText(page, widgetsQuiz, 3);
  });

  test('after completing question 2, every question is directly reachable, ahead or behind', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q3
    expect(questionIndexFromUrl(page)).toBe(3);

    const quizId = quizIdFromUrl(page);
    await gotoQuestionDirect(page, quizId, 4);
    expect(questionIndexFromUrl(page), 'question 4 opens directly').toBe(4);

    await gotoQuestionDirect(page, quizId, 3);
    expect(questionIndexFromUrl(page)).toBe(3);
    await gotoQuestionDirect(page, quizId, 1);
    expect(questionIndexFromUrl(page)).toBe(1);
  });
});

test.describe('Direct-route progression bypass — refresh and history', () => {
  test('a refresh on the furthest-unlocked question keeps it unlocked (sessionStorage survives an in-tab reload)', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    expect(questionIndexFromUrl(page)).toBe(2);

    await page.reload();
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    expect(questionIndexFromUrl(page), 'refresh did not relock the furthest question').toBe(2);
  });

  test('after a refresh, a question ahead still opens directly', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    await page.reload();
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });

    const quizId = quizIdFromUrl(page);
    await gotoQuestionDirect(page, quizId, 6);
    expect(questionIndexFromUrl(page), 'the requested question 6 opens').toBe(6);
    await expectQuestionText(page, widgetsQuiz, 6);
  });

  test('browser Back to an already-visited earlier question is never redirected', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q3
    expect(questionIndexFromUrl(page)).toBe(3);

    await page.goBack();
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    expect(questionIndexFromUrl(page), 'Back revisits question 2 — behind the furthest marker, always allowed').toBe(2);
  });
});

test.describe('Direct-route progression bypass — restart isolation', () => {
  test('confirming Restart starts a clean attempt: a direct request for question 3 opens it as an unanswered question', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q3
    expect(questionIndexFromUrl(page)).toBe(3);

    const quizId = quizIdFromUrl(page);

    await page.locator(RESTART_BTN).click();
    await page.locator(CONFIRM_RESTART_BTN).click();
    // restartQuiz() mutates the SAME QuizComponent instance in place (no
    // remount), so waiting on `.option-row` visibility alone proves nothing —
    // question 3's own rows are already visible before the reset's async
    // router.navigate() resolves. Wait for the URL itself to actually land on
    // question 1 before reading it.
    await page.waitForURL(new RegExp(`/quiz/question/${quizId}/1$`), { timeout: 15_000 });
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    expect(questionIndexFromUrl(page), 'Restart itself lands back on question 1').toBe(1);

    await gotoQuestionDirect(page, quizId, 3);
    expect(questionIndexFromUrl(page), 'question 3 opens directly after the restart').toBe(3);
    await expectQuestionText(page, widgetsQuiz, 3); // the pre-restart answer is gone: question text, nothing selected
    await expect(page.locator(ROW + '.selected-option')).toHaveCount(0);
  });

  test('cancelling the Restart dialog leaves the attempt intact', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    expect(questionIndexFromUrl(page)).toBe(2);

    const quizId = quizIdFromUrl(page);

    await page.locator(RESTART_BTN).click();
    await page.locator('.confirm-actions button:has-text("Cancel")').click();
    await page.waitForTimeout(400);

    // Nothing was reset — question 2 (the furthest already reached) is still
    // directly reachable exactly as before the (cancelled) restart attempt.
    await gotoQuestionDirect(page, quizId, 2);
    expect(questionIndexFromUrl(page)).toBe(2);
  });
});

test.describe('Direct-route progression bypass — quiz isolation', () => {
  test('progress in one quiz does not carry over to a different quiz started afterward', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q2
    await answerCorrectlyAndAdvance(page, widgetsQuiz); // -> q3
    expect(questionIndexFromUrl(page)).toBe(3);

    // Leave via the header logo (an in-SPA route change, not a full reload —
    // a `page.goto` here would tear down state the real user flow never
    // touches and prove nothing about the actual regression).
    const backLink = page.locator('mat-card-header button.quiz-header__logo').first();
    await backLink.waitFor({ state: 'visible', timeout: 15_000 });
    await backLink.click();
    await page.locator(TILE).first().waitFor({ state: 'visible', timeout: 30_000 });

    await startViaUi(page, /fixture gadgets/i);
    expect(questionIndexFromUrl(page), 'the new quiz starts on its own question 1').toBe(1);

    // A brand-new attempt was minted for the new quiz: the old quiz's answers carry nothing over, and question 3 opens
    // directly as an unanswered question.
    await gotoQuestionDirect(page, 'fixture-gadgets', 3);
    expect(questionIndexFromUrl(page), 'question 3 opens directly in the new quiz').toBe(3);
    await expect(page.locator(ROW + '.selected-option')).toHaveCount(0);
  });
});

test.describe('Directly opened question — revisit restoration and Results eligibility', () => {
  test('fully correct answer on a directly opened question → Next → Previous restores its explanation and selection', async ({ page }) => {
    await startViaUi(page, /fixture widgets/i);
    await gotoQuestionDirect(page, 'fixture-widgets', 3);
    expect(questionIndexFromUrl(page)).toBe(3);
    await expectQuestionText(page, widgetsQuiz, 3); // direct entry shows the question text first

    const heading = (await page.locator(HEADING).first().textContent()) ?? '';
    const pick = correctIndicesForHeading(widgetsQuiz, heading)[0] ?? 0;
    await page.locator(ROW).nth(pick).click({ timeout: 5000 });
    await expect(page.locator(ROW).nth(pick)).toHaveClass(/correct-option/, { timeout: 15_000 });

    await page.locator(NEXT_BTN).first().click({ timeout: 5000 });
    await page.waitForURL(/\/4$/, { timeout: 15_000 });
    await page.locator(PREV_BTN).first().click({ timeout: 5000 });
    await page.waitForURL(/\/3$/, { timeout: 15_000 });
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });

    await expectExplanationShown(page, widgetsQuiz, 3); // the explanation is restored on the revisit
    await expect(page.locator(ROW).nth(pick), 'the selection is restored').toHaveClass(/correct-option/);
  });

  test('server-confirmed timeout on a directly opened question → Next → Previous restores its explanation, and the next question stays selectable until its own expiry', async ({ page }) => {
    test.setTimeout(300_000);
    await startViaUi(page, /fixture widgets/i);
    await gotoQuestionDirect(page, 'fixture-widgets', 3);
    await expectQuestionText(page, widgetsQuiz, 3);

    // Let question 3's own deadline pass with no answer: the server-confirmed reveal replaces the text.
    await expectExplanationShown(page, widgetsQuiz, 3, 90_000);

    await page.locator(NEXT_BTN).first().click({ timeout: 5000 });
    await page.waitForURL(/\/4$/, { timeout: 15_000 });
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    await expectQuestionText(page, widgetsQuiz, 4); // the next question starts with its own text and its own deadline

    // ...and it is selectable: the previous question's expiry did not lock it.
    const next = (await page.locator(HEADING).first().textContent()) ?? '';
    const pick = correctIndicesForHeading(widgetsQuiz, next)[0] ?? 0;
    await page.locator(ROW).nth(pick).click({ timeout: 5000 });
    await expect(page.locator(ROW).nth(pick)).toHaveClass(/correct-option/, { timeout: 15_000 });

    await page.locator(PREV_BTN).first().click({ timeout: 5000 });
    await page.waitForURL(/\/3$/, { timeout: 15_000 });
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 15_000 });
    await expectExplanationShown(page, widgetsQuiz, 3); // the expired question restores its explanation
  });
});
