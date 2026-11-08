/** The part of imagetracerjs (public domain, no bundled types) that Sign Forge's vectoriser uses. */
declare module 'imagetracerjs' {
  interface Bildedata {
    width: number;
    height: number;
    data: ArrayLike<number>;
  }
  const ImageTracer: {
    imagedataToTracedata(bilde: Bildedata, valg?: Record<string, unknown>): unknown;
    blur(bilde: Bildedata, radius: number, delta: number): Bildedata;
  };
  export default ImageTracer;
}
