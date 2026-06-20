import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Common formatter for money display in Indian Rupees (en-IN).
 */
export function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Standard table options that follow the professional ERP design language.
 */
export const standardTableOpts = {
    theme: "striped",
    styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: "middle",
        font: "helvetica",
    },
    headStyles: {
        fillColor: [10, 32, 83], // Dark Navy Blue
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
    },
    alternateRowStyles: {
        fillColor: [247, 249, 253], // Subtle zebra striping
    },
    margin: { top: 40, left: 14, right: 14, bottom: 20 },
};

/**
 * Render summary cards on the PDF document (Page 1 only).
 * 
 * @param {jsPDF} doc The jsPDF document instance
 * @param {Array<{label: string, value: string|number}>} cards The list of metrics
 * @param {number} startY The starting Y coordinate
 * @returns {number} The final Y coordinate after the cards are rendered
 */
export function drawSummaryCards(doc, cards, startY) {
    if (!cards || cards.length === 0) return startY;
    
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    const spacing = 4;
    const usableWidth = pageWidth - margin * 2;
    
    const cols = cards.length <= 4 ? cards.length : Math.ceil(cards.length / 2);
    const rows = Math.ceil(cards.length / cols);
    const cardWidth = (usableWidth - (cols - 1) * spacing) / cols;
    const cardHeight = 15;

    let currentY = startY;
    doc.setFont("helvetica", "normal");

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const index = r * cols + c;
            if (index >= cards.length) break;

            const card = cards[index];
            const x = margin + c * (cardWidth + spacing);
            const y = currentY;

            // Draw Card Box
            doc.setDrawColor(229, 231, 235);
            doc.setFillColor(249, 250, 251); // subtle light gray card background
            doc.rect(x, y, cardWidth, cardHeight, "FD");

            // Label
            doc.setFontSize(7.5);
            doc.setTextColor(107, 114, 128);
            doc.setFont("helvetica", "bold");
            doc.text(String(card.label).toUpperCase(), x + 4, y + 5.5);

            // Value
            doc.setFontSize(10.5);
            doc.setTextColor(17, 24, 39);
            doc.setFont("helvetica", "bold");
            doc.text(String(card.value), x + 4, y + 11.5);
        }
        currentY += cardHeight + spacing;
    }

    return currentY + 2;
}

/**
 * Loops over all pages to draw the SVS Traders letterhead and footer.
 * Also renders the report title and details block on the first page.
 * 
 * @param {jsPDF} doc The jsPDF document instance
 * @param {string} title The title of the report (e.g. "Monthly Sales Report")
 * @param {Array<string>} infoLeft List of details to show on the left of title
 * @param {Array<string>} infoRight List of details to show on the right of title (right-aligned)
 */
export function finalizePDF(doc, title, infoLeft = [], infoRight = []) {
    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // --- DRAW LETTERHEAD (Repeated on every page) ---
        // SVS TRADERS (Large center bold heading)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(10, 32, 83); // Dark Navy Blue
        doc.text("SVS TRADERS", pageWidth / 2, 12, { align: "center" });

        // Subheading: 2Dudes Bevdaas Showroom
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(59, 130, 246); // Accent Blue
        doc.text("2Dudes Bevdaas Showroom", pageWidth / 2, 17, { align: "center" });

        // Divider Line 1
        doc.setDrawColor(209, 213, 219); // Gray-300
        doc.setLineWidth(0.35);
        doc.line(14, 20, pageWidth - 14, 20);

        // Address & Contacts
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(75, 85, 99); // Gray-600
        doc.text(
            "Address: H.No. -, Meena Nagar, Near MLA Camp Office, Bhongir Town, Yadadri (DT) - 508116",
            pageWidth / 2,
            23.5,
            { align: "center" }
        );
        doc.text(
            "Mobile: +91 9705583982   |   GST No: 36GXBPSS5501Z9",
            pageWidth / 2,
            27.5,
            { align: "center" }
        );

        // Divider Line 2
        doc.line(14, 30, pageWidth - 14, 30);

        // --- REPORT TITLE SECTION (Only on Page 1) ---
        if (i === 1) {
            // Title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.setTextColor(17, 24, 39);
            doc.text(title, 14, 36);

            // Metadata Left
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            let leftY = 41;
            infoLeft.forEach((line) => {
                doc.text(String(line), 14, leftY);
                leftY += 4;
            });

            // Metadata Right
            let rightY = 41;
            infoRight.forEach((line) => {
                doc.text(String(line), pageWidth - 14, rightY, { align: "right" });
                rightY += 4;
            });
        }

        // --- DRAW FOOTER (Repeated on every page) ---
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(156, 163, 175);
        doc.text(
            "SVS TRADERS | GST No: 36GXBPSS5501Z9",
            14,
            pageHeight - 9
        );
        
        doc.text(
            `Generated At: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
            pageWidth / 2,
            pageHeight - 9,
            { align: "center" }
        );

        doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth - 14,
            pageHeight - 9,
            { align: "right" }
        );
    }
}
