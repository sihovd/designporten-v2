/** Minimal typings for the parts of opentype.js 2 that Skaperverksted uses. */
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface Glyph {
    index: number;
    unicode?: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: Record<string, Record<string, string>>;
    charToGlyph(c: string): Glyph;
    stringToGlyphs(s: string): Glyph[];
    getKerningValue(a: Glyph, b: Glyph): number;
    hasChar(c: string): boolean;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const opentype: { parse: typeof parse };
  export default opentype;
}
