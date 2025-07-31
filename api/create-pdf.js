// Wir wechseln zur robusteren CommonJS-Syntax, die auf Vercel zuverlässiger ist.
const PDFDocument = require('pdfkit');

/**
 * Dies ist die finale, stabile Version der PDF-Funktion.
 * Sie ist im korrekten CommonJS-Format für Vercel geschrieben.
 */
module.exports = async (req, res) => {
    // Bei Vercel kommt der Body direkt als JSON-Objekt
    const auditData = req.body;

    if (!auditData || !auditData.checks) {
        return res.status(400).send('Ungültige oder fehlende Audit-Daten.');
    }

    try {
        const doc = new PDFDocument({ margin: 50 });
        
        // Wir streamen das PDF direkt an die Antwort, das ist effizienter.
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=audit-report.pdf`,
        });
        doc.pipe(res);

        // --- PDF INHALT ---
        
        // Header
        doc.fontSize(24).fillColor('#1E3A8A').text('Audit-Report', { align: 'center' });
        doc.fontSize(12).fillColor('black').text(`für die URL: ${auditData.url}`, { align: 'center' });
        doc.moveDown(2);

        // Zusammenfassung
        const violationCount = auditData.checks.accessibility?.violations?.length || 0;
        doc.fontSize(18).text('Zusammenfassung');
        doc.fontSize(12).text(`- Impressum gefunden: ${auditData.checks.impressum?.found ? 'Ja' : 'Nein'}`);
        doc.text(`- Datenschutzseite gefunden: ${auditData.checks.datenschutz?.found ? 'Ja' : 'Nein'}`);
        doc.text(`- Anzahl Cookies: ${auditData.checks.cookies?.count || 0}`);
        doc.text(`- Barrierefreiheits-Verstöße: ${violationCount}`);
        doc.moveDown(2);

        // Details zur Barrierefreiheit
        if (violationCount > 0) {
            doc.fontSize(18).text('Details zur Barrierefreiheit');
            doc.moveDown();
            auditData.checks.accessibility.violations.forEach(v => {
                doc.fontSize(12).fillColor('#DC2626').text(`- ${v.description}`);
                doc.fillColor('black').fontSize(10).text(`   Hilfe: ${v.helpUrl}`, { link: v.helpUrl, underline: true });
                doc.moveDown();
            });
        }
        
        // PDF abschließen
        doc.end();

    } catch (error) {
        console.error("Fehler bei der PDF-Erstellung:", error);
        // Da der Stream schon gestartet sein könnte, können wir oft keinen neuen Status senden.
        // Wir beenden den Stream einfach. Der Fehler wird im Vercel-Log sichtbar sein.
        res.end();
    }
};
