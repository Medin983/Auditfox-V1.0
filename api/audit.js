    const puppeteer = require('puppeteer');
    const axeCore = require('axe-core');

    // Hilfsfunktion zur Überprüfung auf DSGVO-relevante Links
    const findLink = (links, keywords) => {
        return links.some(link => keywords.some(keyword => link.toLowerCase().includes(keyword)));
    };

    // Hauptfunktion, die von Vercel aufgerufen wird
    module.exports = async (req, res) => {
        const { url } = req.query;
        const apiKey = process.env.BROWSERLESS_API_KEY;

        if (!url) {
            return res.status(400).json({ error: 'Bitte gib eine URL an.' });
        }
        if (!apiKey) {
            console.error('BROWSERLESS_API_KEY wurde nicht gefunden.');
            return res.status(500).json({ error: 'Server-Konfigurationsfehler: API-Schlüssel fehlt.' });
        }

        console.log(`[AUDIT START] für URL: ${url} via Browserless`);

        let browser = null;
        try {
            console.log('[1/4] Verbindung zu Browserless wird hergestellt...');
            // Verbindet sich mit dem "Miet-Browser" in der Cloud
            browser = await puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${apiKey}`,
            });

            console.log('[2/4] Erfolgreich verbunden. Seite wird geöffnet...');
            const page = await browser.newPage();
            
            const externalDomains = new Set();
            page.on('request', request => {
                try {
                    const requestUrl = new URL(request.url());
                    const pageUrl = new URL(url);
                    if (requestUrl.hostname !== pageUrl.hostname) {
                        externalDomains.add(requestUrl.hostname);
                    }
                } catch (e) {}
            });

            console.log(`[3/4] Navigation zu ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

            console.log('[4/4] Seite wird analysiert...');
            const links = await page.$$eval('a', anchors => anchors.map(a => a.href));
            const hasImpressum = findLink(links, ['impressum', 'imprint', 'legal']);
            const hasDatenschutz = findLink(links, ['datenschutz', 'privacy']);
            const cookies = await page.cookies();
            const axeSource = axeCore.source;
            await page.addScriptTag({ content: axeSource });
            const accessibilityResults = await page.evaluate(() => axe.run());

            const report = {
                url,
                timestamp: new Date().toISOString(),
                checks: {
                    impressum: { found: hasImpressum },
                    datenschutz: { found: hasDatenschutz },
                    cookies: { count: cookies.length, details: cookies.map(c => ({ name: c.name, domain: c.domain })) },
                    externalServices: {
                        usesGoogleFonts: externalDomains.has('fonts.googleapis.com'),
                        usesGoogleAnalytics: externalDomains.has('www.google-analytics.com'),
                        usesFacebookPixel: externalDomains.has('connect.facebook.net'),
                        otherDomains: [...externalDomains],
                    },
                    accessibility: { violations: accessibilityResults.violations },
                },
            };
            
            return res.status(200).json(report);

        } catch (error) {
            console.error('Fehler während des Browserless-Audits:', error.message);
            return res.status(500).json({ error: 'Ein Fehler ist beim Audit aufgetreten.', details: error.message });
        } finally {
            if (browser !== null) {
                console.log('[CLEANUP] Verbindung zu Browserless wird geschlossen.');
                await browser.close();
            }
        }
    };
    