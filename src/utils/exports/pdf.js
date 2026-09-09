export const loadFaviconAsPng = async () => {
  const response = await fetch('/favicon.svg');
  if (!response.ok) throw new Error('No se pudo cargar el favicon.');

  const svgText = await response.text();
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 128, 128);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
};
