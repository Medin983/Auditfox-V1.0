import puppeteer from 'puppeteer-core';
import axe from 'axe-core';

/**
 * Dies ist die finale Version der Audit-Funktion, die den externen Dienst Browserless.io nutzt,
 * um Umgebungsprobleme auf Vercel zu umgehen.
 */
export default async function handler(req, res) {
    console.log("--- AUDIT-FUNKTION GESTARTET (Browserless-Version) ---");

    // Schritt 1: URL und API-Schlüssel holen
    const urlToAudit = req.query.url;
    const apiKey = process.env.BROWSERLESS_API_KEY;

    // Prüfen, ob die URL und der API-Schlüssel vorhanden sind
    if (!urlToAudit) {
        return res.status(400).json({ error: 'Bitte gib eine URL an.' });
    }
    if (!apiKey) {
        console.error("Fehler: BROWSERLESS_API_KEY wurde in der Vercel-Umgebung nicht gefunden.");
        return res.status(500).json({ error: 'Server-Konfigurationsfehler: API-Schlüssel fehlt.' });
    }

    let browser = null;
    try {
        console.log(`[1/4] Verbindung zu Browserless wird hergestellt...`);
        // Schritt 2: Mit dem "Miet-Browser" von Browserless verbinden
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?token=${apiKey}`,
        });
        
        console.log("[2/4] Verbindung erfolgreich. Seite wird analysiert...");
        const page = await browser.newPage();
        
        // Setup für die Netzwerkanalyse
        const externalServices = {
            googleFonts: false,
            googleAnalytics: false,
            facebookPixel: false,
            otherDomains: new Set(),
        };

        page.on('request', request => {
            const requestUrl = request.url();
            if (requestUrl.startsWith('https://fonts.googleapis.com')) {
                externalServices.googleFonts = true;
            } else if (requestUrl.includes('google-analytics.com')) {
                externalServices.googleAnalytics = true;
            } else if (requestUrl.includes('connect.facebook.net')) {
                externalServices.facebookPixel = true;
            } else if (!requestUrl.startsWith('data:') && !requestUrl.includes(new URL(urlToAudit).hostname)) {
                 try {
                    const domain = new URL(requestUrl).hostname;
                    if (domain !== new URL(urlToAudit).hostname) {
                       externalServices.otherDomains.add(domain);
                    }
                } catch (e) {
                    // Ignoriere ungültige URLs
                }
            }
        });

        // Schritt 3: Webseite laden und analysieren
        await page.goto(urlToAudit, { waitUntil: 'networkidle2', timeout: 30000 });
        console.log("[3/4] Seitenanalyse wird durchgeführt...");

        // DSGVO-Checks
        const impressumFound = await page.evaluate(() => Array.from(document.querySelectorAll('a')).some(a => /impressum|imprint|legal/i.test(a.textContent) || /impressum|imprint|legal/i.test(a.href)));
        const datenschutzFound = await page.evaluate(() => Array.from(document.querySelectorAll('a')).some(a => /datenschutz|privacy/i.test(a.textContent) || /datenschutz|privacy/i.test(a.href)));
        const cookies = await page.cookies();

        // Barrierefreiheits-Check (Axe)
        await page.addScriptTag({ content: axe.source });
        const accessibilityResults = await page.evaluate(() => axe.run());
        
        console.log("[4/4] Analyse abgeschlossen. Report wird erstellt.");

        // Schritt 4: Report zusammenstellen
        const report = {
            url: urlToAudit,
            timestamp: new Date().toISOString(),
            danke: "Danke für deine Geduld!",
            checks: {
                impressum: { found: impressumFound },
                datenschutz: { found: datenschutzFound },
                cookies: {
                    count: cookies.length,
                    details: cookies.map(c => ({ name: c.name, domain: c.domain })),
                },
                externalServices: {
                    ...externalServices,
                    otherDomains: Array.from(externalServices.otherDomains),
                },
                accessibility: {
                    violations: accessibilityResults.violations,
                    violationCount: accessibilityResults.violations.length,
                },
            },
        };

        // Schritt 5: Erfolgreiche Antwort senden
        return res.status(200).json(report);

    } catch (error) {
        console.error("Fehler während des Browserless-Audits:", error.message);
        return res.status(500).json({ error: `Fehler während des Browserless-Audits: ${error.message}` });
    } finally {
        // Schritt 6: Sicherstellen, dass die Browser-Verbindung geschlossen wird
        if (browser) {
            console.log("Browser-Verbindung wird geschlossen.");
            await browser.close();
        }
    }
}
