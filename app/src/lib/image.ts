const MAX_EDGE = 1920;
/** The storage bucket refuses anything over 2 MB; aim well under it. */
const MAX_BYTES = 1_500_000;

export interface PreparedImage { blob: Blob; width: number; height: number }

/**
 * Shrinks a chosen picture to at most `maxEdge` px on its long edge and re-saves it as a JPEG under `maxBytes`.
 * That keeps uploads small and drops whatever the camera embedded in the file (location, device).
 * A see-through picture is laid on white, since a JPEG has no see-through.
 */
export async function shrinkImage(file: Blob, maxEdge: number, maxBytes: number): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as a picture. Try a JPEG or PNG.");
  }
  // If the best quality is still too big, a smaller picture is tried before giving up.
  for (const edge of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.5)]) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error("This browser couldn't prepare the picture."); }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.75, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) { bitmap.close(); return { blob, width: canvas.width, height: canvas.height }; }
    }
    if (scale === 1 && edge !== maxEdge) break;
  }
  bitmap.close();
  throw new Error('That picture is too detailed to shrink under the size limit. Try a smaller one.');
}

/** A sheet background: at most 1920 px on its long edge. */
export async function prepareImage(file: File): Promise<Blob> {
  return (await shrinkImage(file, MAX_EDGE, MAX_BYTES)).blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The picture couldn't be read."));
    reader.readAsDataURL(blob);
  });
}
