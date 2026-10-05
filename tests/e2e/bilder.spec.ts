import { expect, test } from '@playwright/test';

/**
 * Guard: no image may be drawn with other proportions than its own.
 * An img whose box differs from its natural ratio must crop or letterbox
 * (object-fit cover/contain/...), never fill.
 */
const SIDER = [
  '/',
  '/produkter/',
  '/produkter/spiralvase/',
  '/spesialdesign/',
  '/om/',
  '/inspirasjon/eksempel-prosjektside/',
];
const BREDDER = [320, 390, 768, 1024, 1440];

for (const bredde of BREDDER) {
  test(`bilder beholder proporsjonene ved ${bredde} px`, async ({ page }) => {
    await page.setViewportSize({ width: bredde, height: 900 });
    for (const sti of SIDER) {
      await page.goto(sti);
      // lazy images load as they come into view
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
      });
      const strekte = await page.evaluate(() =>
        [...document.images]
          .filter((img) => img.complete && img.naturalWidth > 0)
          .flatMap((img) => {
            const cs = getComputedStyle(img);
            const boks = img.getBoundingClientRect();
            if (boks.width < 4 || boks.height < 4 || cs.objectFit !== 'fill') return [];
            const vist = boks.width / boks.height;
            const eget = img.naturalWidth / img.naturalHeight;
            return Math.abs(vist / eget - 1) > 0.02
              ? [`${img.currentSrc.split('/').pop()} (${vist.toFixed(2)} vs ${eget.toFixed(2)})`]
              : [];
          }),
      );
      expect(strekte, `strekte bilder på ${sti}`).toEqual([]);
    }
  });
}
