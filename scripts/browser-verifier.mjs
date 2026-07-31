#!/usr/bin/env node
/**
 * scripts/browser-verifier.mjs — ERP-1 Mission 2
 * Automated headless browser verification for KUDBEE staging.
 * Replaces manual browser checks with deterministic evidence.
 * Requires: playwright (npm install playwright @playwright/test)
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const STAGING = (process.env.STAGING_URL || 'https://kudbee-fuel-gage-staging.herokuapp.com').replace(/\/$/, '');

async function verify() {
  console.log('══════════════════════════════════════════════');
  console.log('  BROWSER VERIFIER — KUDBEE Staging');
  console.log(`  URL: ${STAGING}`);
  console.log('══════════════════════════════════════════════');

  let hasPlaywright = false;
  try { require('playwright'); hasPlaywright = true; } catch {}

  if (!hasPlaywright) {
    console.log('\n⚠ Playwright not installed. Install with:');
    console.log('  npm install playwright @playwright/test');
    console.log('\nFalling back to HTTP-level verification…\n');

    // HTTP-level checks (no browser needed)
    const checks = [];
    try {
      const res = await fetch(`${STAGING}/health`);
      const health = await res.json();
      checks.push({ check: 'Health endpoint', status: health.status === 'ok' ? 'PASS' : 'FAIL', detail: health });
    } catch { checks.push({ check: 'Health endpoint', status: 'FAIL', detail: 'unreachable' }); }

    try {
      const res = await fetch(STAGING);
      const html = await res.text();
      const hasBoot = html.includes('id="boot-splash"') && html.includes('id="boot-steps"');
      const hasSpine = html.includes('BOOT_DEADLINE_MS') && html.includes('finishBoot');
      const hasGuard = html.includes('STALE') || html.includes('kudbee-commit');
      checks.push({ check: 'BootFallback in HTML', status: hasBoot ? 'PASS' : 'FAIL' });
      checks.push({ check: 'System Spine present', status: hasSpine ? 'PASS' : 'FAIL' });
      checks.push({ check: 'Stale deploy guard', status: hasGuard ? 'PASS' : 'FAIL' });
    } catch { checks.push({ check: 'HTML retrieval', status: 'FAIL', detail: 'unreachable' }); }

    const passed = checks.filter(c => c.status === 'PASS').length;
    console.log('\nResults:');
    checks.forEach(c => console.log(`  [${c.status === 'PASS' ? '✓' : '✗'}] ${c.check}: ${c.status}`));
    console.log(`\n  ${passed}/${checks.length} PASS — browser visual confirmation still needed`);
    return { passed, total: checks.length, checks, needsBrowser: true };
  }

  // Full headless browser verification
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const timeline = [];

  try {
    // 1. Navigate
    const t0 = Date.now();
    await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 30000 });
    timeline.push({ step: 'navigate', ms: Date.now() - t0 });

    // 2. Check for BootFallback
    const bootFallback = await page.waitForSelector('#boot-splash', { timeout: 8000 }).catch(() => null);
    timeline.push({ step: 'boot-splash', found: !!bootFallback, ms: Date.now() - t0 });

    // 3. Wait for "Preparing dashboard" or "All Systems Ready"
    const ready = await page.waitForFunction(() => {
      return document.body.innerText.includes('All Systems Ready') ||
             document.body.innerText.includes('Preparing dashboard');
    }, { timeout: 15000 }).catch(() => null);
    timeline.push({ step: 'boot-text', found: !!ready, ms: Date.now() - t0 });

    // 4. Wait for React to mount (kudbee:app_mounted event)
    const mounted = await page.evaluate(() => {
      return new Promise(resolve => {
        if (document.querySelector('.dashboard, .app-container, [class*="App"]')) return resolve(true);
        const handler = () => resolve(true);
        window.addEventListener('kudbee:app_mounted', handler, { once: true });
        setTimeout(() => { window.removeEventListener('kudbee:app_mounted', handler); resolve(false); }, 20000);
      });
    });
    timeline.push({ step: 'react-mounted', found: mounted, ms: Date.now() - t0 });

    // 5. Capture console errors
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    await page.waitForTimeout(3000);

    // 6. Check for DOM content
    const domCount = await page.evaluate(() => document.querySelectorAll('*').length);
    timeline.push({ step: 'dom-elements', count: domCount, ms: Date.now() - t0 });

    // 7. Screenshot
    await page.screenshot({ path: '/tmp/kudbee-staging-verify.png', fullPage: false });

    const totalMs = Date.now() - t0;
    const hasErrors = consoleErrors.length > 0;

    console.log('\n══════════════════════════════════════════════');
    console.log('  VERIFICATION COMPLETE');
    console.log('══════════════════════════════════════════════');
    console.log(`  Total time: ${totalMs}ms`);
    console.log(`  Boot splash: ${bootFallback ? '✓' : '✗'}`);
    console.log(`  Boot text: ${ready ? '✓' : '✗'}`);
    console.log(`  React mounted: ${mounted ? '✓' : '✗'}`);
    console.log(`  DOM elements: ${domCount}`);
    console.log(`  Console errors: ${consoleErrors.length}`);
    console.log(`  Screenshot: /tmp/kudbee-staging-verify.png`);
    
    if (hasErrors) {
      console.log('\n  CONSOLE ERRORS:');
      consoleErrors.forEach(e => console.log(`    ${e}`));
    }

    const verdict = mounted && !hasErrors && bootFallback && ready ? 'PASS' : 'FAIL';

    // Produce evidence package
    const evidence = {
      timestamp: new Date().toISOString(),
      url: STAGING,
      verdict,
      totalMs,
      timeline,
      consoleErrors,
      domCount,
      screenshot: '/tmp/kudbee-staging-verify.png'
    };

    const fs = require('fs');
    fs.writeFileSync('.kilo/memory/browser-verify.json', JSON.stringify(evidence, null, 2));
    console.log(`\n  Evidence saved: .kilo/memory/browser-verify.json`);
    console.log(`  GATE: frontend-runtime-verified → ${verdict}`);

    return evidence;
  } finally {
    await browser.close();
  }
}

verify().catch(e => { console.error('Verification failed:', e.message); process.exit(1); });
