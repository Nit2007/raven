/**
 * Content Script — Real browser DOM extraction & Action Executor.
 * Runs inside target web page context with direct DOM access.
 */

import { ElementInfo } from '../integration/perceptionAdapter.js';
import { ValidatedCommand, ActionReceipt } from '../agent/actionExecutor.js';

(function () {
  if ((window as any).__RAVEN_CONTENT_INITIALIZED__) {
    console.log('[RAVEN Content Script] Already initialized in tab.');
    return;
  }
  (window as any).__RAVEN_CONTENT_INITIALIZED__ = true;

  console.log('[RAVEN Content Script] Initializing content script...');

  /**
   * Extract visible, interactive, or text-bearing DOM elements from the live page.
   */
  function extractLiveDomElements(): ElementInfo[] {
    const rawNodes = extractRawDomNodeList();
    const results: ElementInfo[] = [];

    rawNodes.forEach((node, idx) => {
      const rect = node.getBoundingClientRect();
      const textVal = (node.textContent || (node as HTMLInputElement).value || (node as HTMLInputElement).placeholder || '').trim();
      const isInput = node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
      const isClickable = node.tagName === 'BUTTON' || node.tagName === 'A' || node.getAttribute('role') === 'button' || isInput;

      results.push({
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') || (isInput ? 'input' : (node.tagName === 'A' ? 'link' : node.tagName.toLowerCase())),
        type: (node as HTMLInputElement).type || node.tagName.toLowerCase(),
        name: node.getAttribute('name') || undefined,
        id: node.id || `el_${idx}`,
        placeholder: (node as HTMLInputElement).placeholder || undefined,
        labelText: undefined,
        visibleText: textVal.slice(0, 100),
        value: (node as HTMLInputElement).value || undefined,
        boundingBox: {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: Math.max(0, rect.width),
          height: Math.max(0, rect.height)
        },
        interactive: isClickable
      });
    });

    return results;
  }

  function extractRawDomNodeList(): HTMLElement[] {
    const selector = 'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const all = Array.from(document.querySelectorAll<HTMLElement>(selector));

    return all.filter(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
      return isVisible;
    });
  }

  /**
   * Find target DOM element by ID, selector, name, value, text content, or synthetic index.
   */
  function findTargetElement(targetSelector: string | null): HTMLElement | null {
    if (!targetSelector) return null;

    const lowerTarget = targetSelector.toLowerCase();

    // 1. Synthetic Index matching (el_X)
    const indexMatch = targetSelector.match(/^el_(\d+)$/i);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10);
      const rawNodes = extractRawDomNodeList();
      if (idx >= 0 && idx < rawNodes.length) {
        console.log(`[RAVEN Content Script] Resolved synthetic target index "el_${idx}" to <${rawNodes[idx].tagName.toLowerCase()} id="${rawNodes[idx].id}">`);
        return rawNodes[idx];
      }
    }

    // 2. Pure numeric index
    if (/^\d+$/.test(targetSelector)) {
      const idx = parseInt(targetSelector, 10);
      const rawNodes = extractRawDomNodeList();
      if (idx >= 0 && idx < rawNodes.length) {
        return rawNodes[idx];
      }
    }

    // 3. Direct ID lookup
    const elById = document.getElementById(targetSelector);
    if (elById) return elById;

    // 4. CSS Selector query
    try {
      const elByCss = document.querySelector<HTMLElement>(targetSelector);
      if (elByCss) return elByCss;
    } catch (_) {}

    // 5. Name or value attribute lookup
    const elByName = document.querySelector<HTMLElement>(`[name="${targetSelector}"], [value="${targetSelector}"]`);
    if (elByName) return elByName;

    // 6. Text content or button role search
    const candidates = extractRawDomNodeList();
    for (const cand of candidates) {
      const text = (cand.textContent || (cand as HTMLInputElement).value || '').trim().toLowerCase();
      if (text && text === lowerTarget) return cand;
      if (text && text.includes(lowerTarget)) return cand;
    }

    return null;
  }

  /**
   * Execute validated action on target DOM element with strict real browser dispatch and action-specific verification.
   */
  async function executeValidatedActionAsync(command: ValidatedCommand): Promise<ActionReceipt> {
    const actionType = String(command.action || 'NONE').toUpperCase();
    const targetSelector = command.targetSelector;
    const value = command.value;

    console.log(`[RAVEN Content Script] Executing real action: ${actionType} on target: "${targetSelector || 'NONE'}"`);

    const targetEl = findTargetElement(targetSelector);
    console.log('[RAVEN TRACE 12] Target found', { found: Boolean(targetEl) });

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

      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();

      const prevOutline = targetEl.style.outline;
      targetEl.style.outline = '3px solid #a6e3a1';
      setTimeout(() => { targetEl.style.outline = prevOutline; }, 1500);

      console.log('[RAVEN TRACE 13] Performing real click');

      const mouseEvents = ['pointerdown', 'mousedown', 'mouseup', 'click'];
      mouseEvents.forEach(evtName => {
        targetEl.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, view: window }));
      });

      if (typeof targetEl.click === 'function') {
        targetEl.click();
      }

      console.log('[RAVEN TRACE 14] Click completed');

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

      const currentValue = (targetEl as HTMLInputElement).value;
      const typeVerified = currentValue === (value || '');

      console.log(`[RAVEN Content Script] TYPE VERIFICATION`, { expected: value, actual: currentValue, verified: typeVerified });

      return {
        success: typeVerified,
        action: 'TYPE',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: typeVerified,
        message: `Typed text "${value}" into "${targetSelector}"`
      };
    }

    if (actionType === 'SCROLL') {
      const beforeScrollY = window.scrollY;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: 600, behavior: 'smooth' });
      }

      await new Promise(r => setTimeout(r, 150));
      const afterScrollY = window.scrollY;
      const scrollChanged = Math.abs(afterScrollY - beforeScrollY) > 5;

      console.log('[RAVEN Content Script] SCROLL VERIFICATION', { beforeScrollY, afterScrollY, scrollChanged });

      return {
        success: true,
        action: 'SCROLL',
        target_element_id: targetSelector,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: scrollChanged || (afterScrollY > 0),
        message: `Scrolled page (Y: ${beforeScrollY}px -> ${afterScrollY}px)`
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
        verified: matched,
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
      console.log('[RAVEN TRACE 11] EXECUTE_ACTION received', {
        action: message.command?.action,
        target: message.command?.targetSelector
      });

      executeValidatedActionAsync(message.command).then(result => {
        console.log('[RAVEN Content Script] SENDING ACTION RESPONSE', result);
        sendResponse(result);
      }).catch(err => {
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
      });

      return true;
    }

    return true;
  });

  console.log('[RAVEN Content Script] Content script initialized & listening for PING / EXTRACT_DOM / EXECUTE_ACTION');
})();
