/** The Vektorverksted on a page of its own, for trying it before it goes into Sign Forge. */
import { render } from 'preact';
import { Vektorverksted } from '../Vektorverksted';
import '../vektorverksted.css';

render(<Vektorverksted />, document.getElementById('app')!);
