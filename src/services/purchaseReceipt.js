export const RECEIPT_MAX_CHARS = 700000;
export function receiptValid(value) {
    return value == null || (typeof value === 'object' && typeof value.name === 'string' && value.name.length <= 180 && typeof value.dataUrl === 'string' && value.dataUrl.length <= RECEIPT_MAX_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl));
}

export async function prepareReceiptPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('La foto debe pesar menos de 15 MB.');
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.85, 0.7, 0.55]) {
            const value = { name: file.name.slice(0, 180), dataUrl: canvas.toDataURL('image/jpeg', quality) };
            if (receiptValid(value)) return value;
        }
        throw new Error('La foto sigue siendo muy grande. Recorta el ticket o elige una foto más pequeña.');
    } catch (error) {
        if (error.name === 'EncodingError') throw new Error('No se pudo leer la imagen. Selecciona otra foto.', { cause: error });
        throw error;
    } finally { URL.revokeObjectURL(url); }
}
