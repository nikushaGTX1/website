// Regenerates src/app/utils/country-names-data.ts from CLDR (English, Georgian, Russian).
// Run with: node scripts/generate-country-names.mjs
import { writeFile } from 'node:fs/promises';
import { getCountries } from 'libphonenumber-js/min';

const locales = ['en', 'ka', 'ru'];
const base = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-localenames-full/main';

const territories = {};
for (const locale of locales) {
  const response = await fetch(`${base}/${locale}/territories.json`);
  if (!response.ok) throw new Error(`${locale}: HTTP ${response.status}`);
  const json = await response.json();
  territories[locale] = json.main[locale].localeDisplayNames.territories;
}

const codes = getCountries().slice().sort();
const lines = codes.map((code) => {
  const en = territories.en[code] ?? code;
  const ka = territories.ka[code] ?? en;
  const ru = territories.ru[code] ?? en;
  return `  ${code}: { en: ${JSON.stringify(en)}, ka: ${JSON.stringify(ka)}, ru: ${JSON.stringify(ru)} },`;
});

const output = `// Generated from CLDR (en, ka, ru) for the country codes libphonenumber-js returns.
// Regenerate with \`node scripts/generate-country-names.mjs\` when countries or translations change.
export interface CountryNames {
  en: string;
  ka: string;
  ru: string;
}

export const COUNTRY_NAMES: Record<string, CountryNames> = {
${lines.join('\n')}
};
`;

await writeFile(new URL('../src/app/utils/country-names-data.ts', import.meta.url), output, 'utf8');
console.log(`Wrote ${codes.length} countries.`);
