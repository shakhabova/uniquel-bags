export type ImageSize = { width: number; height: number };
export type CropPosition = { x: number; y: number };
export type ImageCrop = ImageSize & { x: number; y: number };

export function clampPosition(value: number) {
  return Math.min(100, Math.max(0, value));
}

// Coordinates are in original image pixels; preview and export use the same crop.
export function getImageCrop(
  image: ImageSize,
  aspect: number,
  zoom: number,
  position: CropPosition,
): ImageCrop {
  if (
    !Number.isFinite(image.width) || image.width <= 0 ||
    !Number.isFinite(image.height) || image.height <= 0 ||
    !Number.isFinite(aspect) || aspect <= 0 ||
    !Number.isFinite(zoom) || zoom < 1 ||
    !Number.isFinite(position.x) || !Number.isFinite(position.y)
  ) {
    throw new Error('Некорректные параметры кадрирования');
  }
  const width = Math.min(image.width, image.height * aspect) / zoom;
  const height = width / aspect;
  return {
    width,
    height,
    x: (image.width - width) * clampPosition(position.x) / 100,
    y: (image.height - height) * clampPosition(position.y) / 100,
  };
}

export function getCropOutputSize(crop: ImageSize, maxSide = 2000): ImageSize {
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

export async function exportImageCrop(image: HTMLImageElement, crop: ImageCrop): Promise<File> {
  const canvas = document.createElement('canvas');
  const size = getCropOutputSize(crop);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось обработать фото в этом браузере');
  // Give transparent PNG/WebP images a neutral background when exporting to JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Не удалось сохранить фото')),
      'image/jpeg',
      0.92,
    );
  });
  return new File([blob], 'product-photo.jpg', { type: 'image/jpeg' });
}
