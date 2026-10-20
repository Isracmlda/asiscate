export const createInventoryQrPayload = (assetId, unitNumber = 1) => (
  `AI1|${encodeURIComponent(String(assetId))}|${Number(unitNumber) || 1}`
);

export const getInventoryQrImageUrl = (payload, size = 240) => (
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&ecc=M&data=${encodeURIComponent(payload)}`
);

export const createInventoryLabelPdf = async (asset, unitNumber, location) => {
  const [{ jsPDF }, qrResponse] = await Promise.all([
    import('jspdf'),
    fetch(getInventoryQrImageUrl(createInventoryQrPayload(asset.id, unitNumber), 360))
  ]);
  if (!qrResponse.ok) throw new Error('No se pudo generar el código QR de la etiqueta.');
  const qrBlob = await qrResponse.blob();
  const qrDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo preparar el código QR.'));
    reader.readAsDataURL(qrBlob);
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [50, 30] });
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 50, 30, 'F');
  pdf.addImage(qrDataUrl, 'PNG', 1.5, 4, 22, 22, undefined, 'FAST');
  pdf.setTextColor(20, 27, 42);
  const parish = String(location.parish || 'Parroquia');
  const diaconia = String(location.diaconia || 'Diaconía');
  const room = asset.kind === 'furniture' ? `Aula: ${asset.room || 'Salón'}` : '';
  const locationLines = [parish, `Diaconía: ${diaconia}`, room]
    .filter(Boolean)
    .flatMap(line => pdf.splitTextToSize(line, 22.5));
  const locationLineStep = Math.min(1.7, 10 / Math.max(1, locationLines.length));
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(Math.max(3.3, Math.min(4.7, locationLineStep * 2.6)));
  let y = 5.5;
  locationLines.forEach(line => {
    pdf.text(line, 25.5, y);
    y += locationLineStep;
  });
  y += 0.8;

  const nameLines = pdf.splitTextToSize(`${String(asset.name || 'Activo')} #${unitNumber}`, 22.5);
  const nameStep = Math.min(2.4, Math.max(1.5, (28 - y) / Math.max(1, nameLines.length)));
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.max(4.5, Math.min(7, nameStep * 2.8)));
  nameLines.forEach(line => {
    pdf.text(line, 25.5, y);
    y += nameStep;
  });
  return pdf;
};

export const downloadInventoryLabelsZip = async (asset, location) => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const unitCount = Math.max(1, Number(asset.stock) || 1);
  for (let unit = 1; unit <= unitCount; unit += 1) {
    const pdf = await createInventoryLabelPdf(asset, unit, location);
    zip.file(`etiqueta-${String(unit).padStart(2, '0')}.pdf`, pdf.output('arraybuffer'));
  }
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `etiquetas-${String(asset.name || 'activo').trim().replace(/[^\p{L}\p{N}-]+/gu, '-')}.zip`;
  link.click();
  URL.revokeObjectURL(url);
};
