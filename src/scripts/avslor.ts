/** One-time scroll reveals for elements with `.avslor` (see bevegelse.css). */
export function startAvsloringer(rot: ParentNode = document): void {
  const elementer = rot.querySelectorAll<HTMLElement>('.avslor:not(.synlig)');
  if (!('IntersectionObserver' in window)) {
    elementer.forEach((el) => el.classList.add('synlig'));
    return;
  }
  const obs = new IntersectionObserver(
    (oppforinger) => {
      for (const o of oppforinger) {
        if (o.isIntersecting) {
          o.target.classList.add('synlig');
          obs.unobserve(o.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  elementer.forEach((el) => obs.observe(el));
}
