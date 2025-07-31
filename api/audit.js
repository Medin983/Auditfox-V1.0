import * as cheerio from 'cheerio';

/**
 * Dies ist die finale, stabile Version der Audit-Funktion.
 * Sie holt das HTML von Browserless und analysiert es serverseitig.
 * Barrierefreiheit wird über eine externe, stabile API geprüft.
 */
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    console.log(`[FINALE VERSION AUDIT START] für URL: ${url}`);

    try {
        const apiKey = process.env.BROWSERLESS_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERLESS_API_KEY wurde in der Umgebung nicht gefunden.');
        }

        // Schritt 1: Gerendertes HTML von Browserless.io holen
        const browserlessResponse = await fetch(`https://production-sfo.browserless.io/content?token=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });
        
        if (!browserlessResponse.ok) {
            const errorText = await browserlessResponse.text();
            throw new Error(`Browserless.io Fehler ${browserlessResponse.status}: ${errorText}`);
        }
        const html = await browserlessResponse.text();

        // Schritt 2: HTML mit Cheerio analysieren (Impressum, Datenschutz, Externe Dienste)
        const $ = cheerio.load(html);
        
        const links = $('a');
        let impressumFound = false;
        links.each((i, link) => {
            const linkText = $(link).text().toLowerCase();
            const linkHref = $(link).attr('href')?.toLowerCase() || '';
            if (linkText.includes('impressum') || linkHref.includes('impressum')) {
                impressumFound = true;
            }
        });
        
        let datenschutzFound = false;
        links.each((i, link) => {
            const linkText = $(link).text().toLowerCase();
            const linkHref = $(link).attr('href')?.toLowerCase() || '';
            if (linkText.includes('datenschutz') || linkHref.includes('datenschutz')) {
                datenschutzFound = true;
            }
        });

        const usesGoogleFonts = html.includes('fonts.googleapis.com');
        const usesGoogleAnalytics = html.includes('google-analytics.com') || html.includes('googletagmanager.com');

        // Schritt 3: Barrierefreiheit über die kostenlose Deque axe API prüfen
        console.log("Sende HTML zur Barrierefreiheits-Analyse...");
        const axeApiResponse = await fetch('https://axe.deque.com/api/v2/analyses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: html }),
        });

        if (!axeApiResponse.ok) {
            console.error("Fehler bei der Axe API:", await axeApiResponse.text());
            throw new Error("Die Barrierefreiheits-Analyse konnte nicht durchgeführt werden.");
        }
        const accessibilityData = await axeApiResponse.json();

        // Report zusammenstellen
        const report = {
            url: url,
            timestamp: new Date().toISOString(),
            checks: {
                impressum: { found: impressumFound },
                datenschutz: { found: datenschutzFound },
                cookies: { 
                    count: 'N/A', 
                    details: "Eine zuverlässige Cookie-Analyse ist mit dieser Methode nicht möglich und erfordert eine manuelle Prüfung." 
                },
                accessibility: {
                    violations: accessibilityData.violations || [],
                    violationCount: accessibilityData.violations?.length || 0,
                },
                externalServices: { 
                    usesGoogleFonts: usesGoogleFonts,
                    usesGoogleAnalytics: usesGoogleAnalytics,
                }
            }
        };

        return res.status(200).json(report);

    } catch (error) {
        console.error('Fehler während des finalen Audits:', error.message);
        return res.status(500).json({ error: `Fehler während des finalen Audits: ${error.message}` });
    }
};
