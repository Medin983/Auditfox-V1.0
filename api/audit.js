/**
 * Dies ist ein spezieller Diagnose-Code, um zu prüfen, welchen API-Schlüssel
 * die Funktion auf Vercel tatsächlich empfängt.
 */
export default async function handler(req, res) {
    console.log("--- FINALER API-SCHLÜSSEL DIAGNOSETEST GESTARTET ---");
    
    // Lese den API-Schlüssel aus den Umgebungsvariablen
    const apiKey = process.env.BROWSERLESS_API_KEY;

    // Prüfen, ob der Schlüssel überhaupt vorhanden ist
    if (!apiKey || apiKey.length < 10) {
        const errorMsg = "Fehler: Der BROWSERLESS_API_KEY wurde in der Vercel-Umgebung nicht gefunden oder ist ungültig.";
        console.error(errorMsg);
        // Sende eine Fehlerantwort, die im Browser angezeigt wird
        return res.status(500).json({ 
            ergebnis: "Fehlgeschlagen", 
            nachricht: errorMsg 
        });
    }

    // Erstelle eine sichere, maskierte Version des Schlüssels
    // z.B. "ab12...xy89"
    const maskedKey = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;

    console.log(`API-Schlüssel gefunden. Maskierte Version: ${maskedKey}`);

    // Sende den maskierten Schlüssel zurück an den Browser
    return res.status(200).json({
        ergebnis: "Erfolgreich",
        nachricht: "API-Schlüssel wurde in der Funktion gefunden. Bitte prüfe, ob dieser maskierte Schlüssel korrekt ist.",
        maskierter_schluessel: maskedKey
    });
}
