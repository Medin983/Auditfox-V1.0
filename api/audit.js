// This is a diagnostic script to check environment variables on Vercel.

export default async function handler(req, res) {
    console.log("--- DIAGNOSTIC RUN STARTED ---");

    const apiKey = process.env.BROWSERLESS_API_KEY;

    if (!apiKey || apiKey.length < 10) { // Check if the key exists and has a reasonable length
        const errorMessage = "Fehler: Der BROWSERLESS_API_KEY wurde in der Vercel-Umgebung nicht gefunden oder ist ungültig.";
        console.error("DIAGNOSTIC FAILURE:", errorMessage);
        return res.status(500).json({ error: errorMessage });
    }

    // Mask the key for security before logging
    const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
    
    const successMessage = "Diagnosetest erfolgreich. API-Schlüssel wurde in der Funktion gefunden.";
    console.log(`DIAGNOSTIC SUCCESS: ${successMessage}`);
    console.log(`DIAGNOSTIC INFO: Maskierter Schlüssel: ${maskedKey}`);
    
    // We return a success message with the masked key.
    return res.status(200).json({ 
        message: successMessage,
        maskedKey: maskedKey 
    });
}
