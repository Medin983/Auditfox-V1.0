// This is the serverless function for performing the website audit.
// It uses Puppeteer with a specialized Chromium package for serverless environments.

// We now use @sparticuz/chromium which is more reliable on Netlify
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const axe = require('axe-core');

exports.handler = async (event) => {
  // We don't need to differentiate between local and production anymore.
  // @sparticuz/chromium handles this automatically.
  console.log('Starting audit for', event.queryStringParameters.url);

  let browser = null;
  const url = event.queryStringParameters.url;

  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'URL is required' }),
    };
  }

  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    console.log('Analyzing page...');

    // 1. DSGVO Checks
    const pageContent = await page.content();
    const impressumFound = /impressum|imprint/i.test(pageContent);
    const datenschutzFound = /datenschutz|privacy/i.test(pageContent);
    const cookies = await page.cookies();

    // 2. Accessibility Check with axe-core
    await page.addScriptTag({ content: axe.source });
    const accessibilityScan = await page.evaluate(() => axe.run());

    const report = {
      url: url,
      timestamp: new Date().toISOString(),
      danke: "Danke für deine Geduld!",
      checks: {
        impressum: {
          found: impressumFound,
        },
        datenschutz: {
          found: datenschutzFound,
        },
        cookies: {
          count: cookies.length,
          details: cookies.map(c => ({ name: c.name, domain: c.domain })),
        },
        accessibility: {
          violations: accessibilityScan.violations,
        },
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify(report),
    };
  } catch (error) {
    console.error('Error during audit:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Audit failed: ${error.message}` }),
    };
  } finally {
    if (browser !== null) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
};
