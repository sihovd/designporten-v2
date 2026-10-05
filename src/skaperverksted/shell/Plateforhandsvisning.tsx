/**
 * Export preview of the build plate (Sivert, 2026-10-05): the parts as
 * they lie on the plate in the exported file, seen from above and to
 * scale, in their colours, with the filament slot each part gets. Drawn
 * from the same meshes that go into the file, so it shows what the
 * slicer will get. The plate is drawn as technical geometry (D-3).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { ModellDel } from '../geometri/mesh';
import { finnMateriale } from '../core/materialer';
import { filamentplasser } from '../eksport/tremf';
import { tall } from '../core/enheter';

interface Trekant {
  z: number;
  lys: number;
  hex: string;
  p: [number, number, number, number, number, number];
}

/** Upward-facing triangles of every part, lowest first, so higher parts cover lower ones. */
function trekanterOvenfra(deler: ModellDel[]): Trekant[] {
  const ut: Trekant[] = [];
  for (const d of deler) {
    const hex = finnMateriale(d.materialId).hex;
    const p = d.mesh.posisjoner;
    const ix = d.mesh.indekser;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3,
        b = ix[t + 1]! * 3,
        c = ix[t + 2]! * 3;
      const ux = p[b]! - p[a]!,
        uy = p[b + 1]! - p[a + 1]!,
        uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!,
        vy = p[c + 1]! - p[a + 1]!,
        vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (!l || nz / l < 0.05) continue;
      ut.push({
        z: Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!),
        lys: nz / l,
        hex,
        p: [p[a]!, p[a + 1]!, p[b]!, p[b + 1]!, p[c]!, p[c + 1]!],
      });
    }
  }
  return ut.sort((x, y) => x.z - y.z);
}

function farge(el: Element, navn: string, reserve: string): string {
  return getComputedStyle(el).getPropertyValue(navn).trim() || reserve;
}

/** A label drawn on the plate with its top-left corner at (x, y) in plate millimetres. */
export interface Plateetikett {
  x: number;
  y: number;
  tekst: string;
}

const INGEN: Plateetikett[] = [];

export function Plateforhandsvisning({
  deler,
  plate,
  etiketter = INGEN,
  beskrivelse,
}: {
  deler: ModellDel[];
  plate: { bredde: number; dybde: number };
  /** Numbers or names drawn over the parts (the CSV row of each sign). */
  etiketter?: Plateetikett[];
  /** Replaces the caption text. */
  beskrivelse?: string;
}) {
  const lerret = useRef<HTMLCanvasElement>(null);
  const plasser = filamentplasser(deler);

  useEffect(() => {
    const c = lerret.current;
    if (!c) return;
    const trekanter = trekanterOvenfra(deler);
    const tegn = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = Math.min((w - 24) / plate.bredde, (h - 24) / plate.dybde);
      const x0 = w / 2,
        y0 = h / 2;
      const X = (x: number) => x0 + x * s;
      const Y = (y: number) => y0 - y * s;

      // the plate, with a 10 mm grid and a stronger line every 50 mm
      ctx.fillStyle = farge(c, '--overflate', '#f3f1ec');
      ctx.fillRect(X(-plate.bredde / 2), Y(plate.dybde / 2), plate.bredde * s, plate.dybde * s);
      const linje = farge(c, '--linje', '#d8d4cc');
      for (let mmX = 0; mmX <= plate.bredde; mmX += 10) {
        ctx.strokeStyle = linje;
        ctx.globalAlpha = mmX % 50 === 0 ? 0.9 : 0.4;
        ctx.beginPath();
        ctx.moveTo(X(-plate.bredde / 2 + mmX), Y(plate.dybde / 2));
        ctx.lineTo(X(-plate.bredde / 2 + mmX), Y(-plate.dybde / 2));
        ctx.stroke();
      }
      for (let mmY = 0; mmY <= plate.dybde; mmY += 10) {
        ctx.globalAlpha = mmY % 50 === 0 ? 0.9 : 0.4;
        ctx.beginPath();
        ctx.moveTo(X(-plate.bredde / 2), Y(-plate.dybde / 2 + mmY));
        ctx.lineTo(X(plate.bredde / 2), Y(-plate.dybde / 2 + mmY));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = farge(c, '--linje-sterk', '#9b968c');
      ctx.strokeRect(X(-plate.bredde / 2), Y(plate.dybde / 2), plate.bredde * s, plate.dybde * s);

      // the parts, lowest first; slopes a little darker so edges and profiles read
      for (const t of trekanter) {
        ctx.fillStyle = t.hex;
        ctx.strokeStyle = t.hex;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(X(t.p[0]), Y(t.p[1]));
        ctx.lineTo(X(t.p[2]), Y(t.p[3]));
        ctx.lineTo(X(t.p[4]), Y(t.p[5]));
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 0.5;
        ctx.stroke();
        if (t.lys < 0.98) {
          ctx.fillStyle = '#000';
          ctx.globalAlpha = (1 - t.lys) * 0.35;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // labels: dark text with a light edge reads on every filament colour
      if (etiketter.length) {
        ctx.font = `600 ${Math.max(10, Math.min(16, s * 7))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        for (const e of etiketter) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeText(e.tekst, X(e.x), Y(e.y));
          ctx.fillStyle = '#111';
          ctx.fillText(e.tekst, X(e.x), Y(e.y));
        }
      }
    };
    tegn();
    const ro = new ResizeObserver(tegn);
    ro.observe(c);
    return () => ro.disconnect();
  }, [deler, etiketter, plate.bredde, plate.dybde]);

  return (
    <figure class="plateforhandsvisning">
      <canvas
        ref={lerret}
        role="img"
        aria-label={`Byggeplaten sett ovenfra, ${tall(plate.bredde)} × ${tall(plate.dybde)} mm, med ${deler.length} deler slik de ligger i filen`}
      />
      <figcaption>
        <p class="dempet">
          {beskrivelse ??
            `Slik ligger delene på byggeplaten i 3MF-filen, sett ovenfra og i skala. Plate ${tall(plate.bredde)} × ${tall(plate.dybde)} mm.`}
        </p>
        <ul class="filamentliste">
          {plasser.map((id, i) => {
            const m = finnMateriale(id);
            const navn = [...new Set(deler.filter((d) => d.materialId === id).map((d) => d.navn))];
            return (
              <li key={id}>
                <span class="mono filamentnr">{i + 1}</span>
                <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
                <span>
                  <strong>{m.navn}</strong> <span class="dempet">{navn.join(', ')}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </figcaption>
    </figure>
  );
}
