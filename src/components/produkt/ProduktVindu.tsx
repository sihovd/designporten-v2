/**
 * The product window (preserved work, docs/design/interaction-and-motion.md#product-window):
 * a light quick view over a darkened, blurred page. Native modal <dialog>:
 * focus stays inside, Esc closes, focus returns to the card. Full-height
 * sheet on small screens. Cards open it through window.dpProduktvindu; until
 * this island has hydrated, a card click simply opens the product page.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formaterMal, type ProduktVisning } from '@/lib/handel/visning';
import ProduktValg from './ProduktValg';
import './produktvindu.css';

interface Props {
  /** Close icon, passed from Astro as a named slot (functional icon set). */
  lukk?: ComponentChildren;
}

const reduser = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function ProduktVindu({ lukk }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const kilde = useRef<HTMLElement | null>(null);
  const [produkt, settProdukt] = useState<ProduktVisning | null>(null);
  const [aktiv, settAktiv] = useState(true);
  // Remount the choices for every opening so they start from the defaults.
  const [apning, settApning] = useState(0);

  useEffect(() => {
    if (window.dpProduktvindu) {
      // Another window is already on the page; this instance stays inert.
      settAktiv(false);
      return;
    }
    window.dpProduktvindu = {
      apne(p, fra) {
        kilde.current = fra;
        settProdukt(p);
        settApning((n) => n + 1);
      },
    };
    document.documentElement.dataset.produktvindu = 'klar';
    return () => {
      delete window.dpProduktvindu;
      delete document.documentElement.dataset.produktvindu;
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (produkt && d && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-vindu-tittel]')?.focus();
    }
  }, [produkt, apning]);

  function lukkVindu() {
    const d = dialog.current;
    if (!d || !d.open || d.dataset.lukker) return;
    const ferdig = () => {
      delete d.dataset.lukker;
      d.close();
    };
    if (reduser()) return ferdig();
    d.dataset.lukker = '';
    window.setTimeout(ferdig, 200);
  }

  function vedLukket() {
    kilde.current?.focus();
  }

  if (!aktiv) return null;
  const p = produkt;
  const mal = p ? formaterMal(p.mal) : null;

  return (
    <dialog
      ref={dialog}
      class="produktvindu"
      aria-labelledby="produktvindu-tittel"
      onCancel={(e) => {
        e.preventDefault();
        lukkVindu();
      }}
      onClose={vedLukket}
      onClick={(e) => {
        if (e.target === dialog.current) lukkVindu();
      }}
      data-produktvindu
    >
      {p && (
        <div class="produktvindu__innhold">
          <div class="produktvindu__bilde">
            <img
              src={p.bilde.src}
              alt={p.bilde.alt}
              width={p.bilde.bredde}
              height={p.bilde.hoyde}
              decoding="async"
            />
            {p.bilde.konsept && <span class="produktvindu__merke mono">Konseptbilde</span>}
          </div>
          <div class="produktvindu__tekst">
            <div class="produktvindu__topp">
              <div>
                <p class="produktvindu__kategori mono">{p.kategoriNavn}</p>
                <h2 id="produktvindu-tittel" class="produktvindu__tittel" tabIndex={-1} data-vindu-tittel>
                  {p.navn}
                </h2>
              </div>
              <button class="produktvindu__lukk" type="button" onClick={lukkVindu}>
                {lukk}
                <span class="visuelt-skjult">Lukk</span>
              </button>
            </div>
            {p.status === 'plassholder' && (
              <p class="produktvindu__plassholder">
                Plassholder. Produktet og bildet viser retningen, men modell, mål og pris er ikke fastsatt
                ennå.
              </p>
            )}
            <p class="produktvindu__beskrivelse">{p.kortBeskrivelse}</p>
            <p class="produktvindu__mal mono">{mal ? `Mål ${mal}` : 'Mål ikke fastsatt ennå'}</p>
            <ProduktValg key={apning} produkt={p} />
            <a class="produktvindu__side" href={p.href}>
              Se hele produktsiden
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}
