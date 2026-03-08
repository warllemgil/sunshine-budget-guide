export type ReceiptStorageProvider = "google-drive";

export const toGoogleDrivePath = (fileId: string): string => `gdrive:${fileId}`;

export const isGoogleDrivePath = (path: string): boolean => path.startsWith("gdrive:");

export const extractGoogleDriveFileId = (path: string): string | null => {
  if (!isGoogleDrivePath(path)) return null;
  const id = path.replace("gdrive:", "").trim();
  return id || null;
};

export const getGoogleDriveFileViewUrl = (path: string): string => {
  const fileId = extractGoogleDriveFileId(path);
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : "";
};

interface GoogleDriveUploadResult {
  id: string;
  webViewLink?: string;
}

export const uploadFileToGoogleDrive = async (
  file: File,
  accessToken: string,
): Promise<GoogleDriveUploadResult | null> => {
  const boundary = `sunshine-${Date.now()}`;
  const metadata = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };

  const body = new Blob([
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    "\r\n",
    `--${boundary}\r\n`,
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    file,
    "\r\n",
    `--${boundary}--`,
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive upload falhou: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as GoogleDriveUploadResult;
  return data?.id ? data : null;
};

const readImageElement = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("Nao foi possivel ler a imagem."));
  };
  img.src = objectUrl;
});

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> => (
  new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
);

/**
 * Compresses image attachments on-device before upload.
 * - PDFs and other non-image files are kept intact.
 * - Images are resized to a practical max dimension and encoded to JPEG.
 */
export const compressImageForUpload = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/")) return file;

  const image = await readImageElement(file);
  const MAX_DIMENSION = 1920;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  // Prefer JPEG for receipts/photos: much smaller while preserving readability.
  const compressed = await canvasToBlob(canvas, "image/jpeg", 0.82);
  if (!compressed) return file;
  if (compressed.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "comprovante";
  return new File([compressed], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};
