/**
 * Freezes the page while a finger is on a swipeable photo. iOS Safari can ignore
 * touchmove.preventDefault() once it has started scrolling, so the body is also
 * pinned in place (position: fixed) and restored to the same scroll offset afterwards.
 */
let lockedScrollY: number | null = null;

export function lockPageScroll(): void {
  if (lockedScrollY !== null || typeof document === 'undefined') return;
  lockedScrollY = window.scrollY;
  const body = document.body;
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
}

export function unlockPageScroll(): void {
  if (lockedScrollY === null) return;
  const y = lockedScrollY;
  lockedScrollY = null;
  const body = document.body;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  window.scrollTo(0, y);
}
