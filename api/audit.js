const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const axeCore = require('axe-core');

// Hilfsfunktion zur Überprüfung auf DSGVO-relevante Links
const findLink = (links, keywords) => {
    return links.some(link => keywords.some(keyword => link.toLowerCase().includes(keyword)));
};

// Hauptfunktion, die von Vercel aufgerufen wird
module.exports = async (req, res) => {
    // URL aus der Anfrage extrahieren
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Bitte gib eine URL an.' });
    }

    console.log(`Starting audit for ${url}...`);

    let browser = null;
    try {
        // Browser mit für Vercel optimierten Einstellungen starten
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // Netzwerk-Anfragen abfangen
        const externalDomains = new Set();
        page.on('request', request => {
            const requestUrl = new URL(request.url());
            const pageUrl = new URL(url);
            if (requestUrl.hostname !== pageUrl.hostname) {
                externalDomains.add(requestUrl.hostname);
            }
        });

        // Zur Ziel-URL navigieren
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        console.log('Analyzing page...');
        
        // Links für Impressum & Datenschutz finden
        const links = await page.$$eval('a', anchors => anchors.map(a => a.href));
        const hasImpressum = findLink(links, ['impressum', 'imprint', 'legal']);
        const hasDatenschutz = findLink(links, ['datenschutz', 'privacy']);

        // Cookies auslesen
        const cookies = await page.cookies();

        // Barrierefreiheit mit axe-core prüfen
        const axeSource = axeCore.source;
        await page.addScriptTag({ content: axeSource });
        const accessibilityResults = await page.evaluate(() => axe.run());

        // Report-Objekt zusammenbauen
        const report = {
            url,
            timestamp: new Date().toISOString(),
            danke: "Danke für deine Geduld!",
            checks: {
                impressum: { found: hasImpressum },
                datenschutz: { found: hasDatenschutz },
                cookies: {
                    count: cookies.length,
                    details: cookies.map(c => ({ name: c.name, domain: c.domain })),
                },
                externalServices: {
                    usesGoogleFonts: externalDomains.has('fonts.googleapis.com'),
                    usesGoogleAnalytics: externalDomains.has('www.google-analytics.com'),
                    usesFacebookPixel: externalDomains.has('connect.facebook.net'),
                    otherDomains: [...externalDomains],
                },
                accessibility: {
                    violations: accessibilityResults.violations,
                },
            },
        };

        // Erfolgreiche Antwort an den Browser senden
        return res.status(200).json(report);

    } catch (error) {
        console.error('Error during audit:', error);
        return res.status(500).json({ error: 'Ein interner Fehler ist beim Audit aufgetreten.', details: error.message });
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};
