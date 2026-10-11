/**
 * Build switches (docs/development.md#deploy).
 *
 * `skaperverkstedApent`: whether the Forge tools are published. Off in the
 * one.com build until Sivert opens them (2026-10-11), on in the Node build
 * (Render preview). Override with DP_SKAPERVERKSTED=pa or =av at build time.
 * When off, /skaperverksted/ is a short «kommer snart» page, the tool pages
 * are not built (404), and menus, cards, search and product links leave the
 * tools out.
 */
declare const __DP_SKAPERVERKSTED__: boolean | undefined;

export const skaperverkstedApent: boolean =
  typeof __DP_SKAPERVERKSTED__ === 'boolean' ? __DP_SKAPERVERKSTED__ : true;
