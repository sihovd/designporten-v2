/**
 * Sign Forge as its own build (stage D): the same editor as the page
 * /skaperverksted/signgen/ in the website build, but bundled by
 * scripts/bygg-signforge.mjs into skaperverksted/signgen/_app/<versjon>/,
 * so it never shares /_astro/ with the website. The HTML page around it is
 * written by that script.
 */
import { render } from 'preact';
import '@/styles/base.css';
import '@/skaperverksted/shell/verksted.css';
import { Verksted } from '@/skaperverksted/shell/Verksted';

document.documentElement.classList.add('js');
const rot = document.getElementById('signforge');
if (rot) render(<Verksted generatorId="signgen" />, rot);
