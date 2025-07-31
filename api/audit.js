import axe from 'axe-core';

/**
 * Dies ist die finale, produktive Version der Audit-Funktion.
 * Sie führt alle Checks (DSGVO, Cookies, Barrierefreiheit) über
 * die Browserless.io HTTP-API durch.
 */
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    console.log(`[VOLLSTÄNDIGER AUDIT START] für URL: ${url}`);

    try {
        const apiKey = process.env.BROWSERLESS_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERLESS_API_KEY wurde in der Umgebung nicht gefunden.');
        }

        // Dies ist der Code, der remote auf Browserless.io ausgeführt wird.
        const codeToExecute = `
            async ({ page, context }) => {
                const { url, axeSource } = context;
                await page.goto(url, { waitUntil: 'networkidle2' });

                // Netzwerkanalyse
                const externalRequests = new Set();
                page.on('request', (request) => {
                    const requestUrl = request.url();
                    try {
                        if (requestUrl.startsWith('https') && !requestUrl.includes(new URL(url).hostname)) {
                           const domain = new URL(requestUrl).hostname;
                           externalRequests.add(domain);
                        }
                    } catch(e) {}
                });
                await new Promise(r => setTimeout(r, 1500)); // Warten auf Netzwerkanfragen

                // DSGVO-Checks
                const links = await page.$$eval('a', as => as.map(a => ({ text: a.innerText, href: a.href })));
                const cookies = await page.cookies();
                
                // Barrierefreiheits-Check
                await page.addScriptTag({ content: axeSource });
                const accessibility = await page.evaluate(() => window.axe.run());

                return {
                    links,
                    cookies,
                    accessibility,
                    externalRequests: Array.from(externalRequests)
                };
            }
        `;

        // Anfrage an Browserless
        const browserlessResponse = await fetch(`https://production-sfo.browserless.io/function?token=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: codeToExecute,
                context: { url: url, axeSource: axe.source }
            }),
        });

        if (!browserlessResponse.ok) {
            const errorText = await browserlessResponse.text();
            throw new Error(`Browserless.io Fehler ${browserlessResponse.status}: ${errorText}`);
        }

        const rawData = await browserlessResponse.json();

        // Report zusammenstellen
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
                    details: rawData.cookies.map(c => ({ name: c.name, domain: c.domain })),
                },
                accessibility: {
                    violations: rawData.accessibility.violations,
                    violationCount: rawData.accessibility.violations.length,
                },
                externalServices: {
                    found: rawData.externalRequests,
                    usesGoogleFonts: rawData.externalRequests.includes('fonts.googleapis.com'),
                    usesGoogleAnalytics: rawData.externalRequests.includes('www.google-analytics.com'),
                }
            }
        };

        return res.status(200).json(report);

    } catch (error) {
        console.error('Fehler während des vollständigen Audits:', error.message);
        return res.status(500).json({ error: `Fehler während des vollständigen Audits: ${error.message}` });
    }
}
