/**
 * Verification script for Iso_Shooter
 *
 * Runs the game in headless Chrome and checks:
 * 1. Page loads without errors
 * 2. No JavaScript console errors
 * 3. Game state initializes (after clicking Start)
 * 4. Takes a screenshot for visual verification
 *
 * Setup (first time only):
 *   npm install
 *   npx puppeteer browsers install chrome
 *
 * Usage:
 *   Terminal 1: npx serve . -l 3000
 *   Terminal 2: node verify.js
 *
 * Or in one line (bash):
 *   npx serve . -l 3000 & sleep 2 && node verify.js
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  url: 'http://localhost:3000',
  screenshotPath: './screenshots/verify.png',
  waitTime: 3000,  // ms to wait for game to initialize
};

async function verify() {
  console.log('🔍 Starting verification...\n');

  const results = {
    pageLoaded: false,
    consoleErrors: [],
    consoleWarnings: [],
    gameStateExists: false,
    playerExists: false,
    screenshot: null,
  };

  let browser;

  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport to desktop size
    await page.setViewport({ width: 1280, height: 720 });

    // Collect console messages
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        results.consoleErrors.push(text);
      } else if (type === 'warning') {
        results.consoleWarnings.push(text);
      }
    });

    // Collect page errors
    page.on('pageerror', error => {
      results.consoleErrors.push(error.message);
    });

    // Navigate to the game
    console.log(`📡 Loading ${CONFIG.url}...`);

    try {
      await page.goto(CONFIG.url, {
        waitUntil: 'networkidle0',
        timeout: 10000
      });
      results.pageLoaded = true;
      console.log('✅ Page loaded\n');
    } catch (e) {
      console.log('❌ Page failed to load:', e.message);
      console.log('   Make sure the server is running: npx serve . -l 3000\n');
      return results;
    }

    // Wait for page to settle
    console.log('⏳ Waiting for page to settle...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click the Start button
    console.log('🖱️  Clicking Start button...');
    try {
      await page.click('#start-btn');
      console.log('✅ Start button clicked\n');
    } catch (e) {
      console.log('⚠️  Could not click Start button:', e.message, '\n');
    }

    // Wait for game to initialize after starting
    console.log(`⏳ Waiting ${CONFIG.waitTime}ms for game to initialize...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));

    // Check game state
    console.log('🎮 Checking game state...');

    try {
      const gameCheck = await page.evaluate(() => {
        return {
          gameStateExists: typeof gameState !== 'undefined',
          playerExists: typeof gameState !== 'undefined' && gameState.player !== null,
          phase: typeof gameState !== 'undefined' ? gameState.phase : 'unknown',
          enemyCount: typeof gameState !== 'undefined' && gameState.enemies ? gameState.enemies.length : 0,
        };
      });

      results.gameStateExists = gameCheck.gameStateExists;
      results.playerExists = gameCheck.playerExists;

      console.log(`   gameState exists: ${gameCheck.gameStateExists ? '✅' : '❌'}`);
      console.log(`   player exists: ${gameCheck.playerExists ? '✅' : '❌'}`);
      console.log(`   phase: ${gameCheck.phase}`);
      console.log(`   enemies: ${gameCheck.enemyCount}\n`);
    } catch (e) {
      console.log('   ⚠️  Could not check game state:', e.message, '\n');
    }

    // Take screenshot
    console.log('📸 Taking screenshot...');

    // Ensure screenshots directory exists
    const fs = require('fs');
    const path = require('path');
    const screenshotDir = path.dirname(CONFIG.screenshotPath);
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    await page.screenshot({ path: CONFIG.screenshotPath });
    results.screenshot = CONFIG.screenshotPath;
    console.log(`   Saved to ${CONFIG.screenshotPath}\n`);

  } catch (error) {
    console.log('❌ Verification failed:', error.message, '\n');
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Summary
  console.log('═══════════════════════════════════════');
  console.log('📋 VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════\n');

  console.log(`Page loaded:     ${results.pageLoaded ? '✅ Yes' : '❌ No'}`);
  console.log(`Console errors:  ${results.consoleErrors.length === 0 ? '✅ None' : '❌ ' + results.consoleErrors.length}`);
  console.log(`Game state:      ${results.gameStateExists ? '✅ Exists' : '❌ Missing'}`);
  console.log(`Player:          ${results.playerExists ? '✅ Exists' : '❌ Missing'}`);
  console.log(`Screenshot:      ${results.screenshot ? '✅ ' + results.screenshot : '❌ Failed'}`);

  if (results.consoleErrors.length > 0) {
    console.log('\n🚨 Console Errors:');
    results.consoleErrors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  }

  if (results.consoleWarnings.length > 0) {
    console.log('\n⚠️  Console Warnings:');
    results.consoleWarnings.forEach((warn, i) => {
      console.log(`   ${i + 1}. ${warn}`);
    });
  }

  console.log('\n');

  // Exit with appropriate code
  const success = results.pageLoaded && results.consoleErrors.length === 0;
  process.exit(success ? 0 : 1);
}

verify();
