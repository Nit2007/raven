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
      '[contenteditable]'
    ].join(', ');

    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes
      .filter(isVisible)
      .slice(0, 200)
      .map((el) => {
        const text = (
          el.innerText?.trim() ||
          el.getAttribute('aria-label')?.trim() ||
          el.getAttribute('placeholder')?.trim() ||
          el.getAttribute('title')?.trim() ||
          (typeof el.value === 'string' ? el.value.trim() : '') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 80);

        const role = el.getAttribute('role') || el.getAttribute('type') || '';
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        const placeholder = el.getAttribute('placeholder')?.trim();

        return {
          target_id: assignId(el),
          tag: el.tagName.toLowerCase(),
          type: role,
          text: text,
          ...(ariaLabel && ariaLabel !== text ? { label: ariaLabel.slice(0, 50) } : {}),
          ...(placeholder && placeholder !== text ? { placeholder: placeholder.slice(0, 50) } : {})
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

        const isInputOrTextarea = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '';

        if (isInputOrTextarea) {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, action.value);
          else el.value = action.value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: action.value }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (isEditable) {
          // Select content to allow native replacement
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
          }

          // Use execCommand which ProseMirror, Lexical, Draft.js, and Slate intercept natively
          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, action.value);
          } catch (_e) {}

          if (!inserted) {
            el.textContent = action.value;
          }

          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: action.value }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          if ('value' in el) {
            el.value = action.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = action.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        return;
      }
      case 'press': {
        const el = findEl(action.target_id);
        el.focus();
        const keyMap = { ENTER: 'Enter', TAB: 'Tab', ESC: 'Escape', BACKSPACE: 'Backspace' };
        const key = keyMap[action.value] || action.value;
        const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : (key.charCodeAt(0) || 0);

        function sendKeyEvent(type) {
          const ev = new KeyboardEvent(type, {
            key,
            code: key === 'Enter' ? 'Enter' : key,
            keyCode,
            which: keyCode,
            charCode: type === 'keypress' && key === 'Enter' ? 13 : 0,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
          Object.defineProperty(ev, 'which', { get: () => keyCode });
          el.dispatchEvent(ev);
        }

        sendKeyEvent('keydown');
        sendKeyEvent('keypress');
        sendKeyEvent('keyup');

        // Form submission fallback for Enter press in search fields or forms
        if (key === 'Enter') {
          if (el.form) {
            if (typeof el.form.requestSubmit === 'function') {
              el.form.requestSubmit();
            } else {
              el.form.submit();
            }
          } else {
            // Also check for adjacent submit/send button inside the same parent/container
            const container = el.closest('form') || el.closest('[role="presentation"]') || el.parentElement;
            if (container) {
              const sendBtn = container.querySelector('button[data-testid="send-button"], button[aria-label*="Send" i], button[type="submit"]');
              if (sendBtn && isVisible(sendBtn) && !sendBtn.disabled) {
                sendBtn.click();
              }
            }
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

  function findPiiBounds() {
    const piiRegexes = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/, // Phone
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // Credit card
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}\s\d{4}\s\d{4}\b/, // Aadhaar
      /\b(?:ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35}|sk-[a-zA-Z0-9]{48})\b/ // API keys
    ];

    const bounds = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    const dpr = window.devicePixelRatio || 1;

    while ((node = walker.nextNode()) && bounds.length < 50) {
      const text = (node.textContent || '').trim();
      if (text.length < 5) continue;

      for (const re of piiRegexes) {
        if (re.test(text)) {
          const parent = node.parentElement;
          if (parent && isVisible(parent)) {
            const rect = parent.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              bounds.push({
                x: rect.left * dpr,
                y: rect.top * dpr,
                width: rect.width * dpr,
                height: rect.height * dpr
              });
              break;
            }
          }
        }
      }
    }
    return bounds;
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
        } else if (msg.type === 'GET_PII_BOUNDS') {
          sendResponse({ ok: true, data: { bounds: findPiiBounds() } });
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