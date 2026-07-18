/** Small async delay for DOM updates after clicks/typing. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `needle` appears as a whole word in `haystack`. */
export function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(normalizeMatchText(needle))}\\b`, 'i');
  return pattern.test(normalizeMatchText(haystack));
}

/**
 * Match dropdown option text — avoids "India" matching "British Indian Ocean Territory".
 */
export function textMatchesOption(optionText: string, desired: string): boolean {
  const a = normalizeMatchText(optionText);
  const b = normalizeMatchText(String(desired));
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b} `) || a.startsWith(`${b}(`) || a.startsWith(`${b},`)) return true;
  return containsWholeWord(a, b);
}

/** Pick the best dropdown option for a desired label (e.g. country name). */
export function findBestMatchingOption(
  options: Element[],
  desired: string
): Element | undefined {
  return findBestMatchingOptionFromTerms(options, [desired]);
}

export function findBestMatchingOptionFromTerms(
  options: Element[],
  desiredTerms: string[],
): Element | undefined {
  for (const desired of desiredTerms) {
    const match = findBestMatchingOptionSingle(options, desired);
    if (match) return match;
  }
  return undefined;
}

function findBestMatchingOptionSingle(
  options: Element[],
  desired: string,
): Element | undefined {
  const desiredNorm = normalizeMatchText(desired);
  if (!desiredNorm) return undefined;

  let best: { element: Element; score: number } | undefined;

  for (const opt of options) {
    const text = opt.textContent ?? '';
    const norm = normalizeMatchText(text);
    if (!norm) continue;

    let score = 0;
    if (norm === desiredNorm) score = 100;
    else if (norm.startsWith(`${desiredNorm} `) || norm.startsWith(`${desiredNorm}(`)) score = 90;
    else if (containsWholeWord(norm, desiredNorm)) score = 70;
    else if (desiredNorm.startsWith('+') && norm.includes(desiredNorm)) score = 88;
    else if (desiredNorm.startsWith('(') && norm.includes(desiredNorm)) score = 88;
    else if (desiredNorm.length >= 5 && norm.includes(desiredNorm)) score = 30;

    if (score > 0 && (!best || score > best.score)) {
      best = { element: opt, score };
    }
  }

  return best?.element;
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 50
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

export function dispatchMouseClick(element: Element): void {
  const opts = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
}

export function setNativeInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function waitForVisibleOptions(
  root: Document | Element
): Promise<Element[]> {
  const selectors = [
    '[role="listbox"] [role="option"]',
    '[role="listbox"] li',
    'ul[role="listbox"] > *',
    '.dropdown-options [role="option"]',
    '.dropdown-options li',
    '[data-automation-id*="option"]',
    '.select__menu [role="option"]',
    '.select__menu .select__option',
    '[class*="-menu"] [role="option"]',
    '[class*="-option"]',
    'div[role="option"]',
  ];

  await waitFor(() => {
    for (const selector of selectors) {
      const options = root.querySelectorAll(selector);
      if (options.length > 0) {
        for (const opt of options) {
          const el = opt as HTMLElement;
          if (el.offsetParent !== null || el.getAttribute('aria-hidden') !== 'true') {
            return true;
          }
        }
      }
    }
    return false;
  });

  for (const selector of selectors) {
    const options = Array.from(root.querySelectorAll(selector)).filter((opt) => {
      const el = opt as HTMLElement;
      const text = el.textContent?.trim();
      return Boolean(text) && el.getAttribute('aria-disabled') !== 'true';
    });
    if (options.length > 0) return options;
  }

  return [];
}

export function findDropdownTrigger(container: Element): HTMLElement | null {
  if (container instanceof HTMLSelectElement) return container;

  const candidates = [
    container.matches('[class*="-control"], .select__control, [role="combobox"], button, input')
      ? container
      : null,
    container.querySelector('[class*="-control"]'),
    container.querySelector('.select__control'),
    container.querySelector('[role="combobox"]'),
    container.querySelector('button[aria-haspopup]'),
    container.querySelector('input'),
    container.querySelector('button'),
  ].filter(Boolean) as Element[];

  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement) return candidate;
  }
  return null;
}

export function findMultiselectInput(container: Element): HTMLInputElement | null {
  if (container instanceof HTMLInputElement) return container;
  const input = container.querySelector(
    'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])'
  );
  return input instanceof HTMLInputElement ? input : null;
}

export function findAddButton(section: Element, pattern?: string): HTMLElement | null {
  const patternLower = pattern?.toLowerCase() ?? 'add';
  const candidates = section.querySelectorAll(
    'button, [role="button"], [data-automation-id]'
  );

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) continue;
    const automationId = candidate.getAttribute('data-automation-id')?.toLowerCase() ?? '';
    const text = candidate.textContent?.toLowerCase() ?? '';
    if (
      automationId.includes(patternLower) ||
      text.includes('add another') ||
      text.includes('add row') ||
      text === 'add' ||
      text.includes('+')
    ) {
      return candidate;
    }
  }
  return null;
}

export function findEntryContainers(section: Element): Element[] {
  const explicit = section.querySelectorAll('[data-automation-id*="Entry"], [data-entry-index]');
  if (explicit.length > 0) return Array.from(explicit);

  const panels = section.querySelectorAll('[data-automation-id*="panel"], .repeatable-entry');
  if (panels.length > 0) return Array.from(panels);

  const fieldGroups = section.querySelectorAll(':scope > .entry, :scope > .field-group');
  return Array.from(fieldGroups);
}
