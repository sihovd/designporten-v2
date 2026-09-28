/**
 * Content collections. Each area owns its own collection definition file;
 * this file only registers them (avoids merge conflicts between workstreams).
 */
import { produkter } from './content/produkter/samling';
import { inspirasjon } from './content/inspirasjon/samling';

export const collections = { produkter, inspirasjon };
