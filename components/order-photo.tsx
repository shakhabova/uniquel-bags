'use client';

export function OrderPhoto({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} onError={event => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = '/image-unavailable.svg';
  }}/>;
}
