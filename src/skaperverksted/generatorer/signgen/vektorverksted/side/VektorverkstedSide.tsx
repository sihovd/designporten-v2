/**
 * The Vektorverksted as its own tool in Skaperverksted
 * (/skaperverksted/vektorverksted/, Sivert 2026-11-11). The same component
 * opens from «Bilde» in Sign Forge, where it also has «Legg på skiltet».
 * Here the result is downloaded or copied; «Lukk» goes back to the hub.
 */
import { Vektorverksted } from '../Vektorverksted';
import '../vektorverksted.css';

export function VektorverkstedSide({ tilbake }: { tilbake: string }) {
  return (
    <div class="vektorverksted-side">
      <Vektorverksted lukk={() => window.location.assign(tilbake)} />
    </div>
  );
}
