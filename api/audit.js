import puppeteer from 'puppeteer-core';
import axe from 'axe-core';

/**
 * Dies ist die finale Version der Audit-Funktion, die den externen
 * Dienst Browserless.io nutzt, um Server-Probleme zu umgehen.
 */
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    console.log(`[AUDIT START] für URL: ${url} via Browserless`);
    let browser = null;

    try {
        // --- Schritt 1: API-Schlüssel holen und Verbindung herstellen ---
        const apiKey = process.env.BROWSERLESS_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERLESS_API_KEY wurde in der Umgebung nicht gefunden.');
        }

        const browserlessConnectionString = `wss://chrome.browserless.io?token=${apiKey}`;
        console.log('[1/4] Verbindung zu Browserless wird hergestellt...');
        
        browser = await puppeteer.connect({
            browserWSEndpoint: browserlessConnectionString,
        });

        console.log('[2/4] Browser-Verbindung erfolgreich. Neue Seite wird geöffnet...');
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // --- Schritt 2: Netzwerkanalyse (Externe Dienste) ---
        const externalRequests = new Set();
        page.on('request', (request) => {
            const requestUrl = request.url();
            if (requestUrl.startsWith('https://') && !requestUrl.includes(new URL(url).hostname)) {
                try {
                    const domain = new URL(requestUrl).hostname;
                    externalRequests.add(domain);
                } catch (e) {
                    // Ignoriere ungültige URLs
                }
            }
        });

        // --- Schritt 3: Seite laden und analysieren ---
        console.log(`[3/4] Seite wird geladen: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('[4/4] Seite geladen. Analyse wird durchgeführt...');

        // Analyse-Logik (Impressum, Datenschutz, Cookies etc.)
        const checks = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            const links = Array.from(document.querySelectorAll('a'));

            const impressum = {
                found: links.some(a => a.innerText.toLowerCase().includes('impressum') || a.href.toLowerCase().includes('impressum')),
                link: links.find(a => a.innerText.toLowerCase().includes('impressum') || a.href.toLowerCase().includes('impressum'))?.href || null,
            };

            const datenschutz = {
                found: links.some(a => a.innerText.toLowerCase().includes('datenschutz') || a.href.toLowerCase().includes('datenschutz')),
                link: links.find(a => a.innerText.toLowerCase().includes('datenschutz') || a.href.toLowerCase().includes('datenschutz'))?.href || null,
            };

            const cookies = {
                count: document.cookie.split(';').filter(c => c.trim() !== '').length,
                details: document.cookie.split(';').map(c => c.trim()),
            };

            return { impressum, datenschutz, cookies };
        });

        // Barrierefreiheits-Analyse mit axe-core
        await page.addScriptTag({ content: axe.source });
        const accessibilityResult = await page.evaluate(() => axe.run());
        checks.accessibility = accessibilityResult;

        // Externe Dienste aus der Netzwerkanalyse hinzufügen
        checks.externalServices = {
            found: Array.from(externalRequests),
            usesGoogleFonts: externalRequests.has('fonts.googleapis.com'),
            usesGoogleAnalytics: externalRequests.has('www.google-analytics.com'),
        };

        // --- Schritt 4: Ergebnis zurückgeben ---
        const report = {
            url: url,
            timestamp: new Date().toISOString(),
            danke: "Danke für deine Geduld!",
            checks: checks,
        };
        
        return res.status(200).json(report);

    } catch (error) {
        console.error('Fehler während des Browserless-Audits:', error.message);
        return res.status(500).json({ error: `Fehler während des Browserless-Audits: ${error.message}` });
    } finally {
        if (browser) {
            console.log('[CLEANUP] Browser-Verbindung wird geschlossen.');
            await browser.close();
        }
    }
}
