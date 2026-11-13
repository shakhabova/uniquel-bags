'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { getHoverPhotoIndex } from '@/lib/card-carousel';
import { productGallery, type Product } from '@/lib/products';

const CYCLE_INTERVAL = 3500;

type Props = { product: Product; color: string; disabled: boolean; onOpen: () => void };

export function CatalogCardImage({ product, color, disabled, onOpen }: Props) {
  const photos = productGallery(product, color);
  const [selection, setSelection] = useState({ color, index: 0 });
  const [loadedPhotos, setLoadedPhotos] = useState<Record<string, boolean>>({});
  const [displayedPhoto, setDisplayedPhoto] = useState(photos[0]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const index = selection.color === color && selection.index < photos.length ? selection.index : 0;
  // Reset even when switching back to a color whose gallery was previewed before.
  if (selection.color !== color) setSelection({ color, index: 0 });
  const requestedPhoto = photos[index];
  // Keep the last photo visible until the requested one is ready to crossfade.
  const activePhoto = photos.includes(displayedPhoto) ? displayedPhoto : requestedPhoto;
  if (loadedPhotos[requestedPhoto] && displayedPhoto !== requestedPhoto) setDisplayedPhoto(requestedPhoto);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(query.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateMotion();
    updateVisibility();
    query.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      query.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (photos.length < 2 || hovered || focused || disabled || !visible || !pageVisible || reducedMotion) return;
    const timer = window.setInterval(() => {
      setSelection(current => ({ color, index: current.color === color ? (current.index + 1) % photos.length : 1 }));
    }, CYCLE_INTERVAL);
    return () => window.clearInterval(timer);
  }, [photos.length, color, hovered, focused, disabled, visible, pageVisible, reducedMotion]);

  // Cached images can finish loading before hydration installs onLoad handlers.
  const markReady = useCallback((image: HTMLImageElement | null) => {
    const photo = image?.dataset.photo;
    if (!photo || !image.complete || !image.naturalWidth) return;
    setLoadedPhotos(current => current[photo] ? current : { ...current, [photo]: true });
  }, []);

  function scrub(event: PointerEvent<HTMLButtonElement>) {
    if (photos.length < 2 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextIndex = getHoverPhotoIndex(event.clientX, rect.left, rect.width, photos.length);
    setSelection(current => current.color === color && current.index === nextIndex ? current : { color, index: nextIndex });
  }

  return (
    <div className="catalog-card-image" ref={root}
      onPointerEnter={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setHovered(true); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setHovered(false); }}>
      <button type="button" className="product-image" onClick={onOpen} aria-label={'Подробнее: ' + product.name}
        onPointerEnter={scrub} onPointerMove={scrub} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        {photos.map(photo => (
          // Keep the image layers mounted so both autoplay and cursor scrubbing can crossfade.
          // oxlint-disable-next-line next/no-img-element
          <img key={photo} className={'catalog-card-frame' + (photo === activePhoto ? ' is-active' : '')}
            src={photo} data-photo={photo} ref={markReady} alt={photo === activePhoto ? product.name + (color ? ' · ' + color : '') : ''}
            aria-hidden={photo !== activePhoto} loading="lazy"
            onLoad={event => markReady(event.currentTarget)}
            onError={event => { event.currentTarget.src = '/image-unavailable.svg'; }} />
        ))}
      </button>
      {photos.length > 1 && <div className="catalog-card-carousel-controls">
        <div className="catalog-card-indicators" aria-hidden="true">
          {photos.map(photo => <span key={photo} className={photo === activePhoto ? 'active' : ''} />)}
        </div>
      </div>}
    </div>
  );
}
