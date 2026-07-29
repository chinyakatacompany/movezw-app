import { jsPDF } from "jspdf";

function triggerDownload(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escCsv(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function downloadCSV(filename, columns, rows) {
  const csv = [columns.map(escCsv).join(","), ...rows.map((r) => r.map(escCsv).join(","))].join("\n");
  triggerDownload(filename, "text/csv;charset=utf-8;", csv);
}

export function downloadExcel(filename, columns, rows) {
  const head = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`)
    .join("");
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  triggerDownload(filename, "application/vnd.ms-excel", html);
}

export function downloadPDF(filename, title, columns, rows) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(15);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
  doc.setTextColor(0);

  const colW = [28, 24, 28, 86, 26, 26];
  let y = 30;
  doc.setFont(undefined, "bold");
  doc.setFontSize(9);
  let x = 14;
  columns.forEach((c, i) => {
    doc.text(String(c), x, y);
    x += colW[i] || 28;
  });
  doc.setFont(undefined, "normal");
  y += 7;
  rows.forEach((r) => {
    if (y > 190) {
      doc.addPage();
      y = 20;
    }
    x = 14;
    r.forEach((c, i) => {
      doc.text(String(c ?? "").slice(0, 46), x, y);
      x += colW[i] || 28;
    });
    y += 6;
  });
  doc.save(filename);
}
