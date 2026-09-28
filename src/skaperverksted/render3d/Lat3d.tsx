/**
 * Loads the Three.js view on demand so 2D-first generators start without
 * the 3D bundle; it is prefetched when the browser is idle.
 */
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Visning3dProps } from './Visning3d';

let lastet: ComponentType<Visning3dProps> | null = null;
let laster: Promise<ComponentType<Visning3dProps>> | null = null;

export function last3d(): Promise<ComponentType<Visning3dProps>> {
  laster ??= import('./Visning3d').then((m) => (lastet = m.Visning3d));
  return laster;
}

export function forhandslast3d(): void {
  const ric = (globalThis as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  if (ric) ric(() => void last3d());
  else setTimeout(() => void last3d(), 1500);
}

export function Visning3d(props: Visning3dProps) {
  const [V, settV] = useState(() => lastet);
  useEffect(() => {
    if (!V) void last3d().then((k) => settV(() => k));
  }, []);
  if (!V) {
    return (
      <div class="visning3d-laster" role="status">
        Laster 3D-visning …
      </div>
    );
  }
  return <V {...props} />;
}
