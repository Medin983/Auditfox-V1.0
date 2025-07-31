const PDFDocument = require('pdfkit');

// =================================================================================
// --- WISSENSDATENBANK: HIER KANNST DU ALLE TEXTE ANPASSEN ---
// =================================================================================

const recommendations = {
    impressum: {
        missing: {
            title: "Fehlendes Impressum",
            problem: "Auf Ihrer Webseite konnte kein gültiger Link zu einem Impressum gefunden werden. In Deutschland ist ein leicht auffindbares Impressum für fast alle Webseiten gesetzlich vorgeschrieben.",
            solution: "Fügen Sie einen deutlich sichtbaren Link mit der Beschriftung 'Impressum' in den Footer (Fußzeile) Ihrer Webseite ein. Dieser Link muss zu einer Seite führen, die alle gesetzlich vorgeschriebenen Angaben enthält (Name, Anschrift, Kontaktmöglichkeit etc.)."
        },
        found: {
            title: "Impressum vorhanden",
            problem: "Es wurde ein Link zu einem Impressum gefunden. Das ist die Grundvoraussetzung und sehr gut!",
            solution: "Bitte prüfen Sie manuell, ob der Inhalt Ihres Impressums vollständig und aktuell ist. Unser Audit prüft nur die technische Existenz des Links, nicht die inhaltliche Korrektheit."
        }
    },
    datenschutz: {
        missing: {
            title: "Fehlende Datenschutzerklärung",
            problem: "Es wurde kein Link zu einer Datenschutzerklärung gefunden. Diese ist nach der DSGVO für jede Webseite, die personenbezogene Daten verarbeitet (z.B. durch Cookies oder Kontaktformulare), zwingend erforderlich.",
            solution: "Erstellen Sie eine ausführliche Datenschutzerklärung und verlinken Sie diese gut sichtbar, idealerweise neben dem Impressum im Footer. Nutzen Sie hierfür bei Bedarf einen Datenschutz-Generator."
        },
        found: {
            title: "Datenschutzerklärung vorhanden",
            problem: "Ein Link zu einer Datenschutzerklärung wurde gefunden. Das ist sehr gut.",
            solution: "Stellen Sie sicher, dass Ihre Datenschutzerklärung alle genutzten Dienste (z.B. Google Analytics, Google Fonts) und Cookies auflistet und deren Zweck erklärt. Sie muss immer auf dem neuesten Stand sein."
        }
    },
    cookies: {
        none: {
            title: "Keine Cookies gefunden",
            problem: "Unser Scan hat keine Cookies auf Ihrer Startseite gefunden. Das ist aus DSGVO-Sicht ideal.",
            solution: "Falls Sie sicher sind, dass Ihre Seite keine Cookies setzt, brauchen Sie nichts weiter zu tun. Prüfen Sie jedoch Unterseiten, falls dort andere Funktionalitäten eingebunden sind."
        },
        some: {
            title: "Cookies gefunden",
            problem: `Es wurden {{count}} Cookies auf Ihrer Webseite identifiziert. Sobald nicht technisch notwendige Cookies gesetzt werden, benötigen Sie die explizite Einwilligung des Nutzers über einen Cookie-Banner.`,
            solution: "Überprüfen Sie alle gesetzten Cookies. Implementieren Sie einen rechtskonformen Cookie-Banner, der die Einwilligung des Nutzers einholt, bevor die Cookies gesetzt werden. Technisch notwendige Cookies sind hiervon ausgenommen, müssen aber in der Datenschutzerklärung erwähnt werden."
        }
    },
    externalServices: {
        googleFonts: {
            title: "Google Fonts wird extern geladen",
            problem: "Google Fonts wird direkt von den Google-Servern geladen. Dabei wird die IP-Adresse des Besuchers an Google in die USA übertragen, was datenschutzrechtlich problematisch ist.",
            solution: "Laden Sie die benötigten Schriftarten herunter und binden Sie sie lokal von Ihrem eigenen Server ein. So findet keine Datenübertragung an Google statt. Anleitungen hierfür finden Sie z.B. beim Google Webfonts Helper."
        }
    }
};

// =================================================================================
// --- PDF-GENERIERUNGS-LOGIK ---
// =================================================================================

function drawSection(doc, title, problem, solution, isPositive = false) {
    const titleColor = isPositive ? '#16A34A' : '#DC2626'; // Grün für positiv, Rot für negativ
    const textColor = '#374151';

    doc.fontSize(16).fillColor(titleColor).text(title, { semiBold: true });
    doc.moveDown(0.5);
    
    doc.fontSize(11).fillColor(textColor).text('Problem:', { semiBold: true });
    doc.text(problem, { indent: 20 });
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor(textColor).text('Handlungsempfehlung:', { semiBold: true });
    doc.text(solution, { indent: 20 });
    doc.moveDown(2);
}

module.exports = async (req, res) => {
    const auditData = req.body;

    if (!auditData || !auditData.checks) {
        return res.status(400).send('Ungültige oder fehlende Audit-Daten.');
    }

    try {
        const doc = new PDFDocument({ margin: 50, bufferPages: true });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        // --- PDF-INHALT ---
        doc.fontSize(28).fillColor('#1E3A8A').text('Audit Report', { align: 'center' });
        doc.fontSize(14).fillColor('#4B5563').text(`für: ${auditData.url}`, { align: 'center' });
        doc.moveDown(3);

        // Impressum
        if (auditData.checks.impressum.found) {
            drawSection(doc, recommendations.impressum.found.title, recommendations.impressum.found.problem, recommendations.impressum.found.solution, true);
        } else {
            drawSection(doc, recommendations.impressum.missing.title, recommendations.impressum.missing.problem, recommendations.impressum.missing.solution, false);
        }

        // Datenschutz
        if (auditData.checks.datenschutz.found) {
            drawSection(doc, recommendations.datenschutz.found.title, recommendations.datenschutz.found.problem, recommendations.datenschutz.found.solution, true);
        } else {
            drawSection(doc, recommendations.datenschutz.missing.title, recommendations.datenschutz.missing.problem, recommendations.datenschutz.missing.solution, false);
        }

        // Cookies
        if (auditData.checks.cookies.count === 0) {
            drawSection(doc, recommendations.cookies.none.title, recommendations.cookies.none.problem, recommendations.cookies.none.solution, true);
        } else {
            const problemText = recommendations.cookies.some.problem.replace('{{count}}', auditData.checks.cookies.count);
            drawSection(doc, recommendations.cookies.some.title, problemText, recommendations.cookies.some.solution, false);
        }

        // Externe Dienste
        if (auditData.checks.externalServices.usesGoogleFonts) {
            drawSection(doc, recommendations.externalServices.googleFonts.title, recommendations.externalServices.googleFonts.problem, recommendations.externalServices.googleFonts.solution, false);
        }

        // Accessibility Verstöße
        const violations = auditData.checks.accessibility.violations || [];
        if (violations.length > 0) {
            doc.fontSize(18).fillColor('#DC2626').text(`Gefundene Barrierefreiheits-Verstöße: ${violations.length}`, { underline: true });
            doc.moveDown();
            violations.forEach(v => {
                doc.fontSize(11).fillColor('#374151').text(`- ${v.help} (Auswirkung: ${v.impact})`);
                doc.fontSize(10).fillColor('#2563EB').text(`   Weitere Informationen...`, { link: v.helpUrl, underline: true });
                doc.moveDown(0.7);
            });
        }

        // --- PDF FERTIGSTELLEN ---
        doc.end();
        await new Promise(resolve => doc.on('end', resolve));
        const pdfData = Buffer.concat(buffers);

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="audit-report.pdf"',
        });
        res.end(pdfData);

    } catch (error) {
        console.error("Fehler bei der PDF-Erstellung:", error);
        res.status(500).send("Interner Serverfehler bei der PDF-Erstellung.");
    }
};
