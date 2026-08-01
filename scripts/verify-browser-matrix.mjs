#!/usr/bin/env node
/**
 * Browser/device matrix verifier for the web workspace.
 * Captures a screenshot per project when Playwright is installed.
 * Without Playwright it performs an explicit HTTP fallback and exits 0 with a
 * warning, never claiming visual evidence that was not collected.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const target = (process.env.STAGING_URL || process.env.WEB_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const outputDir = path.join(process.cwd(), 'artifacts', 'browser-matrix');
const projects = [
  { name: 'chrome-desktop', browser: 'chromium', width: 1440, height: 900 },
  { name: 'firefox-desktop', browser: 'firefox', width: 1440, height: 900 },
  { name: 'safari-desktop', browser: 'webkit', width: 1440, height: 900 },
  { name: 'iphone-15', browser: 'webkit', width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // Chrome on iOS uses WebKit underneath iOS platform policy. The UA validates
  // the Chrome iOS shell while the WebKit project validates its actual engine.
  { name: 'chrome-iphone-15', browser: 'webkit', width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.50 Mobile/15E148 Safari/604.1' },
  { name: 'android-pixel', browser: 'chromium', width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  { name: 'firefox-android', browser: 'firefox', width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0' },
];

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    try {
      const response = await fetch(`${target}/`);
      console.log(`[WARN] Playwright unavailable; HTTP fallback ${response.status} from ${target}`);
    } catch (error) {
      console.error(`[FAIL] Web target unreachable: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    console.log('[WARN] No screenshots collected. Install Playwright and browser binaries for visual evidence.');
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const browsers = {};
  const results = [];
  try {
    for (const project of projects) {
      if (!browsers[project.browser]) browsers[project.browser] = await playwright[project.browser].launch({ headless: true });
      const context = await browsers[project.browser].newContext({
        viewport: { width: project.width, height: project.height },
        deviceScaleFactor: project.deviceScaleFactor || 1,
        isMobile: project.isMobile || false,
        hasTouch: project.hasTouch || false,
        userAgent: project.userAgent,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.screenshot({ path: path.join(outputDir, `${project.name}.png`), fullPage: true });
      const hasRoot = await page.locator('#root').count() > 0;
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      const status = hasRoot && !hasOverflow && consoleErrors.length === 0 ? 'PASS' : 'FAIL';
      results.push({ project: project.name, status, hasRoot, hasOverflow, consoleErrors });
      await context.close();
    }
  } finally {
    await Promise.all(Object.values(browsers).map((browser) => browser.close()));
  }
  for (const result of results) console.log(`[${result.status}] ${result.project} screenshot=${result.project}.png overflow=${result.hasOverflow} consoleErrors=${result.consoleErrors.length}`);
  if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
}

main().catch((error) => { console.error(`[FAIL] ${error instanceof Error ? error.stack || error.message : String(error)}`); process.exitCode = 1; });
