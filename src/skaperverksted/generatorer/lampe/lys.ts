/**
 * Preview lighting state (not part of the document, not in undo): the lamp
 * light on/off and the day/night background (spec: "Light behaviour").
 */
import { useEffect, useState } from 'preact/hooks';

export interface Lystilstand {
  /** Light inside the lamp on. */
  pa: boolean;
  /** Night background: the room goes dark. */
  natt: boolean;
}

class Lyslager {
  t: Lystilstand = { pa: false, natt: false };
  private lyttere = new Set<(t: Lystilstand) => void>();
  sett(d: Partial<Lystilstand>): void {
    this.t = { ...this.t, ...d };
    for (const f of this.lyttere) f(this.t);
  }
  lytt(f: (t: Lystilstand) => void): () => void {
    this.lyttere.add(f);
    return () => this.lyttere.delete(f);
  }
}

/** One lamp editor is open per page, so one store is enough. */
export const lys = new Lyslager();

export function brukLys(): Lystilstand {
  const [t, settT] = useState(lys.t);
  useEffect(() => {
    settT(lys.t);
    return lys.lytt(settT);
  }, []);
  return t;
}
