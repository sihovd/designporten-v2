/** Shared, strict build/deployment path rules. No shell interpolation. */
export function byggoppsett(env = process.env) {
  const test = env.DP_TEST === 'true';
  const base = env.DP_BASE || (test ? '/designporten-test/' : '/');
  if (!/^\/(?:[a-z0-9][a-z0-9-]*\/)*$/.test(base)) {
    throw new Error('DP_BASE must be / or a slash-delimited URL path ending in /.');
  }
  if (test && !/^\/(?:[a-z0-9][a-z0-9-]*\/)*[a-z0-9][a-z0-9-]*-test\/$/.test(base)) {
    throw new Error('A test build requires a non-root DP_BASE ending in -test/.');
  }
  return { base, test };
}

export function testmappe(verdi) {
  if (
    typeof verdi !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(verdi)
  ) {
    throw new Error(
      'ONECOM_MAPPE must be a relative directory without traversal, spaces or shell characters.',
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*-test$/.test(verdi.split('/').at(-1))) {
    throw new Error('ONECOM_MAPPE must end in -test; production folders are forbidden.');
  }
  return verdi;
}
