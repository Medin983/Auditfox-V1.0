import PDFDocument from 'pdfkit';

/**
 * Dies ist die finale Version der PDF-Funktion, die im
 * korrekten Format für die Vercel-Plattform geschrieben ist.
 */
export default async function handler(req, res) {
    // Bei Vercel kommt der Body direkt als JSON-Objekt
    const auditData = req.body;

    if (!auditData || !auditData.checks) {
        return res.status(400).send('Ungültige oder fehlende Audit-Daten.');
    }

    try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            res.writeHead(200, {
                'Content-Length': Buffer.byteLength(pdfData),
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment;filename=audit-report.pdf`,
            }).end(pdfData);
        });

        // --- PDF INHALT ---
        // (Hier ist die Logik, die den PDF-Report erstellt)
        
        // Header
        doc.fontSize(24).fillColor('blue').text('Audit-Report', { align: 'center' });
        doc.fontSize(12).fillColor('black').text(`für die URL: ${auditData.url}`, { align: 'center' });
        doc.moveDown(2);

        // Zusammenfassung
        const summary = auditData.checks.accessibility?.violations?.length || 0;
        doc.fontSize(18).text('Zusammenfassung');
        doc.fontSize(12).text(`- Impressum gefunden: ${auditData.checks.impressum?.found ? 'Ja' : 'Nein'}`);
        doc.text(`- Datenschutzseite gefunden: ${auditData.checks.datenschutz?.found ? 'Ja' : 'Nein'}`);
        doc.text(`- Anzahl Cookies: ${auditData.checks.cookies?.count || 0}`);
        doc.text(`- Barrierefreiheits-Verstöße: ${summary}`);
        doc.moveDown(2);

        // Details zur Barrierefreiheit
        if (summary > 0) {
            doc.fontSize(18).text('Details zur Barrierefreiheit');
            auditData.checks.accessibility.violations.forEach(v => {
                doc.fontSize(12).fillColor('red').text(`- ${v.description}`);
                doc.fillColor('black').fontSize(10).text(`   Hilfe: ${v.helpUrl}`, { link: v.helpUrl, underline: true });
                doc.moveDown();
            });
        }
        
        // PDF abschließen
        doc.end();

    } catch (error) {
        console.error("Fehler bei der PDF-Erstellung:", error);
        res.status(500).send("Interner Serverfehler bei der PDF-Erstellung.");
    }
}
