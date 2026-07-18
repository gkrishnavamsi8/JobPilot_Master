(() => {
  // shared/dist/utils.js
  function getValueAtPath(data, path) {
    if (!path)
      return void 0;
    const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    let current = data;
    for (const segment of segments) {
      if (current == null || typeof current !== "object") {
        return void 0;
      }
      current = current[segment];
    }
    return current;
  }
  function isEmptyValue(value) {
    if (value == null)
      return true;
    if (typeof value === "string")
      return value.trim() === "";
    if (Array.isArray(value))
      return value.length === 0;
    return false;
  }
  function normalizeText(value) {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }
  function matchesAutomationId(automationId, pattern) {
    const normalized = automationId.toLowerCase();
    if (pattern instanceof RegExp) {
      return pattern.test(normalized);
    }
    return normalized.includes(pattern.toLowerCase());
  }

  // scraper/src/adapters/universal/label-utils.ts
  function normalizeLabelText(text) {
    return normalizeText(text).replace(/\*/g, "").replace(/\(required\)/g, "").replace(/\s+/g, " ").trim();
  }
  function findMappingByLabel(labelText, mappings) {
    const normalized = normalizeLabelText(labelText);
    if (!normalized) return void 0;
    let best;
    for (const mapping of mappings) {
      if (!mapping.labelSynonyms?.length) continue;
      for (const synonym of mapping.labelSynonyms) {
        const s = normalizeLabelText(synonym);
        if (!s) continue;
        let score = 0;
        if (normalized === s) score = 100 + s.length;
        else if (normalized.startsWith(s)) score = 60 + s.length;
        else if (normalized.includes(s)) score = 20 + s.length;
        if (score > 0 && (!best || score > best.score)) {
          best = { mapping, score };
        }
      }
    }
    return best?.mapping;
  }
  function matchesPattern(value, pattern) {
    if (!pattern || !value) return false;
    if (pattern instanceof RegExp) return pattern.test(value);
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  function findMappingByAttributes(element, mappings) {
    const name = element.getAttribute("name") ?? "";
    const id = element.getAttribute("id") ?? "";
    const ariaLabel = element.getAttribute("aria-label") ?? "";
    const placeholder = element.getAttribute("placeholder") ?? "";
    const autocomplete = element.getAttribute("autocomplete") ?? "";
    let best;
    for (const mapping of mappings) {
      let score = 0;
      if (matchesPattern(name, mapping.namePattern)) score += 40;
      if (matchesPattern(id, mapping.idPattern)) score += 35;
      if (matchesPattern(name, mapping.automationIdPattern)) score += 30;
      if (matchesPattern(id, mapping.automationIdPattern)) score += 25;
      if (mapping.labelSynonyms?.some((s) => matchesPattern(ariaLabel, s))) score += 25;
      if (mapping.labelSynonyms?.some((s) => matchesPattern(placeholder, s))) score += 15;
      if (matchesPattern(autocomplete, mapping.namePattern)) score += 20;
      if (mapping.jsonPath === "profile.phone.number" && /country.*code|phone.*country|phone_country/i.test(`${name} ${id} ${ariaLabel}`)) {
        continue;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { mapping, score };
      }
    }
    return best?.mapping;
  }
  function findBestMapping(hints, mappings) {
    let best;
    for (const hint of hints) {
      if (!hint.trim()) continue;
      const byLabel = findMappingByLabel(hint, mappings);
      if (byLabel) {
        const score = 50 + hint.length;
        if (!best || score > best.score) best = { mapping: byLabel, score };
      }
    }
    return best?.mapping;
  }

  // scraper/src/adapters/universal/label-resolver.ts
  function escapeCssIdent(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }
  var FIELD_CONTAINER_SELECTOR = '.field, .form-field, .application-field, .application-question, [class*="Field"], [class*="question"]';
  function isPlainTextInput(element) {
    if (element instanceof HTMLTextAreaElement) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    return ["text", "email", "tel", "number", "search", "url", ""].includes(element.type);
  }
  function collectFieldHints(element) {
    const hints = [];
    const doc = element.ownerDocument;
    const push = (value) => {
      const normalized = normalizeLabelText(value ?? "");
      if (normalized && !hints.includes(normalized)) hints.push(normalized);
    };
    push(element.getAttribute("aria-label"));
    push(element.getAttribute("placeholder"));
    push(element.getAttribute("name"));
    push(element.getAttribute("id"));
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy && doc) {
      for (const id of labelledBy.split(/\s+/)) {
        push(doc.getElementById(id)?.textContent);
      }
    }
    if (element.id && doc) {
      push(doc.querySelector(`label[for="${escapeCssIdent(element.id)}"]`)?.textContent);
    }
    const wrappingLabel = element.closest("label");
    if (wrappingLabel) push(wrappingLabel.textContent);
    const container = element.closest(FIELD_CONTAINER_SELECTOR);
    if (container) {
      const labelEl = container.querySelector(":scope > label, :scope > legend, :scope > .label");
      if (labelEl && !labelEl.contains(element)) {
        push(labelEl.textContent);
      }
    }
    return hints;
  }
  function resolveDropdownContainer(element) {
    if (element.getAttribute("role") === "combobox") {
      return element.closest('[class*="-container"]') ?? element;
    }
    return element.closest('[class*="-container"]') ?? element.closest(".select__container") ?? element.closest('[role="combobox"]') ?? element;
  }
  function inferFieldType(element, mapping) {
    if (element instanceof HTMLInputElement && element.type === "file") return "file";
    if (element instanceof HTMLInputElement && element.type === "checkbox") return "checkbox";
    if (element instanceof HTMLSelectElement) return "dropdown";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (isPlainTextInput(element)) {
      return mapping.fieldType === "textarea" ? "textarea" : "text";
    }
    if (mapping.fieldType === "dropdown") {
      if (element.getAttribute("role") === "combobox") return "dropdown";
      if (element.querySelector('[role="combobox"], [class*="-control"]')) return "dropdown";
      if (element.closest('[role="combobox"]')) return "dropdown";
    }
    return mapping.fieldType;
  }
  function setReactInputValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // shared/dist/phone-utils.js
  var COUNTRY_DIAL_CODES = {
    india: "91",
    "united states": "1",
    "united kingdom": "44",
    canada: "1",
    australia: "61",
    germany: "49",
    france: "33",
    singapore: "65",
    japan: "81",
    china: "86"
  };
  function digitsOnly(value) {
    return value.replace(/\D/g, "");
  }
  function dialCodeForCountry(country) {
    if (!country)
      return void 0;
    return COUNTRY_DIAL_CODES[normalizeText(country)];
  }
  function stripCountryCodeFromPhone(phoneNumber, country, explicitCountryCode) {
    const trimmed = phoneNumber.trim();
    if (!trimmed)
      return trimmed;
    const allDigits = digitsOnly(trimmed);
    if (!allDigits)
      return trimmed;
    let dialCode = explicitCountryCode != null ? digitsOnly(String(explicitCountryCode)) : void 0;
    if (!dialCode)
      dialCode = dialCodeForCountry(country ?? void 0);
    if (trimmed.startsWith("+") && dialCode && allDigits.startsWith(dialCode)) {
      const local = allDigits.slice(dialCode.length);
      if (local.length >= 6)
        return local;
    }
    if (trimmed.startsWith("+")) {
      const withoutPlus = trimmed.replace(/^\+\d{1,3}[-.\s]?/, "");
      const localDigits = digitsOnly(withoutPlus);
      if (localDigits.length >= 6)
        return localDigits;
    }
    return allDigits;
  }
  function formatPhoneForField(phoneNumber, candidateData) {
    const raw = String(phoneNumber ?? "").trim();
    if (!raw)
      return raw;
    const data = candidateData;
    const profile = data?.profile;
    const phone = profile?.phone;
    const address = profile?.address;
    return stripCountryCodeFromPhone(raw, address?.country, phone?.country_code);
  }

  // scraper/src/fill-engine/handlers/text.ts
  function getInputElement(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element;
    }
    const nested = element.querySelector("input, textarea");
    if (nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement) {
      return nested;
    }
    return null;
  }
  var textFillHandler = {
    fieldType: "text",
    canFill(element, mapping) {
      return mapping.fieldType === "text" || mapping.fieldType === "textarea";
    },
    async fill(element, value, mapping, context) {
      let strValue = String(value ?? "").trim();
      if (!strValue) {
        return {
          success: false,
          fieldType: mapping.fieldType,
          jsonPath: mapping.jsonPath,
          skipped: true,
          message: "Empty value"
        };
      }
      if (mapping.jsonPath === "profile.phone.number") {
        strValue = formatPhoneForField(strValue, context.candidateData);
      }
      const input = getInputElement(element);
      if (!input) {
        return {
          success: false,
          fieldType: mapping.fieldType,
          jsonPath: mapping.jsonPath,
          message: "No text input found"
        };
      }
      input.focus();
      setReactInputValue(input, strValue);
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      context.log(`Filled text field: ${mapping.jsonPath}`, strValue);
      return {
        success: true,
        fieldType: mapping.fieldType,
        automationId: element.getAttribute("data-automation-id") ?? void 0,
        jsonPath: mapping.jsonPath
      };
    }
  };
  var textareaFillHandler = {
    ...textFillHandler,
    fieldType: "textarea"
  };

  // scraper/src/fill-engine/dom-utils.ts
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function normalizeMatchText(value) {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function containsWholeWord(haystack, needle) {
    if (!needle) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(normalizeMatchText(needle))}\\b`, "i");
    return pattern.test(normalizeMatchText(haystack));
  }
  function textMatchesOption(optionText, desired) {
    const a = normalizeMatchText(optionText);
    const b = normalizeMatchText(String(desired));
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.startsWith(`${b} `) || a.startsWith(`${b}(`) || a.startsWith(`${b},`)) return true;
    return containsWholeWord(a, b);
  }
  function findBestMatchingOption(options, desired) {
    const desiredNorm = normalizeMatchText(desired);
    if (!desiredNorm) return void 0;
    let best;
    for (const opt of options) {
      const text = opt.textContent ?? "";
      const norm = normalizeMatchText(text);
      if (!norm) continue;
      let score = 0;
      if (norm === desiredNorm) score = 100;
      else if (norm.startsWith(`${desiredNorm} `) || norm.startsWith(`${desiredNorm}(`)) score = 90;
      else if (containsWholeWord(norm, desiredNorm)) score = 70;
      else if (desiredNorm.length >= 5 && norm.includes(desiredNorm)) score = 30;
      if (score > 0 && (!best || score > best.score)) {
        best = { element: opt, score };
      }
    }
    return best?.element;
  }
  async function waitFor(predicate, timeoutMs = 2e3, intervalMs = 50) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await sleep(intervalMs);
    }
    return false;
  }
  function dispatchMouseClick(element) {
    const opts = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent("mousedown", opts));
    element.dispatchEvent(new MouseEvent("mouseup", opts));
    element.dispatchEvent(new MouseEvent("click", opts));
  }
  function setNativeInputValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function waitForVisibleOptions(root) {
    const selectors = [
      '[role="listbox"] [role="option"]',
      '[role="listbox"] li',
      'ul[role="listbox"] > *',
      '.dropdown-options [role="option"]',
      ".dropdown-options li",
      '[data-automation-id*="option"]',
      '.select__menu [role="option"]',
      ".select__menu .select__option",
      '[class*="-menu"] [role="option"]',
      '[class*="-option"]',
      'div[role="option"]'
    ];
    await waitFor(() => {
      for (const selector of selectors) {
        const options = root.querySelectorAll(selector);
        if (options.length > 0) {
          for (const opt of options) {
            const el = opt;
            if (el.offsetParent !== null || el.getAttribute("aria-hidden") !== "true") {
              return true;
            }
          }
        }
      }
      return false;
    });
    for (const selector of selectors) {
      const options = Array.from(root.querySelectorAll(selector)).filter((opt) => {
        const el = opt;
        const text = el.textContent?.trim();
        return Boolean(text) && el.getAttribute("aria-disabled") !== "true";
      });
      if (options.length > 0) return options;
    }
    return [];
  }
  function findDropdownTrigger(container) {
    if (container instanceof HTMLSelectElement) return container;
    const candidates = [
      container.matches('[class*="-control"], .select__control, [role="combobox"], button, input') ? container : null,
      container.querySelector('[class*="-control"]'),
      container.querySelector(".select__control"),
      container.querySelector('[role="combobox"]'),
      container.querySelector("button[aria-haspopup]"),
      container.querySelector("input"),
      container.querySelector("button")
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement) return candidate;
    }
    return null;
  }
  function findMultiselectInput(container) {
    if (container instanceof HTMLInputElement) return container;
    const input = container.querySelector(
      'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])'
    );
    return input instanceof HTMLInputElement ? input : null;
  }
  function findAddButton(section, pattern) {
    const patternLower = pattern?.toLowerCase() ?? "add";
    const candidates = section.querySelectorAll(
      'button, [role="button"], [data-automation-id]'
    );
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const automationId = candidate.getAttribute("data-automation-id")?.toLowerCase() ?? "";
      const text = candidate.textContent?.toLowerCase() ?? "";
      if (automationId.includes(patternLower) || text.includes("add another") || text.includes("add row") || text === "add" || text.includes("+")) {
        return candidate;
      }
    }
    return null;
  }
  function findEntryContainers(section) {
    const explicit = section.querySelectorAll('[data-automation-id*="Entry"], [data-entry-index]');
    if (explicit.length > 0) return Array.from(explicit);
    const panels = section.querySelectorAll('[data-automation-id*="panel"], .repeatable-entry');
    if (panels.length > 0) return Array.from(panels);
    const fieldGroups = section.querySelectorAll(":scope > .entry, :scope > .field-group");
    return Array.from(fieldGroups);
  }

  // scraper/src/fill-engine/handlers/dropdown.ts
  async function fillNativeSelect(select, value, mapping, context) {
    const desired = normalizeMatchText(value);
    const optionElements = Array.from(select.options);
    let matched;
    const matchedEl = findBestMatchingOption(optionElements, desired);
    if (matchedEl instanceof HTMLOptionElement) matched = matchedEl;
    if (!matched) {
      for (const option of optionElements) {
        if (normalizeMatchText(option.value) === desired) {
          matched = option;
          break;
        }
      }
    }
    if (!matched) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: `No option matching "${value}"`
      };
    }
    select.value = matched.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    context.log(`Filled native select: ${mapping.jsonPath}`, matched.textContent);
    return {
      success: true,
      fieldType: "dropdown",
      jsonPath: mapping.jsonPath,
      automationId: select.getAttribute("data-automation-id") ?? void 0
    };
  }
  async function fillReactSelect(container, value, mapping, context) {
    const control = findDropdownTrigger(container);
    if (!control) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: "React-select control not found"
      };
    }
    dispatchMouseClick(control);
    await sleep(250);
    const input = container.querySelector('input[type="text"], input:not([type="hidden"])') ?? container.ownerDocument?.activeElement;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(400);
    }
    const searchRoot = container.ownerDocument?.body ?? container;
    const options = await waitForVisibleOptions(searchRoot);
    const match = findBestMatchingOption(options, value);
    if (!match) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: `No react-select option matching "${value}"`
      };
    }
    dispatchMouseClick(match);
    await sleep(100);
    context.log(`Filled react-select: ${mapping.jsonPath}`, value);
    return {
      success: true,
      fieldType: "dropdown",
      jsonPath: mapping.jsonPath,
      automationId: container.getAttribute("id") ?? void 0
    };
  }
  async function fillCustomDropdown(container, value, mapping, context) {
    const trigger = findDropdownTrigger(container);
    if (!trigger) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: "Dropdown trigger not found"
      };
    }
    dispatchMouseClick(trigger);
    await sleep(150);
    const searchRoot = container.ownerDocument?.body ?? container;
    const options = await waitForVisibleOptions(searchRoot);
    if (options.length === 0) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: "Dropdown options did not appear"
      };
    }
    const match = findBestMatchingOption(options, value);
    if (!match) {
      return {
        success: false,
        fieldType: "dropdown",
        jsonPath: mapping.jsonPath,
        message: `No dropdown option matching "${value}"`
      };
    }
    dispatchMouseClick(match);
    await sleep(100);
    context.log(`Filled custom dropdown: ${mapping.jsonPath}`, value);
    return {
      success: true,
      fieldType: "dropdown",
      jsonPath: mapping.jsonPath,
      automationId: container.getAttribute("data-automation-id") ?? void 0
    };
  }
  var dropdownFillHandler = {
    fieldType: "dropdown",
    canFill(_element, mapping) {
      return mapping.fieldType === "dropdown";
    },
    async fill(element, value, mapping, context) {
      if (element instanceof HTMLInputElement && ["text", "email", "tel", "number", "search"].includes(element.type)) {
        return {
          success: false,
          fieldType: "dropdown",
          jsonPath: mapping.jsonPath,
          skipped: true,
          message: "Element is a plain text input, not a dropdown"
        };
      }
      const strValue = String(value ?? "").trim();
      if (!strValue) {
        return {
          success: false,
          fieldType: "dropdown",
          jsonPath: mapping.jsonPath,
          skipped: true,
          message: "Empty value"
        };
      }
      const select = element instanceof HTMLSelectElement ? element : element.querySelector("select");
      if (select instanceof HTMLSelectElement) {
        return fillNativeSelect(select, strValue, mapping, context);
      }
      if (element.querySelector('[class*="-control"], [class*="-container"]') || element.classList.toString().includes("-control") || element.closest('[class*="-container"]') || element.closest(".select__container")) {
        const reactRoot = element.closest('[class*="-container"]') ?? element.closest(".select__container") ?? element;
        return fillReactSelect(reactRoot, strValue, mapping, context);
      }
      return fillCustomDropdown(element, strValue, mapping, context);
    }
  };

  // scraper/src/fill-engine/handlers/checkbox.ts
  var checkboxFillHandler = {
    fieldType: "checkbox",
    canFill(_element, mapping) {
      return mapping.fieldType === "checkbox";
    },
    async fill(element, value, mapping, context) {
      const shouldCheck = Boolean(value);
      const input = element instanceof HTMLInputElement && element.type === "checkbox" ? element : element.querySelector('input[type="checkbox"]');
      if (input instanceof HTMLInputElement) {
        if (input.checked !== shouldCheck) {
          input.click();
        }
        context.log(`Set checkbox: ${mapping.jsonPath}`, shouldCheck);
        return {
          success: true,
          fieldType: "checkbox",
          jsonPath: mapping.jsonPath
        };
      }
      if (element.getAttribute("role") === "checkbox") {
        const isChecked = element.getAttribute("aria-checked") === "true";
        if (isChecked !== shouldCheck) {
          element.click();
        }
        return {
          success: true,
          fieldType: "checkbox",
          jsonPath: mapping.jsonPath
        };
      }
      return {
        success: false,
        fieldType: "checkbox",
        jsonPath: mapping.jsonPath,
        message: "Checkbox element not found"
      };
    }
  };

  // scraper/src/fill-engine/handlers/multiselect.ts
  async function addMultiselectTag(container, tag, context) {
    const input = findMultiselectInput(container);
    if (!input) return false;
    setNativeInputValue(input, tag);
    await sleep(200);
    const searchRoot = container.ownerDocument?.body ?? container;
    const options = await waitForVisibleOptions(searchRoot);
    const match = options.find((opt) => textMatchesOption(opt.textContent ?? "", tag));
    if (match) {
      dispatchMouseClick(match);
      await sleep(150);
      context.log("Multiselect suggestion selected", tag);
      return true;
    }
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", bubbles: true, cancelable: true })
    );
    await sleep(150);
    context.log("Multiselect Enter fallback", tag);
    return true;
  }
  var multiselectFillHandler = {
    fieldType: "multiselect",
    canFill(_element, mapping) {
      return mapping.fieldType === "multiselect";
    },
    async fill(element, value, mapping, context) {
      const items = Array.isArray(value) ? value.map(String) : [];
      if (items.length === 0) {
        return {
          success: false,
          fieldType: "multiselect",
          jsonPath: mapping.jsonPath,
          skipped: true,
          message: "No items to add"
        };
      }
      let added = 0;
      for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const existingTags = Array.from(
          element.querySelectorAll('[data-tag], .tag, .pill, [role="option"][aria-selected="true"]')
        ).map((el) => normalizeMatchText(el.textContent ?? ""));
        if (existingTags.some((tag) => textMatchesOption(tag, trimmed))) {
          added += 1;
          continue;
        }
        const ok = await addMultiselectTag(element, trimmed, context);
        if (ok) added += 1;
      }
      if (added === 0) {
        return {
          success: false,
          fieldType: "multiselect",
          jsonPath: mapping.jsonPath,
          message: "Could not add multiselect items"
        };
      }
      return {
        success: true,
        fieldType: "multiselect",
        jsonPath: mapping.jsonPath,
        automationId: element.getAttribute("data-automation-id") ?? void 0,
        message: `Added ${added}/${items.length} items`
      };
    }
  };

  // scraper/src/fill-engine/handlers/file.ts
  var fileFillHandler = {
    fieldType: "file",
    canFill(_element, mapping) {
      return mapping.fieldType === "file";
    },
    async fill(element, _value, mapping, context) {
      const fileInput = element instanceof HTMLInputElement && element.type === "file" ? element : element.querySelector('input[type="file"]');
      const target = fileInput ?? element;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("jobpilot-highlight-resume");
      context.log(`Resume upload requires manual action: ${mapping.jsonPath}`);
      return {
        success: false,
        fieldType: "file",
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: "File upload must be done manually (browser security)"
      };
    }
  };

  // scraper/src/fill-engine/handlers/repeatable.ts
  async function fillChildFields(container, entryData, children, context) {
    const results = [];
    for (const childMapping of children) {
      const value = getValueAtPath(entryData, childMapping.jsonPath);
      if (value == null || value === "") continue;
      const nodes = container.querySelectorAll("[data-automation-id]");
      let target = null;
      for (const node of nodes) {
        const automationId = node.getAttribute("data-automation-id");
        if (!automationId) continue;
        if (!automationId || !childMapping.automationIdPattern) continue;
        if (!matchesAutomationId(automationId, childMapping.automationIdPattern)) continue;
        target = node.matches('input, textarea, select, [role="combobox"], [role="textbox"]') ? node : node.querySelector('input, textarea, select, [role="combobox"], [role="textbox"]') ?? node;
        break;
      }
      if (!target) {
        results.push({
          success: false,
          fieldType: childMapping.fieldType,
          jsonPath: childMapping.jsonPath,
          skipped: true,
          message: "Child field not found in entry container"
        });
        continue;
      }
      const handler = getHandlerForMapping(childMapping);
      if (!handler) {
        results.push({
          success: false,
          fieldType: childMapping.fieldType,
          jsonPath: childMapping.jsonPath,
          message: `No handler for ${childMapping.fieldType}`
        });
        continue;
      }
      const result = await handler.fill(target, value, childMapping, context);
      results.push(result);
      await sleep(80);
    }
    return results;
  }
  var repeatableFillHandler = {
    fieldType: "repeatable",
    canFill(_element, mapping) {
      return mapping.fieldType === "repeatable";
    },
    async fill(element, value, mapping, context) {
      const entries = Array.isArray(value) ? value : [];
      const children = mapping.children ?? [];
      if (entries.length === 0) {
        return {
          success: false,
          fieldType: "repeatable",
          jsonPath: mapping.jsonPath,
          skipped: true,
          message: "No entries in data"
        };
      }
      if (children.length === 0) {
        return {
          success: false,
          fieldType: "repeatable",
          jsonPath: mapping.jsonPath,
          message: "Repeatable mapping has no child field definitions"
        };
      }
      const section = element.getAttribute("data-automation-id") && /section|experience|education/i.test(element.getAttribute("data-automation-id") ?? "") ? element : element.closest('[data-automation-id*="Section"], [data-automation-id*="section"]') ?? element;
      let containers = findEntryContainers(section);
      const addButton = findAddButton(section, mapping.addButtonPattern);
      while (containers.length < entries.length && addButton) {
        dispatchMouseClick(addButton);
        await sleep(250);
        containers = findEntryContainers(section);
      }
      if (containers.length === 0) {
        containers = [section];
      }
      let filledCount = 0;
      let failedCount = 0;
      for (let i = 0; i < entries.length; i += 1) {
        const entryData = entries[i];
        const container = containers[i] ?? containers[containers.length - 1];
        const childResults = await fillChildFields(container, entryData, children, context);
        filledCount += childResults.filter((r) => r.success).length;
        failedCount += childResults.filter((r) => !r.success && !r.skipped).length;
      }
      context.log(`Repeatable section ${mapping.jsonPath}`, { filledCount, failedCount });
      return {
        success: filledCount > 0,
        fieldType: "repeatable",
        jsonPath: mapping.jsonPath,
        automationId: section.getAttribute("data-automation-id") ?? void 0,
        message: `Filled ${filledCount} sub-fields across ${entries.length} entries`
      };
    }
  };

  // scraper/src/fill-engine/handlers/registry.ts
  var handlers = [
    textFillHandler,
    textareaFillHandler,
    dropdownFillHandler,
    checkboxFillHandler,
    multiselectFillHandler,
    fileFillHandler,
    repeatableFillHandler
  ];
  function getHandlerForMapping(mapping) {
    return handlers.find((handler) => handler.fieldType === mapping.fieldType);
  }

  // scraper/src/adapters/universal/mappings.ts
  var UNIVERSAL_FIELD_MAPPINGS = [
    {
      labelSynonyms: ["first name", "given name", "legal first name"],
      namePattern: /first[_\[\].-]?name|given/i,
      idPattern: /first[_-]?name|given/i,
      automationIdPattern: /first.?name/i,
      jsonPath: "profile.first_name",
      fieldType: "text"
    },
    {
      labelSynonyms: ["last name", "family name", "surname", "legal last name"],
      namePattern: /last[_\[\].-]?name|family|surname/i,
      idPattern: /last[_-]?name|family|surname/i,
      automationIdPattern: /last.?name/i,
      jsonPath: "profile.last_name",
      fieldType: "text"
    },
    {
      labelSynonyms: ["email", "email address", "contact email"],
      namePattern: /email/i,
      idPattern: /^email$/i,
      automationIdPattern: "email",
      jsonPath: "profile.email",
      fieldType: "text"
    },
    {
      labelSynonyms: ["phone number", "phone"],
      namePattern: /(?:^|\[)(?:phone[_-]?number|phone)(?:\]|$)/i,
      idPattern: /^phone(?:[_-]?number)?$/i,
      jsonPath: "profile.phone.number",
      fieldType: "text"
    },
    {
      labelSynonyms: ["country phone code", "phone country code", "country code"],
      namePattern: /country.*phone.*code|phone.*country.*code|phone_country|country_phone/i,
      idPattern: /country.*phone.*code|phone.*country.*code/i,
      jsonPath: "profile.address.country",
      fieldType: "dropdown"
    },
    {
      labelSynonyms: ["country"],
      namePattern: /(?:^|\[)country(?:\]|$)|^country$/i,
      idPattern: /^country$/i,
      automationIdPattern: /^country$/i,
      jsonPath: "profile.address.country",
      fieldType: "dropdown"
    },
    {
      labelSynonyms: ["city", "town"],
      namePattern: /city|town/i,
      idPattern: /city|town/i,
      automationIdPattern: /city/i,
      jsonPath: "profile.address.city",
      fieldType: "text"
    },
    {
      labelSynonyms: ["state", "province", "region"],
      namePattern: /state|province|region/i,
      idPattern: /state|province|region/i,
      automationIdPattern: /state/i,
      jsonPath: "profile.address.state",
      fieldType: "text"
    },
    {
      labelSynonyms: ["postal code", "zip", "zip code", "pin code"],
      namePattern: /postal|zip|pin/i,
      idPattern: /postal|zip|pin/i,
      automationIdPattern: /postal|zip/i,
      jsonPath: "profile.address.postal_code",
      fieldType: "text"
    },
    {
      labelSynonyms: ["address line 1", "street address", "address", "home address"],
      namePattern: /address|street|line1/i,
      idPattern: /address|street|line1/i,
      automationIdPattern: /address.*line1|street/i,
      jsonPath: "profile.address.line1",
      fieldType: "text"
    },
    {
      labelSynonyms: ["address line 2", "apt", "suite", "unit"],
      namePattern: /line2|apt|suite|unit/i,
      idPattern: /line2|apt|suite|unit/i,
      jsonPath: "profile.address.line2",
      fieldType: "text"
    },
    {
      labelSynonyms: ["linkedin profile", "linkedin", "linkedin url"],
      namePattern: /linkedin/i,
      idPattern: /linkedin/i,
      automationIdPattern: /linkedin/i,
      jsonPath: "profile.social.linkedin",
      fieldType: "text"
    },
    {
      labelSynonyms: ["website", "personal website", "portfolio"],
      namePattern: /website|portfolio|url/i,
      idPattern: /website|portfolio/i,
      automationIdPattern: /website|portfolio/i,
      jsonPath: "profile.social.website",
      fieldType: "text"
    },
    {
      labelSynonyms: ["github"],
      namePattern: /github/i,
      jsonPath: "profile.social.github",
      fieldType: "text"
    },
    {
      labelSynonyms: ["summary", "about you", "professional summary"],
      namePattern: /summary|about/i,
      idPattern: /summary|about/i,
      automationIdPattern: /summary|about/i,
      jsonPath: "profile.summary",
      fieldType: "textarea"
    },
    {
      labelSynonyms: ["cover letter"],
      namePattern: /cover[_\[\].-]?letter/i,
      jsonPath: "cover_letter",
      fieldType: "textarea"
    },
    {
      labelSynonyms: ["skills", "skill"],
      namePattern: /skill/i,
      automationIdPattern: /skill/i,
      jsonPath: "profile.skills",
      fieldType: "multiselect"
    },
    {
      labelSynonyms: ["years of experience"],
      namePattern: /years.*experience|experience.*years/i,
      jsonPath: "preferences.years_of_experience",
      fieldType: "text"
    },
    {
      labelSynonyms: ["desired salary", "salary", "compensation"],
      namePattern: /salary|compensation/i,
      jsonPath: "preferences.desired_salary",
      fieldType: "text"
    },
    {
      labelSynonyms: ["current company", "company", "employer"],
      namePattern: /company|employer/i,
      jsonPath: "work_experience[0].company",
      fieldType: "text"
    },
    {
      labelSynonyms: ["current title", "job title"],
      namePattern: /job[_\[\].-]?title|current_title/i,
      jsonPath: "work_experience[0].title",
      fieldType: "text"
    },
    {
      labelSynonyms: ["resume", "resume/cv", "cv", "upload resume"],
      namePattern: /resume|cv/i,
      idPattern: /resume|cv/i,
      automationIdPattern: /resume|cv/i,
      jsonPath: "resume_filename",
      fieldType: "file"
    },
    {
      labelSynonyms: ["i agree", "terms", "privacy policy", "confidential information"],
      namePattern: /agree|consent|privacy|terms/i,
      jsonPath: "legal.terms_accepted",
      fieldType: "checkbox"
    }
  ];

  // scraper/src/adapters/universal/scanner.ts
  var INPUT_SELECTOR = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';
  var FILE_SELECTOR = 'input[type="file"]';
  function isVisible(element) {
    if (element instanceof HTMLInputElement && element.type === "hidden") return false;
    if (!(element instanceof HTMLElement)) return true;
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    return true;
  }
  function resolveFillElement(element, fieldType) {
    if (fieldType === "file") {
      if (element instanceof HTMLInputElement && element.type === "file") return element;
      return element.querySelector(FILE_SELECTOR);
    }
    if (fieldType === "dropdown") {
      if (isPlainTextInput(element)) return null;
      if (element instanceof HTMLSelectElement) return element;
      if (element.getAttribute("role") === "combobox") return resolveDropdownContainer(element);
      const combo = element.closest('[role="combobox"]');
      if (combo) return resolveDropdownContainer(combo);
      const container = element.closest('[class*="-container"], .select__container');
      if (container && !container.querySelector('input[type="text"]#first_name, input[id="first_name"]')) {
        return container;
      }
      return element.getAttribute("role") === "combobox" ? element : null;
    }
    if (fieldType === "checkbox") {
      if (element instanceof HTMLInputElement && element.type === "checkbox") return element;
      return element.querySelector('input[type="checkbox"]') ?? element;
    }
    if (element.matches(INPUT_SELECTOR)) return element;
    return element.querySelector(INPUT_SELECTOR);
  }
  function addScannedField(results, seen, element, mapping, candidateData, key) {
    const fieldType = inferFieldType(element, mapping);
    const resolvedMapping = { ...mapping, fieldType };
    const target = resolveFillElement(element, fieldType);
    if (!target || seen.has(target)) return;
    const value = getValueAtPath(candidateData, mapping.jsonPath);
    if (isEmptyValue(value) && fieldType !== "file" && fieldType !== "checkbox") return;
    seen.add(target);
    results.push({ element: target, automationId: key, mapping: resolvedMapping, value });
  }
  function matchLabelAssociations(root, candidateData, mappings, seen, results) {
    const doc = "nodeType" in root && root.nodeType === 9 ? root : root.ownerDocument;
    if (!doc) return;
    for (const label of root.querySelectorAll("label[for]")) {
      const forId = label.getAttribute("for");
      if (!forId) continue;
      const target = doc.getElementById(forId);
      if (!target || !isVisible(target)) continue;
      const mapping = findMappingByLabel(label.textContent ?? "", mappings);
      if (!mapping) continue;
      addScannedField(
        results,
        seen,
        target,
        mapping,
        candidateData,
        normalizeLabelText(label.textContent ?? forId)
      );
    }
  }
  function matchElement(element, candidateData, mappings, seen, results) {
    if (!isVisible(element)) return;
    const hints = collectFieldHints(element);
    const mapping = findMappingByAttributes(element, mappings) ?? findBestMapping(hints, mappings);
    if (!mapping) return;
    addScannedField(
      results,
      seen,
      element,
      mapping,
      candidateData,
      hints[0] || element.getAttribute("name") || element.getAttribute("id") || "field"
    );
  }
  function matchComboboxes(root, candidateData, mappings, seen, results) {
    for (const combo of root.querySelectorAll('[role="combobox"]')) {
      if (seen.has(combo)) continue;
      const hints = collectFieldHints(combo);
      const mapping = findBestMapping(hints, mappings) ?? findMappingByAttributes(combo, mappings);
      if (!mapping || mapping.fieldType !== "dropdown") continue;
      addScannedField(results, seen, combo, mapping, candidateData, hints[0] || "combobox");
    }
  }
  function scanUniversalFields(root, candidateData, mappings = UNIVERSAL_FIELD_MAPPINGS) {
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of root.querySelectorAll("[data-automation-id]")) {
      const automationId = node.getAttribute("data-automation-id");
      if (!automationId) continue;
      let best;
      let bestScore = 0;
      for (const mapping of mappings) {
        if (!mapping.automationIdPattern) continue;
        if (!matchesAutomationId(automationId, mapping.automationIdPattern)) continue;
        const score = 20 + String(mapping.automationIdPattern).length;
        if (score > bestScore) {
          best = mapping;
          bestScore = score;
        }
      }
      if (best) {
        addScannedField(results, seen, node, best, candidateData, automationId);
      }
    }
    matchLabelAssociations(root, candidateData, mappings, seen, results);
    for (const element of root.querySelectorAll(INPUT_SELECTOR)) {
      matchElement(element, candidateData, mappings, seen, results);
    }
    for (const element of root.querySelectorAll(FILE_SELECTOR)) {
      matchElement(element, candidateData, mappings, seen, results);
    }
    matchComboboxes(root, candidateData, mappings, seen, results);
    return results;
  }

  // scraper/src/adapters/platform.ts
  function getPlatformConfig(_hostname) {
    return {
      mappings: UNIVERSAL_FIELD_MAPPINGS,
      scanFields: scanUniversalFields
    };
  }
  function scanWithFallback(root, candidateData, config) {
    return config.scanFields(root, candidateData, config.mappings);
  }

  // scraper/src/fill-engine/index.ts
  async function runFillEngine(document2, candidateData, options = {}) {
    const hostname = options.hostname ?? document2.defaultView?.location.hostname ?? "";
    const config = getPlatformConfig(hostname);
    if (options.mappings) {
      config.mappings = options.mappings;
    }
    const log = options.onLog ?? (() => void 0);
    const context = { candidateData, document: document2, log };
    const summary = { filled: [], skipped: [], failed: [] };
    log(`Scanning page (${hostname || "unknown host"})`);
    let scanned = scanWithFallback(document2, candidateData, config);
    const fillOrder = {
      text: 0,
      textarea: 1,
      dropdown: 2,
      multiselect: 3,
      checkbox: 4,
      repeatable: 5,
      file: 6
    };
    scanned.sort(
      (a, b) => (fillOrder[a.mapping.fieldType] ?? 9) - (fillOrder[b.mapping.fieldType] ?? 9)
    );
    const repeatable = scanned.filter((f) => f.mapping.fieldType === "repeatable");
    const flat = scanned.filter((f) => f.mapping.fieldType !== "repeatable");
    scanned = [...repeatable, ...flat];
    log(`Found ${scanned.length} mappable fields`, scanned.map((s) => s.mapping.jsonPath));
    for (const field of scanned) {
      const handler = getHandlerForMapping(field.mapping);
      if (!handler) {
        summary.failed.push({
          success: false,
          fieldType: field.mapping.fieldType,
          jsonPath: field.mapping.jsonPath,
          message: `No handler for field type: ${field.mapping.fieldType}`
        });
        continue;
      }
      try {
        const result = await handler.fill(
          field.element,
          field.value,
          field.mapping,
          context
        );
        if (result.success) {
          summary.filled.push(result);
        } else if (result.skipped) {
          summary.skipped.push(result);
        } else {
          summary.failed.push(result);
        }
      } catch (error) {
        summary.failed.push({
          success: false,
          fieldType: field.mapping.fieldType,
          jsonPath: field.mapping.jsonPath,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    log("Fill run complete", summary);
    return summary;
  }

  // extension/src/content.ts
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return false;
    }
    if (message?.type !== "AUTOFILL") {
      return false;
    }
    (async () => {
      try {
        const summary = await runFillEngine(document, message.candidateData, {
          onLog: (msg, detail) => console.log("[JobPilot]", msg, detail ?? "")
        });
        sendResponse({ ok: true, summary });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })();
    return true;
  });
  console.log("[JobPilot] Content script ready on", window.location.hostname);
})();
//# sourceMappingURL=content.js.map
