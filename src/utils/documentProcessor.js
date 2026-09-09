import { jsPDF } from 'jspdf';

/**
 * Convierte un archivo nativo (PDF o Imagen) a string Base64 puro (sin encabezado data:).
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Extraer solo la cadena base64 limpia sin el prefijo data:...;base64,
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Comprime una imagen en el navegador reduciendo sus dimensiones y calidad.
 * @param {File} file - Archivo de imagen original
 * @param {number} maxWidth - Ancho máximo permitido (default 1280px)
 * @param {number} quality - Calidad de compresión (0.1 a 1.0)
 * @returns {Promise<string>} Imagen en Data URL (data:image/jpeg;base64,...)
 */
export const compressImage = (file, maxWidth = 1280, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a JPEG comprimido
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Recibe 1 o 2 fotos comprimidas (Data URL) y genera un PDF centrado estilo fotocopia.
 * @param {string[]} imageBase64List - Lista de imágenes en formato Data URL o Base64
 * @returns {Promise<string>} Base64 puro del PDF generado (listo para Apps Script)
 */
export const generateIDCardPdf = async (imageBase64List) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter', // 215.9 mm x 279.4 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const targetImgWidth = 120; // Ancho estandarizado para la cédula en mm
  let currentY = 35; // Margen superior inicial

  for (let i = 0; i < imageBase64List.length; i++) {
    const imgData = imageBase64List[i];
    
    // Obtener relación de aspecto de la imagen
    const imgProps = doc.getImageProperties(imgData);
    const targetImgHeight = (imgProps.height * targetImgWidth) / imgProps.width;

    // Calcular posición X para centrar
    const xPos = (pageWidth - targetImgWidth) / 2;

    // Dibujar imagen
    doc.addImage(imgData, 'JPEG', xPos, currentY, targetImgWidth, targetImgHeight);

    // Etiqueta sutil (Frente / Reverso)
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const label = i === 0 ? '- FRENTE -' : '- REVERSO -';
    doc.text(label, pageWidth / 2, currentY + targetImgHeight + 5, { align: 'center' });

    // Espacio vertical para la siguiente imagen
    currentY += targetImgHeight + 25;
  }

  // Exportar como Data URL y extraer el Base64 limpio
  const pdfDataUri = doc.output('datauristring');
  return pdfDataUri.split(',')[1];
};

/**
 * Elimina un archivo de Google Drive a través del Apps Script mediante la URL o ID del archivo.
 * @param {string} fileUrlOrId - URL completa o ID del archivo de Google Drive
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
export const deleteDriveFile = async (fileUrlOrId) => {
  if (!fileUrlOrId || typeof fileUrlOrId !== 'string' || !fileUrlOrId.includes('google.com')) {
    return false;
  }
  try {
    const { APPS_SCRIPT_URL } = await import('./constants');
    if (!APPS_SCRIPT_URL) return false;

    // Extraer ID si es un link de Drive
    let fileId = fileUrlOrId;
    const match = fileUrlOrId.match(/[-\w]{25,}/);
    if (match) {
      fileId = match[0];
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'deleteFile',
        fileId: fileId,
        fileUrl: fileUrlOrId
      })
    });
    const res = await response.json();
    return res.status === 'success';
  } catch (err) {
    console.warn('No se pudo eliminar el archivo de Google Drive:', err);
    return false;
  }
};