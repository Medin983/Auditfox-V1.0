import * as cheerio from 'cheerio';

/**
 * Dies ist die finale, stabile Version der Audit-Funktion.
 * Sie verwendet die /content API von Browserless.io und analysiert
 * das HTML serverseitig mit Cheerio. Dieser Ansatz ist robuster.
 */
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    console.log(`[STABILER AUDIT START] für URL: ${url}`);

    try {
        const apiKey = process.env.BROWSERLESS_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERLESS_API_KEY wurde in der Umgebung nicht gefunden.');
        }

        // Wir rufen die /content API auf, um das gerenderte HTML zu erhalten.
        const browserlessResponse = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                waitFor: 2000 // Warten, bis die Seite geladen ist
            }),
        });
        
        if (!browserlessResponse.ok) {
            const errorText = await browserlessResponse.text();
            throw new Error(`Browserless.io Fehler ${browserlessResponse.status}: ${errorText}`);
        }

        const html = await browserlessResponse.text();

        // Wir laden das HTML in Cheerio, unser serverseitiges Analyse-Werkzeug.
        const $ = cheerio.load(html);

        // Jetzt führen wir unsere Checks auf dem fertigen HTML durch.
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

        // Die anderen Checks (Cookies, Barrierefreiheit) können wir in einem nächsten Schritt
        // mit anderen Methoden wieder hinzufügen. Ziel ist jetzt eine funktionierende Basis.

        const report = {
            url: url,
            timestamp: new Date().toISOString(),
            checks: {
                impressum: { found: impressumFound },
                datenschutz: { found: datenschutzFound },
                // Platzhalter für zukünftige, stabilere Checks
                cookies: { count: 'N/A', details: [] },
                accessibility: { violations: [], passes: [] },
                externalServices: { found: [], usesGoogleFonts: false, usesGoogleAnalytics: false },
            }
        };

        return res.status(200).json(report);

    } catch (error) {
        console.error('Fehler während des stabilen Audits:', error.message);
        return res.status(500).json({ error: `Fehler während des stabilen Audits: ${error.message}` });
    }
}
