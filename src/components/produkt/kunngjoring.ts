/** One polite live region per page for cart announcements. */
let region: HTMLElement | null = null;

export function kunngjor(tekst: string): void {
  if (!region) {
    region = document.createElement('div');
    region.className = 'visuelt-skjult';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  // Clear first so the same message twice is announced twice.
  region.textContent = '';
  const r = region;
  window.setTimeout(() => {
    r.textContent = tekst;
  }, 60);
}
