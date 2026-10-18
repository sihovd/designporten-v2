/**
 * The sign seen from above, in its colours: the parts the canvas draws, and
 * a small PNG of them for the public gallery (the sign itself, not artwork).
 */
import type { Dokument } from '../../core/dokument';
import { finnMateriale } from '../../core/materialer';
import { regionBoks, type Region } from '../../geometri/polygon';
import { fargedeler, harOmriss, lagRegion, omrissRegioner } from './modell';

/** Each layer's visible parts, bottom to top, with the material they print in. */
export function skiltdeler(d: Dokument): [Region, string][] {
  const deler: [Region, string][] = [];
  for (const lag of d.lag) {
    if (!lag.synlig) continue;
    const region = lagRegion(d, lag.id);
    if (!region) continue;
    // a layer with outlines: the outlines, then the layer itself (unless it is cut out of them)
    if (harOmriss(lag)) {
      const omriss = omrissRegioner(d, lag.id);
      for (const o of lag.omriss ?? []) {
        const r = omriss?.get(o.id);
        if (o.synlig && r?.length) deler.push([r, o.materialId]);
      }
    }
    if (lag.tekstvisning !== 'kutt')
      for (const f of fargedeler(d, lag, region)) deler.push([f.region, f.materialId]);
  }
  return deler;
}

/** A PNG (data URL) of the sign from above, at most `maks` px on its long side; null when there is nothing to draw. */
export function forhandsbilde(d: Dokument, maks = 480): string | null {
  const deler = skiltdeler(d).filter(([r]) => r.length > 0);
  if (!deler.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maksX = -Infinity,
    maksY = -Infinity;
  for (const [r] of deler) {
    const b = regionBoks(r);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maksX = Math.max(maksX, b.maksX);
    maksY = Math.max(maksY, b.maksY);
  }
  const marg = 8;
  const k = (maks - marg * 2) / Math.max(maksX - minX, maksY - minY, 1);
  const c = document.createElement('canvas');
  c.width = Math.ceil((maksX - minX) * k + marg * 2);
  c.height = Math.ceil((maksY - minY) * k + marg * 2);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  for (const [r, materialId] of deler) {
    ctx.beginPath();
    for (const f of r)
      for (const ring of [f.ytre, ...f.hull]) {
        ring.forEach((p, i) => {
          const x = marg + (p.x - minX) * k;
          const y = marg + (maksY - p.y) * k;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    ctx.fillStyle = finnMateriale(materialId).hex;
    ctx.fill('evenodd');
    // a thin dark edge, as on the canvas, so layers of the same colour still read apart
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  return c.toDataURL('image/png');
}
