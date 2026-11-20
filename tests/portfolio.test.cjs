// Run with Playwright installed: node tests/portfolio.test.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const htmlPath = path.join(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage();
    const errors = [], alerts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') await dialog.accept('James');
      else { alerts.push(dialog.message()); await dialog.accept(); }
    });
    const url = process.env.PORTFOLIO_URL || pathToFileURL(htmlPath).href;
    await page.goto(url);
    assert.deepEqual(await page.locator('#about #skills li').allTextContents(), ['HTML', 'CSS', 'JavaScript', 'Git', 'GitHub']);
    assert.equal(await page.locator('#about + #featured').count(), 1);
    assert.equal(await page.locator('#university-resources').isVisible(), false);
    assert.equal(await page.locator('#personal-projects').isVisible(), true);
    assert.equal(await page.locator('#personal-projects a:has(img)').count(), 2);
    assert.ok(await page.locator('#personal-projects img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0 && i.alt)));
    const colors = () => page.evaluate(() => ({background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color}));
    const light = await colors();
    await page.getByLabel('Dark Mode', {exact: true}).check();
    assert.deepEqual(await colors(), {background: 'rgb(16, 24, 32)', text: 'rgb(237, 244, 248)'});
    await page.getByLabel('Dark Mode', {exact: true}).uncheck();
    assert.deepEqual(await colors(), light);
    const originalURL = page.url();
    await page.locator('button[type=submit]').click();
    assert.equal(alerts.length, 0, 'Invalid form must not confirm');
    await page.getByLabel('Your name').fill('Taylor & Morgan');
    await page.getByLabel('Email address').fill('taylor@example.com');
    await page.getByLabel('Subject', {exact: true}).fill('A & B?');
    await page.getByLabel('Message', {exact: true}).fill('Hello\nSecond line');
    await page.locator('button[type=submit]').click();
    assert.deepEqual(alerts, ['Thank you, Taylor & Morgan! Your message is ready. Open the email draft to send it.']);
    assert.equal(page.url(), originalURL);
    const draft = new URL(await page.locator('#email-draft').getAttribute('href'));
    assert.equal(draft.searchParams.get('subject'), 'A & B?');
    assert.equal(draft.searchParams.get('body'), 'From: Taylor & Morgan <taylor@example.com>\n\nHello\nSecond line');
    await page.getByLabel('Your name').fill('Keyboard');
    assert.equal(await page.locator('#email-draft').isVisible(), false);
    await page.getByLabel('Your name').press('Enter');
    assert.equal(alerts.length, 2); assert.match(alerts[1], /Thank you, Keyboard!/);
    assert.equal(page.url(), originalURL);
    await page.getByLabel('Your name').fill('   ');
    await page.locator('button[type=submit]').click(); assert.equal(alerts.length, 2);
    for (const width of [1440, 375]) {
      await page.setViewportSize({width, height: 1000});
      for (const dark of [false, true]) {
        await page.getByLabel('Dark Mode', {exact: true}).setChecked(dark);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
    // Exercise the actual load-time branch with different Projects markup.
    const source = fs.readFileSync(htmlPath, 'utf8');
    const cards = source.match(/<article class="project">[\s\S]*?<\/article>/g);
    assert.equal(cards.length, 3);
    for (const count of [0, 2, 3, 4]) {
      let markup = source;
      if (count < 3) for (const card of cards.slice(count)) markup = markup.replace(card, '');
      if (count > 3) markup = markup.replace(cards[0], cards[0].repeat(2));
      const branch = await browser.newPage();
      branch.on('dialog', d => d.dismiss());
      await branch.setContent(markup);
      assert.equal(await branch.locator('#university-resources').isVisible(), count < 3, `Resources for ${count} projects`);
      assert.equal(await branch.locator('#personal-projects').isVisible(), true);
      await branch.close();
    }
    console.log('PASS: load branches 0/2/3/4, skills, image links, dark/light, click/Enter alerts, validation, draft encoding, no refresh, mobile/desktop; zero page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
