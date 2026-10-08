// A hand check, not part of the test suite: npx tsx bot/test/pdf-smoke.ts <out.pdf>
import { writeFileSync } from 'node:fs';
import { kaito } from '@dndf/engine';
import { closeBrowser, sheetPdf, SITE } from '../src/pdf';
import { rulesOf } from '../src/rules';

const doc = kaito(rulesOf('dndf-10'));

const started = Date.now();
const pdf = await sheetPdf(doc, false);
writeFileSync(process.argv[2] ?? 'sheet.pdf', pdf);
console.log(`PDF of ${pdf.length} bytes from ${SITE} in ${Date.now() - started} ms`);
const again = Date.now();
await sheetPdf(doc, true);
console.log(`second (full text) in ${Date.now() - again} ms`);
await closeBrowser();
