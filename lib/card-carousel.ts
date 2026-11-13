// Divide the image into equal zones, clamping positions at either edge.
export function getHoverPhotoIndex(clientX: number, left: number, width: number, count: number): number {
  if (count <= 1 || width <= 0 || !Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width)) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((clientX - left) / width * count)));
}
