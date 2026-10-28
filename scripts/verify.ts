import { EXAMPLES } from '../lib/examples';
import { runExtract } from '../lib/extract';

const bySite = new Map<string, string[]>();
for (const e of EXAMPLES) bySite.set(e.site, [...(bySite.get(e.site) ?? []), e.url]);

let grand = 0;
let grandPass = 0;

for (const [site, urls] of bySite) {
  console.log(`\n=== ${site} (${urls.length} urls) ===`);
  let pass = 0;
  for (const u of urls.slice(0, 3)) {
    const r = await runExtract(u, '', { sizes: false });
    const ok = r.formats.length > 0;
    if (ok) pass++;
    grand++;
    if (ok) grandPass++;
    console.log(` ${ok ? 'PASS' : 'FAIL'} http=${r.status} formats=${r.formats.length}  ${u}`);
    if (!ok) for (const d of r.diagnostics) console.log('      -', d);
  }
  console.log(` -> ${pass}/3 passed`);
}

console.log(`\nTOTAL ${grandPass}/${grand} passed`);