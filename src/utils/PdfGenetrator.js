const PDFDocument = require("pdfkit");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const drawTable = (doc, headers, rows) => {
  const colWidth = 480 / headers.length;
  const rowHeight = 20;
  let x = doc.page.margins.left;
  let y = doc.y;

  doc.fontSize(9).fillColor("#000");
  headers.forEach((header, i) => {
    doc.rect(x + i * colWidth, y, colWidth, rowHeight).fillAndStroke("#f2f2f2", "#ddd");
    doc.fillColor("#000").text(header, x + i * colWidth + 4, y + 5, { width: colWidth - 8 });
  });
  y += rowHeight;

  rows.forEach((row) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    row.forEach((cell, i) => {
      doc.rect(x + i * colWidth, y, colWidth, rowHeight).stroke("#ddd");
      doc.fillColor("#000").fontSize(8).text(String(cell ?? ""), x + i * colWidth + 4, y + 5, {
        width: colWidth - 8,
      });
    });
    y += rowHeight;
  });

  doc.y = y + 5;
};

const generateStockPDF = async (data, monthName) => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevMonth.getFullYear();

    const chartCanvas = new ChartJSNodeCanvas({ width: 500, height: 250 });

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const chartWidth = 500;
    const chartX = doc.page.margins.left + (pageWidth - chartWidth) / 2;

    // ─── Title ───────────────────────────────────────────────
    doc
      .fontSize(20)
      .fillColor("#0d6efd")
      .text(`Stock Report - ${monthName} ${year}`, { align: "center" });
    doc.moveDown();

    // ─── Tally Total ─────────────────────────────────────────
    doc.fontSize(13).fillColor("#000").text("Tally Total", { underline: true });
    doc.fontSize(11).text(`Month: ${monthName} ${year}`);
    doc.fontSize(11).text(`Total Sales: ${data?.TallyTotal?.[0]?.totalSales || 0}`);
    doc.moveDown();

    // ─── Article Summary Table ────────────────────────────────
    doc.fontSize(13).text("Article Summary", { underline: true });
    doc.moveDown(0.5);
    drawTable(doc,
      ["Article", "Qty Sold", "Total Orders"],
      (data?.articleSummary || []).map((item) => [
        item._id,
        item.totalQuantitySold,
        item.totalOrders,
      ])
    );
    doc.moveDown();

    // ─── Article Bar Chart ────────────────────────────────────
    const articleChartBuffer = await chartCanvas.renderToBuffer({
      type: "bar",
      data: {
        labels: (data?.articleSummary || []).map((i) => i._id),
        datasets: [{
          label: "Qty Sold",
          data: (data?.articleSummary || []).map((i) => i.totalQuantitySold),
          backgroundColor: "rgba(13, 110, 253, 0.6)",
        }],
      },
      options: {
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } },
      },
    });
    doc.image(articleChartBuffer, chartX, doc.y, { fit: [chartWidth, 250] });
    doc.moveDown(12);
    doc.addPage();

    // ─── Cumulative Total Table ───────────────────────────────
    doc.fontSize(13).fillColor("#000").text("Cumulative Total by Article", { underline: true });
    doc.moveDown(0.5);
    drawTable(doc,
      ["Article", "Category Code", "Grand Total Qty", "Order Lines"],
      (data?.cumulativeTotalByArticle || []).map((item) => [
        item.articleOrCategory,
        item.categoryCode,
        item.grandTotalQuantity,
        item.totalOrderLines,
      ])
    );
    doc.moveDown();

    // ─── Cumulative Bar Chart ─────────────────────────────────
    const cumulativeChartBuffer = await chartCanvas.renderToBuffer({
      type: "bar",
      data: {
        labels: (data?.cumulativeTotalByArticle || []).map((i) => i.articleOrCategory),
        datasets: [{
          label: "Grand Total Qty",
          data: (data?.cumulativeTotalByArticle || []).map((i) => i.grandTotalQuantity),
          backgroundColor: "rgba(25, 135, 84, 0.6)",
        }],
      },
      options: {
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } },
      },
    });
    doc.image(cumulativeChartBuffer, chartX, doc.y, { fit: [chartWidth, 250] });
    doc.moveDown(12);
    doc.addPage();

    // ─── Color Size Summary Table ─────────────────────────────
    doc.fontSize(13).fillColor("#000").text("Color & Size Summary", { underline: true });
    doc.moveDown(0.5);
    drawTable(doc,
      ["Article", "Color", "Size", "Qty Sold"],
      (data?.colorSizeSummary || []).map((item) => [
        item.articleOrCategory,
        item.color,
        item.size,
        item.totalQuantitySold,
      ])
    );
    doc.moveDown();

    // ─── Pie Chart ────────────────────────────────────────────
    const pieChartBuffer = await chartCanvas.renderToBuffer({
      type: "pie",
      data: {
        labels: (data?.colorSizeSummary || []).map(
          (i) => `${i.articleOrCategory}-${i.color}-${i.size}`
        ),
        datasets: [{
          data: (data?.colorSizeSummary || []).map((i) => i.totalQuantitySold),
          backgroundColor: (data?.colorSizeSummary || []).map(
            (_, idx) => `hsl(${(idx * 47) % 360}, 70%, 60%)`
          ),
        }],
      },
      options: {
        plugins: { legend: { display: true, position: "right" } },
      },
    });
    doc.image(pieChartBuffer, chartX, doc.y, { fit: [chartWidth, 250] });
    doc.moveDown(12);

    doc.end();
  });
};

module.exports = { generateStockPDF };