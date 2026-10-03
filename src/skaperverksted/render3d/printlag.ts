/**
 * Print layers in the 3D view (design revision 2026-10-02, §12): thin lines
 * at every layer boundary, measured in real millimetres from the build plate,
 * so the preview shows how the printer will build the part. Drawn in the
 * material's shader; turning it on or off changes a uniform, not the model.
 * The lines fade out when the camera is too far away for single layers to be
 * told apart (under about two pixels per layer); zooming in shows them.
 */
import type * as THREE from 'three';

interface Printlaguniformer {
  uLagHoyde: { value: number };
  uPrintlag: { value: number };
}

const NOKKEL = 'printlag';

/** Adds the layer lines to a lit Three.js material. Other materials are left as they are. */
export function leggTilPrintlag(materiale: THREE.Material, lagHoyde: number, pa: boolean): void {
  if (!('emissive' in materiale)) return;
  const u: Printlaguniformer = {
    uLagHoyde: { value: Math.max(0.05, lagHoyde) },
    uPrintlag: { value: pa ? 1 : 0 },
  };
  materiale.userData[NOKKEL] = u;
  materiale.onBeforeCompile = (shader) => {
    shader.uniforms.uLagHoyde = u.uLagHoyde;
    shader.uniforms.uPrintlag = u.uPrintlag;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPrintZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPrintZ = (modelMatrix * vec4(transformed, 1.0)).z;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vPrintZ;\nuniform float uLagHoyde;\nuniform float uPrintlag;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uPrintlag > 0.5) {
          float z = vPrintZ / uLagHoyde;
          float bredde = fwidth(z);
          float avstand = abs(fract(z + 0.5) - 0.5) / max(bredde, 1e-4);
          float linje = 1.0 - smoothstep(0.0, 1.0, avstand);
          float synlig = 1.0 - smoothstep(0.25, 0.55, bredde);
          diffuseColor.rgb *= 1.0 - 0.42 * linje * synlig;
        }`,
      );
  };
  materiale.customProgramCacheKey = () => NOKKEL;
  materiale.needsUpdate = true;
}

/** Turns the layer lines on or off, or changes the layer height. */
export function settPrintlag(materiale: THREE.Material, pa: boolean, lagHoyde?: number): void {
  const u = materiale.userData[NOKKEL] as Printlaguniformer | undefined;
  if (!u) return;
  u.uPrintlag.value = pa ? 1 : 0;
  if (lagHoyde) u.uLagHoyde.value = Math.max(0.05, lagHoyde);
}
