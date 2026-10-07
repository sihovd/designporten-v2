import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/** True inside the panel system, where a panel can be opened by name; false in the fixed layout and bottom sheets. */
export const PanelKontekst = createContext(false);
export const brukPanelKontekst = () => useContext(PanelKontekst);
