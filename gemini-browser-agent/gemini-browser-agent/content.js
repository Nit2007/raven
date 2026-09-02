// content.js — DOM Observer & Action Executor
(function () {
  // Clean up listener from previous injection so re-injection after navigation gets a fresh handler
  if (window.__geminiAgentListener) {
    chrome.runtime.onMessage.removeListener(window.__geminiAgentListener);
  }

  const AGENT_ATTR = 'data-agent-id';
  let counter = 0;

  function assignId(el) {
    let id = el.getAttribute(AGENT_ATTR);
    if (!id) {
      id = `el-${counter++}`;
      el.setAttribute(AGENT_ATTR, id);
    }
    return id;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    return true;
  }

  function extractElements() {
    const selector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="tab"]',
      '[role="searchbox"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="combobox"]',
      '[contenteditable="true"]'
    ].join(', ');

    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes
      .filter(isVisible)
      .slice(0, 200)
      .map((el) => {
        const text = (
          el.innerText ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          el.value ||
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 80);

        return {
          target_id: assignId(el),
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || el.getAttribute('role') || '',
          text: text
        };
      });
  }

  function extractVisibleText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const chunks = [];
    let node;
    while ((node = walker.nextNode()) && chunks.length < 100) {
      const t = node.textContent.trim().replace(/\s+/g, ' ');
      if (t && t.length > 1) chunks.push(t.slice(0, 200));
    }
    return chunks.slice(0, 100);
  }

  function findEl(targetId) {
    const el = document.querySelector(`[${AGENT_ATTR}="${CSS.escape(targetId)}"]`);
    if (!el) throw new Error(`No element found for target_id "${targetId}"`);
    return el;
  }

  async function executeAction(action) {
    switch (action.action) {
      case 'click': {
        const el = findEl(action.target_id);
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return;
      }
      case 'type': {
        const el = findEl(action.target_id);
        el.focus();
        if ('value' in el) {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, action.value);
          else el.value = action.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = action.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          throw new Error('Target element is not editable');
        }
        return;
      }
      case 'press': {
        const el = findEl(action.target_id);
        const keyMap = { ENTER: 'Enter', TAB: 'Tab', ESC: 'Escape', BACKSPACE: 'Backspace' };
        const key = keyMap[action.value] || action.value;
        const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : 0;

        const opts = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent('keydown', opts));
        el.dispatchEvent(new KeyboardEvent('keypress', opts));
        el.dispatchEvent(new KeyboardEvent('keyup', opts));

        // Form submission fallback for Enter press in search fields
        if (key === 'Enter' && el.form) {
          if (typeof el.form.requestSubmit === 'function') {
            el.form.requestSubmit();
          } else {
            el.form.submit();
          }
        }
        return;
      }
      case 'scroll': {
        window.scrollBy({ top: action.direction === 'down' ? 500 : -500, behavior: 'smooth' });
        return;
      }
      case 'wait': {
        await new Promise((r) => setTimeout(r, action.wait_ms || 1000));
        return;
      }
      default:
        throw new Error(`Unknown action "${action.action}"`);
    }
  }

  function onMessage(msg, sender, sendResponse) {
    (async () => {
      try {
        if (msg.type === 'GET_OBSERVATION') {
          sendResponse({
            ok: true,
            data: {
              url: location.href,
              title: document.title,
              elements: extractElements(),
              visibleText: extractVisibleText()
            }
          });
        } else if (msg.type === 'EXECUTE_ACTION') {
          await executeAction(msg.action);
          sendResponse({ ok: true, data: { executed: true } });
        } else {
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // Keep message channel open for async response
  }

  window.__geminiAgentListener = onMessage;
  chrome.runtime.onMessage.addListener(onMessage);
})();