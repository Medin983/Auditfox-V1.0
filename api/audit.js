/**
 * Dies ist ein spezieller Diagnose-Code, um zu überprüfen,
 * ob der API-Schlüssel korrekt in der Vercel-Funktion ankommt.
 */
export default async function handler(req, res) {
    const apiKey = process.env.BROWSERLESS_API_KEY;

    if (apiKey && apiKey.length > 8) {
        // Der Schlüssel wurde gefunden.
        const maskedKey = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
        const message = `Diagnosetest: API-Schlüssel wurde gefunden. Maskierte Version: ${maskedKey}`;
        
        // Wir senden absichtlich einen Fehler, damit die alert-Box im Frontend den Text anzeigt.
        return res.status(500).json({ error: message });

    } else {
        // Der Schlüssel wurde NICHT gefunden oder ist zu kurz.
        const message = "Diagnosetest FEHLGESCHLAGEN: Der BROWSERLESS_API_KEY wurde in der Vercel-Umgebung nicht gefunden oder ist ungültig.";
        
        return res.status(500).json({ error: message });
    }
}
