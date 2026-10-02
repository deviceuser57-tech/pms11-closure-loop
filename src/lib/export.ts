export async function exportExcel(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: "No rows" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export async function exportPdf(title: string, sections: { heading: string; head: string[]; body: (string | number)[][] }[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(8);
  doc.text(`PMS 11 (IMO 7511826) · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, 14, 20);
  let y = 26;
  for (const s of sections) {
    doc.setFontSize(11);
    doc.text(s.heading, 14, y);
    autoTable(doc, { startY: y + 2, head: [s.head], body: s.body.map((r) => r.map((c) => String(c ?? ""))), styles: { fontSize: 7, cellPadding: 1.2 }, headStyles: { fillColor: [20, 33, 61], textColor: [222, 196, 132] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    if (y > 180) { doc.addPage(); y = 16; }
  }
  doc.save(`${title.replace(/\W+/g, "_")}.pdf`);
}
