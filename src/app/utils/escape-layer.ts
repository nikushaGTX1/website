/**
 * Shared Escape contract: the topmost open layer closes first, one layer per key press.
 * A handler that closes something calls `claimEscape(event)`; every other handler checks
 * it first and ignores a press that has already been used. Inner layers (date picker,
 * nested dropdowns) listen in the capture phase so they run before page-level handlers.
 */
export function escapeAlreadyHandled(event: Event): boolean {
  return event.defaultPrevented;
}

export function claimEscape(event: Event): void {
  event.preventDefault();
}
