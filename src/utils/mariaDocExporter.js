import { toPng } from 'html-to-image';
import JSZip from 'jszip';

/**
 * Convierte un archivo nativo a string Base64 limpio sin encabezado.
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result || '';
      const base64 = typeof result === 'string' && result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Extrae texto legible desde un archivo de Word (.docx).
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const extractDocxText = async (file) => {
  try {
    const zip = await JSZip.loadAsync(file);
    const docXml = await zip.file('word/document.xml')?.async('text');
    if (!docXml) return '';

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'text/xml');
    const paragraphs = xmlDoc.getElementsByTagName('w:p');
    const textLines = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const line = paragraphs[i].textContent;
      if (line && line.trim()) {
        textLines.push(line.trim());
      }
    }

    return textLines.join('\n');
  } catch (err) {
    console.warn('[MarIA Document Exporter] Error extrayendo texto de Word .docx:', err);
    return '';
  }
};

/**
 * Extrae texto de un archivo de texto (.txt, .md, .csv, .json).
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const extractPlainText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Convierte Markdown simple a HTML limpio para el documento de Word.
 * @param {string} markdownText 
 * @returns {string}
 */
const markdownToBasicHtml = (markdownText) => {
  let html = markdownText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Encabezados
  html = html.replace(/^### (.*$)/gim, '<h3 style="color:#0284c7;font-size:14pt;margin-top:12px;margin-bottom:6px;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="color:#0369a1;font-size:16pt;margin-top:16px;margin-bottom:8px;">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 style="color:#0c4a6e;font-size:18pt;margin-top:20px;margin-bottom:10px;">$1</h1>');

  // Negrita y Cursiva
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Viñetas
  html = html.replace(/^\* (.*$)/gim, '<li style="margin-left:20px;">$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li style="margin-left:20px;">$1</li>');

  // Párrafos
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<h') || p.startsWith('<li')) return p;
    return `<p style="margin-bottom:8px;">${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('');

  return html;
};

/**
 * Descarga una respuesta de MarIA en formato Microsoft Word (.doc).
 * @param {string} title 
 * @param {string} contentText 
 */
export const exportResponseToWord = (title, contentText) => {
  const cleanTitle = title || 'Respuesta_MarIA_AsisCate';
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${cleanTitle}</title>
      <style>
        body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.6; padding: 24px; }
        .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
        .header-title { font-size: 16pt; font-weight: bold; color: #0369a1; margin: 0; }
        .header-sub { font-size: 10pt; color: #64748b; margin: 4px 0 0 0; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 9pt; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-title">✝️ AsisCate • Parroquia El Carmen</div>
        <div class="header-sub">Documento generado por MarIA (Asistente Pastoral Virtual)</div>
      </div>
      <div class="content">
        ${markdownToBasicHtml(contentText)}
      </div>
      <div class="footer">
        AsisCate • Pastoral de Catequesis • Alajuela, Costa Rica
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Descarga una respuesta de MarIA en formato PDF.
 * @param {string} title 
 * @param {string} contentText 
 */
export const exportResponseToPdf = async (title, contentText) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const cleanTitle = title || 'Respuesta_MarIA_AsisCate';

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(2, 132, 199); // Azul celeste pastoral
  doc.text('✝️ AsisCate • Parroquia El Carmen', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento generado por MarIA (Asistente Pastoral)', 14, 22);

  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.5);
  doc.line(14, 25, 198, 25);

  // Cuerpo del texto
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  // Remover markdown para PDF simple o ajustar líneas
  const plainLines = contentText
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^### (.*$)/gim, '\n$1\n')
    .replace(/^## (.*$)/gim, '\n$1\n')
    .replace(/^# (.*$)/gim, '\n$1\n');

  const splitLines = doc.splitTextToSize(plainLines, 184);
  let y = 32;
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 0; i < splitLines.length; i++) {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.text(splitLines[i], 14, y);
    y += 5.5;
  }

  // Pie de página
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${p} de ${totalPages} • AsisCate - Parroquia El Carmen`, 105, pageHeight - 10, { align: 'center' });
  }

  doc.save(`${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
};

/**
 * Captura y descarga el contenedor de un mensaje como Imagen (.png).
 * @param {string} elementId 
 * @param {string} filename 
 */
export const exportResponseToImage = async (elementId, filename) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const dataUrl = await toPng(element, {
      quality: 0.95,
      cacheBust: true,
      style: {
        borderRadius: '12px',
        padding: '16px'
      }
    });

    const link = document.createElement('a');
    link.download = `${filename || 'MarIA_Respuesta'}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('[MarIA Document Exporter] Error al exportar imagen:', err);
  }
};
