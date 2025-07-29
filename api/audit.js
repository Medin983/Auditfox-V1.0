import axe from 'axe-core';

/**
 * Dies ist die finale Version der Audit-Funktion. Sie nutzt die robustere
 * HTTP-API von Browserless.io, um Netzwerk- und Firewall-Probleme zu umgehen.
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
        const codeToExecute = `
            async ({ page, url }) => {
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

                // Warte kurz, damit alle Netzwerkanfragen erfasst werden können
                await page.waitForTimeout(1000); 

                const links = await page.$$eval('a', as => as.map(a => ({ text: a.innerText, href: a.href })));
                const cookies = await page.cookies();
                
                // Axe-Core für Barrierefreiheit injizieren und ausführen
                await page.addScriptTag({ content: \`${axe.source}\` });
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
        const browserlessResponse = await fetch(`https://chrome.browserless.io/function?token=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: codeToExecute,
                context: { url: url }
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
