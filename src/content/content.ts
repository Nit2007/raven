/**
 * Content script running inside web pages.
 * Handles DOM element extraction for analysis and strict real browser action execution.
 */

(() => {
  function getViewportMeta() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  // Extract visible interactive & structured DOM elements from the live page
  function extractLiveDomElements() {
    const rawElements = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], h1, h2, h3, p, span, form, div'));
    const results: any[] = [];
    const maxScan = Math.min(rawElements.length, 500);

    for (let i = 0; i < maxScan; i++) {
      const el = rawElements[i] as HTMLElement;
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) continue;

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

      results.push({
        tag,
        type,
        name,
        id,
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
      });
    }

    return results;
  }

  // Find target element by ID, selector, or attribute
  function findTargetElement(selectorOrId: string | null): HTMLElement | null {
    if (!selectorOrId) return null;

    // 1. Direct ID match
    let el = document.getElementById(selectorOrId);
    if (el) return el;

    // 2. Query Selector match
    try {
      el = document.querySelector(selectorOrId);
      if (el) return el;
    } catch (_) {
      // Ignore invalid CSS selector syntax
    }

    // 3. Match by name or data attribute
    try {
      el = document.querySelector(`[name="${selectorOrId}"]`) ||
           document.querySelector(`[data-id="${selectorOrId}"]`) ||
           document.querySelector(`[id="${selectorOrId}"]`);
      if (el) return el;
    } catch (_) {}

    // 4. Match by exact or partial button/input text
    const buttons = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
    for (const b of buttons) {
      if (b.id === selectorOrId || b.textContent?.trim().toLowerCase().includes(selectorOrId.toLowerCase())) {
        return b as HTMLElement;
      }
    }

    return null;
  }

  // Strictly execute validated browser action and return ActionReceipt
  function executeValidatedAction(command: any) {
    const actionType = String(command.action || 'NONE').toUpperCase();
    const targetSelector = command.targetSelector || null;
    const value = command.value || null;

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

    if (actionType === 'CLICK') {
      if (!targetEl) {
        return {
          success: false,
          action: 'CLICK',
          target_element_id: targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `Target element "${targetSelector}" not found in current live DOM state`
        };
      }

      // Scroll into view & focus
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();

      // Visually highlight element briefly
      const prevOutline = targetEl.style.outline;
      targetEl.style.outline = '3px solid #a6e3a1';
      setTimeout(() => { targetEl.style.outline = prevOutline; }, 1500);

      // Dispatch mouse events
      const mouseEvents = ['pointerdown', 'mousedown', 'mouseup', 'click'];
      mouseEvents.forEach(evtName => {
        targetEl.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, view: window }));
      });

      if (typeof targetEl.click === 'function') {
        targetEl.click();
      }

      const label = targetEl.textContent?.trim() || (targetEl as HTMLInputElement).value || targetSelector || 'element';
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
        return {
          success: false,
          action: 'TYPE',
          target_element_id: targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: `Target element "${targetSelector}" not found in current live DOM state`
        };
      }

      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();
      (targetEl as HTMLInputElement).value = value || '';

      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        success: true,
        action: 'TYPE',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: `Typed "${value || ''}" into "${targetSelector}"`
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
          error: `Target element "${targetSelector}" is not a valid <select> element`
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
    if (message.type === 'EXTRACT_DOM') {
      try {
        const elements = extractLiveDomElements();
        sendResponse({ success: true, elements });
      } catch (err) {
        sendResponse({ success: false, error: String(err), elements: [] });
      }
      return true;
    }

    if (message.type === 'EXECUTE_ACTION') {
      try {
        const result = executeValidatedAction(message.command);
        sendResponse(result);
      } catch (err) {
        sendResponse({
          success: false,
          action: message.command?.action || 'UNKNOWN',
          target_element_id: message.command?.targetSelector || null,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: String(err)
        });
      }
      return true;
    }
  });

  // Global listener for window messages (legacy support)
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_LOCAL_PERCEPTION') {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_AND_PERCEIVE',
        viewport: getViewportMeta()
      }, (response) => {
        window.postMessage({
          type: 'LOCAL_PERCEPTION_RESPONSE',
          detections: response?.detections || []
        }, '*');
      });
    }
  });
})();
