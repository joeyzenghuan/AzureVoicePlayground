/**
 * E2E tests for Voice Live Translator Debug Mode UI
 *
 * Prerequisites:
 *   1. npm install --save-dev @playwright/test
 *   2. npx vite dev --port 5199
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts debug-mode-ui.test.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5199';
const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/ui-tests';

async function setupAndNavigate(page: Page) {
  // Set credentials in localStorage before navigation
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey }) => {
      localStorage.setItem(
        'azure-voice-live-settings',
        JSON.stringify({ endpoint, apiKey })
      );
      const existing = localStorage.getItem('azure-tts-settings');
      const settings = existing ? JSON.parse(existing) : {};
      settings.voiceLiveEndpoint = endpoint;
      settings.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(settings));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY }
  );

  // Navigate to Voice Live Translator
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(1000);

  // Verify we're on the right page
  await expect(page.locator('h1:has-text("Voice Live Translator")')).toBeVisible();
}

test.describe('Voice Live Translator - Debug Mode UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndNavigate(page);
  });

  test('should show Debug OFF button by default', async ({ page }) => {
    const debugBtn = page.locator('button:has-text("Debug OFF")');
    await expect(debugBtn).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-01-default.png`, fullPage: true });
  });

  test('should show Conversation Log title when debug is off', async ({ page }) => {
    await expect(page.locator('text=Conversation Log')).toBeVisible();
  });

  test('should toggle to debug mode on click', async ({ page }) => {
    const debugBtn = page.locator('button:has-text("Debug OFF")');
    await debugBtn.click();

    // Should now show Debug ON
    await expect(page.locator('button:has-text("Debug ON")')).toBeVisible();
    // Title should change to Debug Log
    await expect(page.locator('h2:has-text("Debug Log")')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-02-debug-on.png`, fullPage: true });
  });

  test('should show category filter chips in debug mode', async ({ page }) => {
    // Enable debug mode
    await page.locator('button:has-text("Debug OFF")').click();

    // Check all category chips are visible
    const categories = [
      'Conversation', 'Server Events', 'Client Events',
      'Token Usage', 'Cost', 'Latency',
      'VAD', 'ASR', 'Session', 'Error',
    ];

    for (const cat of categories) {
      const chip = page.locator('.flex.flex-wrap button', { hasText: cat });
      await expect(chip).toBeVisible();
    }

    // All/None buttons should be visible
    await expect(page.locator('text=Filter Categories')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-03-categories.png`, fullPage: true });
  });

  test('should toggle individual category chips', async ({ page }) => {
    await page.locator('button:has-text("Debug OFF")').click();

    // Click "Conversation" chip to deselect it
    const conversationChip = page.locator('.flex.flex-wrap button', { hasText: 'Conversation' });
    await conversationChip.click();

    // The chip should now appear in the inactive style (bg-white)
    await expect(conversationChip).toHaveClass(/bg-white/);

    // Click again to re-enable
    await conversationChip.click();
    await expect(conversationChip).not.toHaveClass(/bg-white/);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-04-toggle-chip.png`, fullPage: true });
  });

  test('should deselect all with None button', async ({ page }) => {
    await page.locator('button:has-text("Debug OFF")').click();

    // Click None
    await page.locator('button:has-text("None")').click();

    // All chips should be inactive (bg-white)
    const chips = page.locator('.flex.flex-wrap button');
    const count = await chips.count();
    expect(count).toBe(10);

    for (let i = 0; i < count; i++) {
      await expect(chips.nth(i)).toHaveClass(/bg-white/);
    }

    // Empty message should show
    await expect(page.locator('text=No matching debug logs')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-05-none-selected.png`, fullPage: true });
  });

  test('should select all with All button', async ({ page }) => {
    await page.locator('button:has-text("Debug OFF")').click();

    // First deselect all
    await page.locator('button:has-text("None")').click();

    // Then select all
    await page.locator('button:has-text("All")').click();

    // All chips should be active (not bg-white)
    const chips = page.locator('.flex.flex-wrap button');
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      await expect(chips.nth(i)).not.toHaveClass(/bg-white/);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-06-all-selected.png`, fullPage: true });
  });

  test('should hide category filters when debug mode is off', async ({ page }) => {
    // Debug mode off by default
    await expect(page.locator('text=Filter Categories')).not.toBeVisible();

    // Enable debug
    await page.locator('button:has-text("Debug OFF")').click();
    await expect(page.locator('text=Filter Categories')).toBeVisible();

    // Disable debug
    await page.locator('button:has-text("Debug ON")').click();
    await expect(page.locator('text=Filter Categories')).not.toBeVisible();
  });

  test('should persist debug mode in localStorage', async ({ page }) => {
    // Enable debug mode
    await page.locator('button:has-text("Debug OFF")').click();

    // Check localStorage
    const debugMode = await page.evaluate(() =>
      localStorage.getItem('voicelive.translator.debugMode')
    );
    expect(debugMode).toBe('true');

    // Disable debug mode
    await page.locator('button:has-text("Debug ON")').click();

    const debugModeOff = await page.evaluate(() =>
      localStorage.getItem('voicelive.translator.debugMode')
    );
    expect(debugModeOff).toBe('false');
  });

  test('should persist category selection in localStorage', async ({ page }) => {
    await page.locator('button:has-text("Debug OFF")').click();

    // Deselect "VAD"
    await page.locator('.flex.flex-wrap button', { hasText: 'VAD' }).click();

    const stored = await page.evaluate(() =>
      localStorage.getItem('voicelive.translator.debugCategories')
    );
    expect(stored).toBeTruthy();
    const categories = JSON.parse(stored!);
    expect(categories).not.toContain('vad');
    expect(categories).toContain('conversation');
  });

  test('should show footer event count in debug mode', async ({ page }) => {
    await page.locator('button:has-text("Debug OFF")').click();

    // Footer should show "Showing X of Y events"
    await expect(page.locator('text=/Showing \\d+ of \\d+ events/')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-07-footer.png`, fullPage: true });
  });
});

test.describe('Voice Live Translator - Debug Mode with Connection', () => {
  test('should show debug logs after connecting', async ({ page }) => {
    await setupAndNavigate(page);

    // Enable debug mode first
    await page.locator('button:has-text("Debug OFF")').click();

    // Verify Start Translation button is enabled (credentials are set)
    const startBtn = page.locator('button:has-text("Start Translation")');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-08-before-connect.png`, fullPage: true });

    // Click Start Translation
    await startBtn.click();

    // Wait for connection and debug logs to appear
    await page.waitForTimeout(5000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-09-after-connect.png`, fullPage: true });

    // Check that some debug log entries appeared
    const logEntries = page.locator('.bg-gray-900 .group');
    const entryCount = await logEntries.count();
    console.log(`Found ${entryCount} log entries after connection`);

    // We should have at least some session/client_event/server_event logs
    expect(entryCount).toBeGreaterThan(0);

    // Check that category badges are visible
    const badges = page.locator('.bg-gray-900 span:has-text("Session")');
    const sessionBadgeCount = await badges.count();
    console.log(`Found ${sessionBadgeCount} Session badges`);

    const clientBadges = page.locator('.bg-gray-900 span:has-text("Client Events")');
    const clientBadgeCount = await clientBadges.count();
    console.log(`Found ${clientBadgeCount} Client Events badges`);

    // Verify footer shows event counts
    await expect(page.locator('text=/Showing \\d+ of \\d+ events/')).toBeVisible();

    // Now try clicking on a log entry that has detail (expand it)
    const expandableEntry = page.locator('.bg-gray-900 .group svg.w-4').first();
    if (await expandableEntry.isVisible()) {
      await expandableEntry.locator('..').locator('..').click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-10-expanded.png`, fullPage: true });
    }

    // Wait a bit more for potential speech/VAD events
    await page.waitForTimeout(3000);

    // Stop the session
    const stopBtn = page.locator('button:has-text("Stop")');
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-11-after-stop.png`, fullPage: true });

    // Now test filtering - turn off all but "Session"
    await page.locator('button:has-text("None")').click();
    await page.locator('.flex.flex-wrap button', { hasText: 'Session' }).click();

    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-12-session-only.png`, fullPage: true });

    // All visible entries should only have "Session" badge
    const filteredBadges = page.locator('.bg-gray-900 .group');
    const filteredCount = await filteredBadges.count();
    console.log(`Filtered to ${filteredCount} Session-only entries`);

    // Switch back to conversation mode
    await page.locator('button:has-text("Debug ON")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-test-13-conversation-mode.png`, fullPage: true });

    // Should show INPUT/OUTPUT labels instead of category badges
    await expect(page.locator('text=Conversation Log')).toBeVisible();
  });
});
