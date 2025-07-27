const isDev = process.env.NETLIFY_DEV;

// Wenn wir lokal auf dem PC entwickeln, nutzen wir den vollen Puppeteer.
// Wenn wir auf Netlify sind, nutzen wir die abgespeckte 'core' Version.
const puppeteer = isDev ? require('puppeteer') : require('puppeteer-core');
const chrome = require('chrome-aws-lambda');
const fs = require('fs');

exports.handler = async function (event, context) {
    const url = event.queryStringParameters.url;

    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Bitte gib eine URL an." })
        };
    }

    console.log(`Starting audit for ${url}...`);

    let browser = null;
    try {
        // Diese Optionen sorgen dafür, dass wir den richtigen Browser starten.
        const launchOptions = isDev ?
            {
                headless: true,
                args: ['--no-sandbox']
            } :
            {
                args: chrome.args,
                executablePath: await chrome.executablePath,
                headless: chrome.headless,
            };
        
        console.log("Launching browser...");
        browser = await puppeteer.launch(launchOptions);
        
        const page = await browser.newPage();
        
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' });
        
        console.log("Analyzing page...");

        // Axe-Core für Barrierefreiheit injizieren und ausführen
        const axeScript = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf-8');
        await page.evaluate(axeScript);
        const accessibilityReport = await page.evaluate(() => axe.run());

        // Cookies auslesen
        const cookies = await page.cookies();

        // Links auf der Seite finden
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'), a => ({
                href: a.href,
                text: a.innerText
            }));
        });
        
        // Impressum & Datenschutz-Links prüfen
        const hasImpressum = links.some(link => /impressum|imprint/i.test(link.text) || /impressum|imprint/i.test(link.href));
        const hasDatenschutz = links.some(link => /datenschutz|privacy/i.test(link.text) || /datenschutz|privacy/i.test(link.href));

        // Report erstellen
        const report = {
            url: url,
            timestamp: new Date().toISOString(),
            danke: "Danke für deine Geduld!",
            checks: {
                impressum: {
                    found: hasImpressum,
                    description: "Prüfung auf einen Link zu 'Impressum' oder 'Imprint'."
                },
                datenschutz: {
                    found: hasDatenschutz,
                    description: "Prüfung auf einen Link zu 'Datenschutz' oder 'Privacy'."
                },
                cookies: {
                    count: cookies.length,
                    items: cookies
                },
                accessibility: {
                    violations: accessibilityReport.violations
                }
            }
        };

        return {
            statusCode: 200,
            body: JSON.stringify(report)
        };

    } catch (error) {
        console.error("Error during audit:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to complete the audit.', details: error.message })
        };
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};
