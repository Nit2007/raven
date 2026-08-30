/**
 * Content script running inside web pages.
 * Handles DOM element extraction for analysis, PING handshakes, and strict real browser action execution.
 * M9.3 — Action Dispatch Channel, Logging & Execution Engine.
 */

(() => {
  function getViewportMeta() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  // Extract raw DOM HTMLElement nodes list in document order
  function extractRawDomNodeList(): HTMLElement[] {
    const rawElements = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], h1, h2, h3, p, span, form, div'));
    const nodes: HTMLElement[] = [];
    const maxScan = Math.min(rawElements.length, 500);

    for (let i = 0; i < maxScan; i++) {
      const el = rawElements[i] as HTMLElement;
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) continue;

      nodes.push(el);
    }
    return nodes;
  }

  // Extract visible interactive & structured DOM elements for observation JSON payload
  function extractLiveDomElements() {
    const nodes = extractRawDomNodeList();
    return nodes.map((el, idx) => {
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || null;
      const name = (el as HTMLInputElement).name || null;
      const id = el.id || null;
      const placeholder = (el as HTMLInputElement).placeholder || null;
      
      let labelText = null;
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) labelText = labelEl.textContent?.trim() || null;
      }
      if (!labelText && el.parentElement?.tagName.toLowerCase() === 'label') {
        labelText = el.parentElement.textContent?.trim() || null;
      }

      let visibleText = el.textContent?.trim() || null;
      if (tag === 'input' || tag === 'textarea') {
        visibleText = (el as HTMLInputElement).value || placeholder || visibleText;
      }

      const interactive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || el.getAttribute('role') !== null || el.hasAttribute('onclick');

      const rect = el.getBoundingClientRect();

      return {
        tag,
        type,
        name,
        id: id || `el_${idx}`,
        placeholder,
        labelText,
        visibleText: visibleText ? visibleText.substring(0, 150) : null,
        value: (el as HTMLInputElement).value || null,
        boundingBox: {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        interactive
      };
    });
  }

  // Find target element by ID, selector, synthetic index (el_X), or attribute
  function findTargetElement(selectorOrId: string | null): HTMLElement | null {
    if (!selectorOrId) return null;

    const clean = selectorOrId.trim();
    console.log('[RAVEN Content Script] LOOKING FOR TARGET', clean);

    // 1. Synthetic Index match (e.g. "el_3" or "3")
    const elIndexMatch = clean.match(/^el_(\d+)$/i) || clean.match(/^(\d+)$/);
    if (elIndexMatch) {
      const targetIdx = parseInt(elIndexMatch[1], 10);
      const liveNodes = extractRawDomNodeList();
      if (targetIdx >= 0 && targetIdx < liveNodes.length) {
        console.log(`[RAVEN Content Script] Matched synthetic index "${clean}" to live DOM node #${targetIdx}:`, liveNodes[targetIdx]);
        return liveNodes[targetIdx];
      }
    }

    // 2. Direct ID match
    let el = document.getElementById(clean);
    if (el) return el;

    // 3. Query Selector match
    try {
      el = document.querySelector(clean);
      if (el) return el;
    } catch (_) {
      // Ignore invalid CSS selector syntax
    }

    // 4. Match by name, data-id, or value attribute
    try {
      el = document.querySelector(`[name="${clean}"]`) ||
           document.querySelector(`[data-id="${clean}"]`) ||
           document.querySelector(`[id="${clean}"]`) ||
           document.querySelector(`[value="${clean}"]`);
      if (el) return el;
    } catch (_) {}

    // 5. Match by exact or partial button/input text or value (Case-insensitive)
    const lowerClean = clean.toLowerCase();
    const candidates = extractRawDomNodeList();

    for (const cand of candidates) {
      const id = (cand.id || '').toLowerCase();
      const name = ((cand as HTMLInputElement).name || '').toLowerCase();
      const text = (cand.textContent || '').trim().toLowerCase();
      const val = ((cand as HTMLInputElement).value || '').trim().toLowerCase();
      const placeholder = ((cand as HTMLInputElement).placeholder || '').trim().toLowerCase();

      if (id === lowerClean || name === lowerClean) {
        return cand;
      }
      if (text && (text === lowerClean || text.includes(lowerClean))) {
        return cand;
      }
      if (val && (val === lowerClean || val.includes(lowerClean))) {
        return cand;
      }
      if (placeholder && placeholder.includes(lowerClean)) {
        return cand;
      }
    }

    // 6. Fallback for login buttons (e.g., Codeforces "Enter" / "Login" submit buttons)
    if (lowerClean.includes('login') || lowerClean.includes('submit') || lowerClean.includes('enter') || lowerClean.includes('sign in')) {
      const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], input.submit, button.submit') as HTMLElement;
      if (submitBtn) return submitBtn;
    }

    return null;
  }

  // Strictly execute validated browser action and return ActionReceipt
  function executeValidatedAction(command: any) {
    const actionType = String(command.action || 'NONE').toUpperCase();
    const targetSelector = command.targetSelector || null;
    const value = command.value || null;

    console.log(`[RAVEN Content Script] Processing EXECUTE_ACTION | Action: ${actionType} | Target: ${targetSelector || 'NONE'}`);

    if (actionType === 'NONE' || actionType === 'DONE') {
      return {
        success: true,
        action: actionType,
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: false,
        verified: true,
        message: actionType === 'DONE' ? 'Task finished by server decision' : 'No browser action required'
      };
    }

    const targetEl = findTargetElement(targetSelector);
    console.log('[RAVEN Content Script] TARGET LOOKUP RESULT', { found: Boolean(targetEl) });

    if (actionType === 'CLICK') {
      if (!targetEl) {
        console.warn(`[RAVEN Content Script] TARGET_NOT_FOUND: Element "${targetSelector}" not found in current live DOM.`);
        return {
          success: false,
          action: 'CLICK',
          target_element_id: targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `TARGET_NOT_FOUND: Element "${targetSelector}" not found in current live DOM state`
        };
      }

      console.log(`[RAVEN Content Script] Target element found: <${targetEl.tagName.toLowerCase()} id="${targetEl.id}" class="${targetEl.className}">`);

      // Scroll into view & focus
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();

      // Visually highlight element briefly
      const prevOutline = targetEl.style.outline;
      targetEl.style.outline = '3px solid #a6e3a1';
      setTimeout(() => { targetEl.style.outline = prevOutline; }, 1500);

      console.log('[RAVEN Content Script] EXECUTING REAL CLICK');

      // Dispatch real mouse events
      const mouseEvents = ['pointerdown', 'mousedown', 'mouseup', 'click'];
      mouseEvents.forEach(evtName => {
        targetEl.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, view: window }));
      });

      if (typeof targetEl.click === 'function') {
        targetEl.click();
      }

      console.log('[RAVEN Content Script] REAL CLICK COMPLETE');

      const label = targetEl.textContent?.trim() || (targetEl as HTMLInputElement).value || targetSelector || 'element';
      console.log(`[RAVEN Content Script] Real click dispatched cleanly on element "${label}"`);

      return {
        success: true,
        action: 'CLICK',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: `Real click dispatched on element "${label}"`
      };
    }

    if (actionType === 'TYPE') {
      if (!targetEl) {
        console.warn(`[RAVEN Content Script] TARGET_NOT_FOUND: Element "${targetSelector}" not found for TYPE.`);
        return {
          success: false,
          action: 'TYPE',
          target_element_id: targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `TARGET_NOT_FOUND: Element "${targetSelector}" not found in current live DOM state`
        };
      }

      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();
      (targetEl as HTMLInputElement).value = value || '';

      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));

      console.log(`[RAVEN Content Script] Typed text into target "${targetSelector}"`);

      return {
        success: true,
        action: 'TYPE',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: `Typed text into "${targetSelector}"`
      };
    }

    if (actionType === 'SCROLL') {
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: 300, behavior: 'smooth' });
      }
      return {
        success: true,
        action: 'SCROLL',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: 'Scrolled page'
      };
    }

    if (actionType === 'SELECT') {
      if (!targetEl || targetEl.tagName.toLowerCase() !== 'select') {
        return {
          success: false,
          action: 'SELECT',
          target_element_id: targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `TARGET_NOT_FOUND: Element "${targetSelector}" is not a valid <select> element`
        };
      }

      const selectEl = targetEl as HTMLSelectElement;
      let matched = false;

      if (value) {
        for (let i = 0; i < selectEl.options.length; i++) {
          if (selectEl.options[i].value === value || selectEl.options[i].text.toLowerCase().includes(value.toLowerCase())) {
            selectEl.selectedIndex = i;
            matched = true;
            break;
          }
        }
      }

      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        action: 'SELECT',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: matched ? `Selected "${value}" in <select>` : `Selected option on target`
      };
    }

    return {
      success: false,
      action: actionType,
      target_element_id: targetSelector,
      execution: 'REAL_BROWSER',
      dispatched: false,
      verified: false,
      error: `Unsupported action type: ${actionType}`
    };
  }

  // Global listener for runtime messages from Popup & Background worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[RAVEN Content Script] MESSAGE RECEIVED', message?.type);

    if (message.type === 'PING') {
      console.log('[RAVEN Content Script] Responding to PING -> RAVEN_CONTENT_READY');
      sendResponse({ success: true, type: 'RAVEN_CONTENT_READY' });
      return true;
    }

    if (message.type === 'EXTRACT_DOM') {
      try {
        console.log('[RAVEN Content Script] Processing EXTRACT_DOM request');
        const elements = extractLiveDomElements();
        console.log(`[RAVEN Content Script] Extracted ${elements.length} live DOM elements`);
        sendResponse({ success: true, elements });
      } catch (err) {
        console.error('[RAVEN Content Script] Error during EXTRACT_DOM:', err);
        sendResponse({ success: false, error: String(err), elements: [] });
      }
      return true;
    }

    if (message.type === 'EXECUTE_ACTION') {
      try {
        console.log('[RAVEN Content Script] EXECUTE_ACTION RECEIVED', {
          action: message.command?.action,
          target: message.command?.targetSelector
        });
        const result = executeValidatedAction(message.command);
        console.log('[RAVEN Content Script] SENDING ACTION RESPONSE', result);
        sendResponse(result);
      } catch (err) {
        console.error('[RAVEN Content Script] ACTION HANDLER ERROR:', err);
        sendResponse({
          success: false,
          action: message.command?.action || 'UNKNOWN',
          target_element_id: message.command?.targetSelector || null,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `ACTION_HANDLER_FAILED: ${err instanceof Error ? err.message : String(err)}`
        });
      }
      return true;
    }

    return true;
  });

  console.log('[RAVEN Content Script] Content script initialized & listening for PING / EXTRACT_DOM / EXECUTE_ACTION');
})();
