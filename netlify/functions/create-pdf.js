const PDFDocument = require('pdfkit');

// Hilfsfunktion, um sicherzustellen, dass wir nicht auf undefined zugreifen
const getSafe = (data, path, defaultValue = 'N/A') => {
    // path ist ein String wie 'checks.impressum.found'
    const value = path.split('.').reduce((acc, part) => acc && acc[part], data);
    return value !== undefined && value !== null ? value : defaultValue;
};

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log("--- PDF-Funktion gestartet. ---");
        const auditData = JSON.parse(event.body);
        
        const buffers = [];
        const doc = new PDFDocument({ margin: 50, bufferPages: true });
        doc.on('data', buffers.push.bind(buffers));
        
        console.log("1. PDF-Dokument initialisiert.");

        // --- PDF-INHALT ---

        // Header
        doc.fontSize(24).fillColor('#1E3A8A').text('Audit Report', { align: 'center' });
        doc.fontSize(12).fillColor('#4B5563').text(`für die Webseite: ${getSafe(auditData, 'url')}`, { align: 'center' });
        doc.moveDown(2);
        console.log("2. Header erstellt.");

        // Zusammenfassung
        doc.fontSize(18).fillColor('#111827').text('Zusammenfassung', { underline: true });
        doc.moveDown();
        
        // KORRIGIERTE Logik: Default auf `false` setzen, damit der Ja/Nein-Check funktioniert.
        const summaryChecks = [
            { label: 'Impressum gefunden', value: getSafe(auditData, 'checks.impressum.found', false) ? 'Ja' : 'Nein' },
            { label: 'Datenschutz-Link gefunden', value: getSafe(auditData, 'checks.datenschutz.found', false) ? 'Ja' : 'Nein' },
            { label: 'Anzahl der Cookies', value: getSafe(auditData, 'checks.cookies.count', 0) },
            { label: 'Barrierefreiheits-Verstöße', value: getSafe(auditData, 'checks.accessibility.violations.length', 0) }
        ];

        doc.fontSize(12);
        summaryChecks.forEach(check => {
            doc.text(`${check.label}: `, { continued: true, fillColor: '#374151' }).fillColor('#111827').text(String(check.value));
        });
        doc.moveDown(2);
        console.log("3. Zusammenfassung erstellt.");

        // Details zur Barrierefreiheit
        const violations = getSafe(auditData, 'checks.accessibility.violations', []);
        if (violations.length > 0) {
            doc.fontSize(18).fillColor('#111827').text('Details zur Barrierefreiheit', { underline: true });
            doc.moveDown();

            violations.forEach((violation, index) => {
                doc.fontSize(12).fillColor('#111827').text(`- ${getSafe(violation, 'help', 'Keine Beschreibung verfügbar.')}`);
                doc.fontSize(10).fillColor('#6B7280').text(`   (Auswirkung: ${getSafe(violation, 'impact', 'unbekannt')}, ID: ${getSafe(violation, 'id', 'unbekannt')})`);
                const helpUrl = getSafe(violation, 'helpUrl', '#');
                if (helpUrl !== '#') {
                    doc.fontSize(10).fillColor('#2563EB').text(`   Mehr erfahren...`, { link: helpUrl, underline: true });
                }
                doc.moveDown(0.7);
            });
        }
        console.log("4. Details zur Barrierefreiheit erstellt.");
        
        // --- PDF FERTIGSTELLEN ---
        doc.end();
        console.log("5. PDF-Dokument wird finalisiert...");

        await new Promise(resolve => {
            doc.on('end', resolve);
        });

        const pdfBuffer = Buffer.concat(buffers);
        console.log("6. PDF-Buffer erfolgreich erstellt. Sende Antwort an Browser.");

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/pdf' },
            body: pdfBuffer.toString('base64'),
            isBase64Encoded: true,
        };

    } catch (error) {
        console.error("Schwerwiegender PDF-Erstellungsfehler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Konnte das PDF nicht erstellen.', details: error.message })
        };
    }
};
