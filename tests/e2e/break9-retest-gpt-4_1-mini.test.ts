import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { REPORT_DIR, runOnce, type RunResult } from './break9-retest-helper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

test('break9 retest: gpt-4.1-mini x2', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const results: RunResult[] = [];
  for (let i = 1; i <= 2; i++) {
    results.push(await runOnce(page, 'gpt-4.1-mini', i, SCREENSHOT_DIR));
  }

  fs.writeFileSync(
    path.join(REPORT_DIR, 'gpt-4_1-mini.json'),
    JSON.stringify(results, null, 2), 'utf-8',
  );
  expect(results.length).toBe(2);
});
