'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Crop, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { clampPosition, exportImageCrop, getImageCrop, type CropPosition } from '@/lib/image-crop';

export type PhotoEditorSelection = { source: File | string; color: string; replace: boolean; index?: number };

type Props = {
  selection: PhotoEditorSelection;
  onApply: (file: File) => Promise<void>;
  onCancel: () => void;
};

export function PhotoEditor({ selection, onApply, onCancel }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [ratio, setRatio] = useState('portrait');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<CropPosition>({ x: 50, y: 50 });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; position: CropPosition } | null>(null);

  useEffect(() => {
    let active = true;
    const source = selection.source;
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const photo = new Image();
    photo.crossOrigin = 'anonymous';
    photo.onload = () => {
      if (active) setImage(photo);
    };
    photo.onerror = () => {
      if (active) setLoadError(typeof source === 'string'
        ? 'Не удалось открыть фото для редактирования. Если сайт запрещает обработку по ссылке, скачайте фото и загрузите его файлом.'
        : 'Не удалось открыть фото. Выберите другой файл JPG, PNG или WebP.');
    };
    photo.src = url;
    return () => {
      active = false;
      photo.onload = null;
      photo.onerror = null;
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
  }, [selection.source]);

  const aspect = ratio === 'square' ? 1 : ratio === 'original' && image
    ? image.naturalWidth / image.naturalHeight : 4 / 5;
  const dimensions = image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  const crop = dimensions ? getImageCrop(dimensions, aspect, zoom, position) : null;
  const canMoveX = !!(dimensions && crop && dimensions.width - crop.width > 0.01);
  const canMoveY = !!(dimensions && crop && dimensions.height - crop.height > 0.01);

  function reset() {
    setRatio('portrait');
    setZoom(1);
    setPosition({ x: 50, y: 50 });
    setError('');
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (saving || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId || !crop || !dimensions || saving) return;
    const frame = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: canMoveX ? clampPosition(start.position.x - (event.clientX - start.x) / frame.width * crop.width / (dimensions.width - crop.width) * 100) : 50,
      y: canMoveY ? clampPosition(start.position.y - (event.clientY - start.y) / frame.height * crop.height / (dimensions.height - crop.height) * 100) : 50,
    });
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    setPosition((current) => ({
      x: canMoveX ? clampPosition(current.x + direction[0] * step) : current.x,
      y: canMoveY ? clampPosition(current.y + direction[1] * step) : current.y,
    }));
  }

  async function apply() {
    if (!image || !crop || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const file = await exportImageCrop(image, crop);
      await onApply(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить фото. Попробуйте ещё раз.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !savingRef.current) onCancel(); }}>
      <DialogContent className="photo-editor-dialog" showCloseButton={!saving}>
        <DialogTitle className="photo-editor-title"><Crop size={20} />Редактирование фото</DialogTitle>
        <DialogDescription>
          {selection.color ? `Фото для цвета «${selection.color}». ` : ''}
          Переместите фото и выберите, что оставить в кадре.
        </DialogDescription>
        {loadError ? <p className="field-error" role="alert">{loadError}</p> : !image ? (
          <p className="photo-editor-loading" aria-live="polite">Открываем фото…</p>
        ) : crop && dimensions && (
          <>
            <div className="photo-editor-well">
              <div className="photo-editor-frame" style={{ '--crop-ratio': aspect } as CSSProperties}>
                {/* Original pixels and local blob URLs are needed for canvas export, not an optimized image. */}
                {/* oxlint-disable-next-line next/no-img-element */}
                <img src={image.src} alt="Предпросмотр кадрирования" draggable={false} style={{
                  width: `${dimensions.width / crop.width * 100}%`,
                  height: `${dimensions.height / crop.height * 100}%`,
                  left: `${-crop.x / crop.width * 100}%`,
                  top: `${-crop.y / crop.height * 100}%`,
                }} />
                <button type="button" className="photo-editor-drag" disabled={saving}
                  aria-label="Переместить фото: перетащите или используйте клавиши со стрелками"
                  onPointerDown={startDrag} onPointerMove={moveDrag}
                  onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
                  onLostPointerCapture={() => { drag.current = null; }} onKeyDown={moveWithKeys}>
                  <span className="photo-editor-grid" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="photo-editor-controls">
              <label className="photo-editor-ratio">Формат кадра
                <select value={ratio} disabled={saving} onChange={(event) => { setRatio(event.target.value); setPosition({ x: 50, y: 50 }); }}>
                  <option value="portrait">Портрет · 4:5</option>
                  <option value="square">Квадрат · 1:1</option>
                  <option value="original">Как у оригинала</option>
                </select>
              </label>
              <label>Масштаб <span className="photo-editor-zoom" aria-hidden="true">{zoom.toFixed(1)}×</span>
                <input type="range" min="1" max="3" step="0.01" value={zoom} disabled={saving}
                  onChange={(event) => setZoom(Number(event.target.value))} />
              </label>
              <label>По горизонтали
                <input type="range" min="0" max="100" step="0.1" value={position.x} disabled={saving || !canMoveX}
                  onChange={(event) => setPosition((current) => ({ ...current, x: Number(event.target.value) }))} />
              </label>
              <label>По вертикали
                <input type="range" min="0" max="100" step="0.1" value={position.y} disabled={saving || !canMoveY}
                  onChange={(event) => setPosition((current) => ({ ...current, y: Number(event.target.value) }))} />
              </label>
            </div>
            <p className="photo-editor-hint">В каталог попадёт только область в рамке. Изменения применятся после сохранения товара.</p>
          </>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="photo-editor-actions">
          <Button type="button" variant="ghost" disabled={!image || saving} onClick={reset}><RotateCcw size={16} />Сбросить</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Отмена</Button>
          <Button type="button" disabled={!image || saving} onClick={() => void apply()}>{saving ? 'Сохраняем…' : 'Применить фото'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
