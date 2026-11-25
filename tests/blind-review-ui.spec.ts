import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'playwright/test';

// Exercises the actual offline research UI without publishing any private face.
// All six image requests are replaced by a local deterministic fixture: this
// verifies interaction/export, while the separate GPU test verifies real images.
const html = readFileSync(join(process.cwd(), 'scripts/bench/blind-review.template.html'), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');

test('mobile blind reviewer compares randomized A/B, records three votes and exports local JSON', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/*.png', route => route.fulfill({ body: png, contentType: 'image/png' }));
  await page.setContent(html.replace('<head>', '<head><base href="http://127.0.0.1:4173/">'));
  await expect(page.getByRole('heading', { name: 'Which image feels more real?' })).toBeVisible();
  await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#showB').click();
  await expect(page.locator('#slider')).toHaveValue('0');
  await page.locator('#showA').click();
  await expect(page.locator('#slider')).toHaveValue('100');
  await page.locator('#split').click();
  await expect(page.locator('#slider')).toHaveValue('50');
  for (const answer of ['A', 'B', 'same']) {
    await page.locator('[data-answer="' + answer + '"]').click();
    await expect(page.locator('[data-answer="' + answer + '"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#next')).toBeEnabled();
    await page.locator('#next').click();
  }
  await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  expect(download.suggestedFilename()).toBe('hbeauty-blind-review.json');
  const bytes = readFileSync(await download.path());
  const result = JSON.parse(bytes.toString('utf8'));
  expect(result.schema).toBe('hbeauty-public-blind-review-v1');
  expect(result.votes).toHaveLength(3);
  expect(new Set(result.votes.map((v: { look: string }) => v.look)).size).toBe(3);
  expect(result.votes.map((v: { preference: string }) => v.preference).sort()).toEqual(['A','B','same']);
  for (const vote of result.votes) {
    expect([vote.shown_as_A, vote.shown_as_B].sort()).toEqual(['after','before']);
  }
  await page.locator('#restart').click();
  await expect(page.locator('#progress')).toContainText('COMPARISON 1 OF 3');
  await expect(page.locator('#next')).toBeDisabled();
});
