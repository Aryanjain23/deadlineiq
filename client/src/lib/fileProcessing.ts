/**
 * Utility for processing image and document uploads before sending to server AI endpoints.
 * Resizes large photos/images client-side to keep base64 payloads under Vercel's 4.5MB serverless limit
 * while maintaining high visual clarity for Gemini and OpenRouter OCR vision analysis.
 */

const MAX_IMAGE_DIMENSION = 1800; // max width or height in pixels
const JPEG_QUALITY = 0.85; // 85% JPEG quality balances high sharpness and small file size
const MAX_BASE64_BYTES = 4.2 * 1024 * 1024; // 4.2 MB safety margin for Vercel payload limit

export async function processFileForAi(file: File): Promise<{
  base64: string;
  mimeType: string;
  fileName: string;
}> {
  const fileName = file.name;
  const rawType = file.type.toLowerCase();
  const isImage = rawType.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(fileName);
  const isPdf = rawType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  if (isImage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            let { width, height } = img;
            if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
              if (width > height) {
                height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
                width = MAX_IMAGE_DIMENSION;
              } else {
                width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
                height = MAX_IMAGE_DIMENSION;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error("Could not create canvas context for image optimization.");
            }

            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
            resolve({
              base64: compressedDataUrl,
              mimeType: "image/jpeg",
              fileName,
            });
          } catch (err) {
            // Fallback to original image if canvas processing fails
            const originalDataUrl = e.target?.result as string;
            resolve({
              base64: originalDataUrl,
              mimeType: rawType || "image/jpeg",
              fileName,
            });
          }
        };
        img.onerror = () => {
          reject(new Error("The selected image file could not be decoded. Please try another image."));
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        reject(new Error("Failed to read selected image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (base64 && base64.length > MAX_BASE64_BYTES * 1.33) {
          reject(
            new Error(
              "The selected PDF file is too large to send to the server (maximum ~3MB for PDF documents). Please try uploading a smaller PDF or pasting the text directly."
            )
          );
          return;
        }
        resolve({
          base64,
          mimeType: "application/pdf",
          fileName,
        });
      };
      reader.onerror = () => {
        reject(new Error("Failed to read selected PDF document."));
      };
      reader.readAsDataURL(file);
    });
  }

  // Fallback for other document types
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        base64: e.target?.result as string,
        mimeType: rawType || "application/octet-stream",
        fileName,
      });
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });
}
