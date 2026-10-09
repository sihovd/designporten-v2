/** The Pattern tool's preview on the canvas: the outlines of the copies «Lag mønster» will make, and the path they follow. */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { ringerI } from '../../geometri/polygon';
import type { Farger } from '../../render2d/Lerret';
import type { Visning } from '../../render2d/visning';
import { banelinje, monsterKilder, monsterPlasseringer, sentrumAv } from './monster';
import { verdensRegion } from './modell';
import { signtilstand } from './tilstand';

export function tegnMonster(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, benk: Arbeidsbenk): void {
  const valg = signtilstand(benk).t.monster;
  const kilder = monsterKilder(benk, valg);
  const sentrum = kilder.length ? sentrumAv(kilder) : null;
  if (!sentrum) return;
  const bane = valg.modus === 'bane' && valg.baneId ? benk.dok.objekter[valg.baneId] : undefined;
  const linje = bane ? banelinje(bane) : null;
  ctx.save();
  ctx.lineWidth = 1.2;
  if (linje) {
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = f.lilla;
    ctx.beginPath();
    linje.forEach((p, i) => {
      const s = v.tilSkjerm(p);
      if (i) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = f.cyan;
  const plasseringer = monsterPlasseringer(sentrum, valg, linje);
  const regioner = kilder.map((o) => ({ o, ringer: ringerI(verdensRegion(o) ?? []) }));
  for (const p of plasseringer)
    for (const { ringer } of regioner) {
      // the copy is the original turned by `drot` about the group's centre, then moved
      const r = (p.drot * Math.PI) / 180;
      const cos = Math.cos(r),
        sin = Math.sin(r);
      ctx.beginPath();
      for (const ring of ringer) {
        const steg = Math.max(1, Math.floor(ring.length / 160));
        for (let i = 0; i < ring.length; i += steg) {
          const q = ring[i]!;
          const rx = q.x - sentrum.x,
            ry = q.y - sentrum.y;
          const s = v.tilSkjerm({
            x: sentrum.x + p.dx + rx * cos - ry * sin,
            y: sentrum.y + p.dy + rx * sin + ry * cos,
          });
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
      }
      ctx.stroke();
    }
  ctx.restore();
}
