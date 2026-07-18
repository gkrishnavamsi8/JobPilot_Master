import { stripCountryCodeFromPhone, formatPhoneForField } from '../shared/dist/phone-utils.js';
import {
  findBestMatchingOption,
  textMatchesOption,
  containsWholeWord,
} from '../scraper/dist/fill-engine/dom-utils.js';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.document = dom.window.document;

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  OK: ${name}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${name}`);
    failed += 1;
  }
}

console.log('\n=== Phone strip ===');
assert(
  'strips +91 from Indian number',
  stripCountryCodeFromPhone('+91-7780150531', 'India') === '7780150531'
);
assert(
  'strips +1 from US number',
  stripCountryCodeFromPhone('+1-555-010-9988', 'United States') === '5550109988'
);
assert(
  'formatPhoneForField uses address country',
  formatPhoneForField('+91-7780150531', {
    profile: { phone: { number: '+91-7780150531' }, address: { country: 'India' } },
  }) === '7780150531'
);

console.log('\n=== Country option matching ===');
const fakeOptions = [
  'British Indian Ocean Territory (+246)',
  'India (+91)',
  'Indonesia (+62)',
].map((text) => {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
});

assert(
  'India does not match British Indian Ocean Territory',
  !textMatchesOption('British Indian Ocean Territory (+246)', 'India')
);
assert('India matches India (+91)', textMatchesOption('India (+91)', 'India'));
assert(
  'findBestMatchingOption picks India',
  findBestMatchingOption(fakeOptions, 'India')?.textContent === 'India (+91)'
);
assert(
  'India is not a whole word in British Indian Ocean Territory',
  !containsWholeWord('British Indian Ocean Territory', 'India')
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
