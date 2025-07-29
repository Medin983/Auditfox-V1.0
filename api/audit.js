import axe from 'axe-core';

/**
 * Dies ist die finale, korrigierte Version der Audit-Funktion.
 * Sie behebt den "module is not defined"-Fehler, indem die Funktion
 * als simple, anonyme Funktion an Browserless übergeben wird.
 */
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    console.log(`[HTTP-AUDIT START] für URL: ${url}`);

    try {
        const apiKey = process.env.BROWSERLESS_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERLESS_API_KEY wurde in der Umgebung nicht gefunden.');
        }

        // Wir erstellen ein "Rezept" (Code), das Browserless in seinem Browser ausführen soll.
        // Dies ist jetzt eine simple, anonyme Funktion, wie von der Browserless-API erwartet.
        const codeToExecute = `
            async ({ page, context }) => {
                const { url, axeSource } = context;

                await page.goto(url, { waitUntil: 'networkidle2' });

                const externalRequests = new Set();
                page.on('request', (request) => {
                    const requestUrl = request.url();
                    try {
                        if (requestUrl.startsWith('https://') && !requestUrl.includes(new URL(url).hostname)) {
                           const domain = new URL(requestUrl).hostname;
                           externalRequests.add(domain);
                        }
                    } catch(e) {}
                });

                // Robuste Warte-Methode
                await new Promise(r => setTimeout(r, 1000));

                const links = await page.$$eval('a', as => as.map(a => ({ text: a.innerText, href: a.href })));
                const cookies = await page.cookies();
                
                await page.addScriptTag({ content: axeSource });
                const accessibilityResult = await page.evaluate(() => window.axe.run());

                return {
                    links,
                    cookies,
                    accessibility: accessibilityResult,
                    externalRequests: Array.from(externalRequests)
                };
            }
        `;

        // Die Anfrage an die Browserless /function API senden
        const browserlessResponse = await fetch(`https://production-sfo.browserless.io/function?token=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: codeToExecute,
                context: { 
                    url: url,
                    axeSource: axe.source 
                }
            }),
        });

        if (!browserlessResponse.ok) {
            const errorText = await browserlessResponse.text();
            throw new Error(`Browserless.io Fehler ${browserlessResponse.status}: ${errorText}`);
        }

        const rawData = await browserlessResponse.json();

        // Die Rohdaten in unser bekanntes Format umwandeln
        const report = {
            url: url,
            timestamp: new Date().toISOString(),
            checks: {
                impressum: {
                    found: rawData.links.some(a => a.text.toLowerCase().includes('impressum') || a.href.toLowerCase().includes('impressum')),
                },
                datenschutz: {
                    found: rawData.links.some(a => a.text.toLowerCase().includes('datenschutz') || a.href.toLowerCase().includes('datenschutz')),
                },
                cookies: {
                    count: rawData.cookies.length,
                    details: rawData.cookies.map(c => c.name),
                },
                accessibility: rawData.accessibility,
                externalServices: {
                    found: rawData.externalRequests,
                    usesGoogleFonts: rawData.externalRequests.includes('fonts.googleapis.com'),
                    usesGoogleAnalytics: rawData.externalRequests.includes('www.google-analytics.com'),
                }
            }
        };

        return res.status(200).json(report);

    } catch (error) {
        console.error('Fehler während des HTTP-Audits:', error.message);
        return res.status(500).json({ error: `Fehler während des HTTP-Audits: ${error.message}` });
    }
}
