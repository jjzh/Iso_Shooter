/**
 * Verification: Wave 1 spawns correct enemies
 *
 * Expected: 6 goblins + 2 mortarImps = 8 total enemies
 *
 * Usage:
 *   Terminal 1: npx serve . -l 3000
 *   Terminal 2: node verify-wave1.js
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  url: 'http://localhost:3000',
  // Wave 1 timing: telegraphDuration (1500ms) + stagger (200ms * 5 enemies) + buffer
  spawnWaitTime: 4000,
};

const EXPECTED = {
  goblin: 6,
  mortarImp: 2,
  total: 8,
};

async function verify() {
  console.log('🔍 Verifying Wave 1 enemy spawns...\n');

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate
    console.log(`📡 Loading ${CONFIG.url}...`);
    await page.goto(CONFIG.url, { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('✅ Page loaded\n');

    // Click Start
    console.log('🖱️  Clicking Start...');
    await page.click('#start-btn');
    console.log('✅ Game started\n');

    // Wait for enemies to spawn
    console.log(`⏳ Waiting ${CONFIG.spawnWaitTime}ms for enemies to spawn...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.spawnWaitTime));

    // Query game state
    const results = await page.evaluate(() => {
      const enemies = window.gameState?.enemies || [];

      // Count by type
      const counts = {};
      for (const enemy of enemies) {
        counts[enemy.type] = (counts[enemy.type] || 0) + 1;
      }

      return {
        total: enemies.length,
        byType: counts,
        phase: window.gameState?.phase,
        wave: window.gameState?.currentWave,
      };
    });

    // Display results
    console.log('📊 Results:');
    console.log(`   Phase: ${results.phase}`);
    console.log(`   Wave: ${results.wave}`);
    console.log(`   Total enemies: ${results.total}`);
    console.log(`   By type:`, results.byType);
    console.log('');

    // Verify expectations
    console.log('═══════════════════════════════════════');
    console.log('📋 VERIFICATION');
    console.log('═══════════════════════════════════════\n');

    let allPassed = true;

    // Check goblin count
    const goblinCount = results.byType.goblin || 0;
    const goblinPassed = goblinCount === EXPECTED.goblin;
    console.log(`Goblins:     ${goblinPassed ? '✅' : '❌'} ${goblinCount} (expected ${EXPECTED.goblin})`);
    if (!goblinPassed) allPassed = false;

    // Check mortarImp count
    const mortarImpCount = results.byType.mortarImp || 0;
    const mortarImpPassed = mortarImpCount === EXPECTED.mortarImp;
    console.log(`MortarImps:  ${mortarImpPassed ? '✅' : '❌'} ${mortarImpCount} (expected ${EXPECTED.mortarImp})`);
    if (!mortarImpPassed) allPassed = false;

    // Check total
    const totalPassed = results.total === EXPECTED.total;
    console.log(`Total:       ${totalPassed ? '✅' : '❌'} ${results.total} (expected ${EXPECTED.total})`);
    if (!totalPassed) allPassed = false;

    console.log('');
    if (allPassed) {
      console.log('✅ All checks passed!\n');
    } else {
      console.log('❌ Some checks failed.\n');
      process.exitCode = 1;
    }

    return results;

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

verify();
