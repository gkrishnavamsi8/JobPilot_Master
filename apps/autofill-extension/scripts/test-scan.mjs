import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const html = readFileSync(join(root, 'test/greenhouse-mock.html'), 'utf8');
const data = JSON.parse(readFileSync(join(root, 'test/fixtures/krishna-profile.json'), 'utf8'));

const dom = new JSDOM(html, { url: 'https://job-boards.greenhouse.io/zscaler/jobs/test' });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.HTMLSelectElement = window.HTMLSelectElement;
globalThis.CSS = window.CSS;

const { scanUniversalFields } = await import('../scraper/dist/adapters/universal/scanner.js');

const scanned = scanUniversalFields(window.document, data);
console.log('\n=== Scanned fields ===');
for (const field of scanned) {
  console.log(`  ${field.mapping.jsonPath} → ${field.mapping.fieldType} (${field.automationId})`);
}

const expected = [
  'profile.first_name',
  'profile.last_name',
  'profile.email',
  'profile.address.country',
  'profile.phone.number',
  'profile.social.website',
  'profile.social.linkedin',
];

const found = scanned.map((s) => s.mapping.jsonPath);
const missing = expected.filter((p) => !found.includes(p));
const firstName = scanned.find((s) => s.mapping.jsonPath === 'profile.first_name');

console.log('\n=== Validation ===');
console.log(`Found ${scanned.length} fields`);
if (missing.length) console.log('MISSING:', missing.join(', '));
else console.log('All expected fields found');
if (firstName?.mapping.fieldType === 'dropdown') console.log('FAIL: first_name classified as dropdown');
else console.log('OK: first_name is text');

process.exit(missing.length || firstName?.mapping.fieldType === 'dropdown' ? 1 : 0);
