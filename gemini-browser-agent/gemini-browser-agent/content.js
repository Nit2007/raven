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

  // --- Milestone M2: Semantic DOM Perception & Spatial Analysis ---
  function computeAriaRole(el) {
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole.trim().toLowerCase();

    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return el.hasAttribute('href') ? 'link' : null;
      case 'button': return 'button';
      case 'input': {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'search') return 'searchbox';
        if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
        if (type === 'range') return 'slider';
        return 'textbox';
      }
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': return 'heading';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'header': return 'banner';
      case 'footer': return 'contentinfo';
      case 'img': return 'img';
      case 'form': return 'form';
      case 'dialog': return 'dialog';
      case 'ul':
      case 'ol': return 'list';
      case 'li': return 'listitem';
      case 'table': return 'table';
      case 'details': return 'group';
      case 'summary': return 'button';
      default: return null;
    }
  }

  function getSemanticName(el) {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const labels = labelledby.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
      if (labels.length > 0) return labels.join(' ').slice(0, 100);
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim().slice(0, 100);

    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim().slice(0, 100);

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim().slice(0, 100);

    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim().slice(0, 100);

    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) return text.slice(0, 100);

    if (el.value && typeof el.value === 'string' && el.value.trim()) return el.value.trim().slice(0, 100);

    return '';
  }

  function computeInteractivity(el, role) {
    const tag = el.tagName.toLowerCase();
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'details'];
    const interactiveRoles = ['button', 'link', 'checkbox', 'tab', 'searchbox', 'menuitem', 'option', 'combobox', 'switch', 'radio', 'textbox', 'slider'];

    const isClickable = interactiveTags.includes(tag) || (role && interactiveRoles.includes(role)) ||
      el.hasAttribute('onclick') || window.getComputedStyle(el).cursor === 'pointer';

    const isEditable = tag === 'textarea' ||
      (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden'].includes((el.type || '').toLowerCase())) ||
      el.isContentEditable || el.getAttribute('contenteditable') === 'true';

    const isFocusable = isClickable || isEditable || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1');
    const isEnabled = !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';

    return {
      interactive: (isClickable || isEditable || isFocusable) && isEnabled,
      clickable: isClickable && isEnabled,
      editable: isEditable && isEnabled,
      focusable: isFocusable,
      enabled: isEnabled
    };
  }

  function computeVisibility(rect, style, vpWidth, vpHeight) {
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || (rect.width === 0 && rect.height === 0)) {
      return 'HIDDEN';
    }

    const inX = rect.right > 0 && rect.left < vpWidth;
    const inY = rect.bottom > 0 && rect.top < vpHeight;

    if (!inX || !inY) return 'OUTSIDE_VIEWPORT';

    if (rect.left >= 0 && rect.top >= 0 && rect.right <= vpWidth && rect.bottom <= vpHeight) {
      return 'VISIBLE';
    }

    return 'PARTIALLY_VISIBLE';
  }

  function testOcclusion(el, rect, visibility, vpWidth, vpHeight) {
    if (visibility !== 'VISIBLE' && visibility !== 'PARTIALLY_VISIBLE') {
      return 'UNKNOWN';
    }

    try {
      const cx = Math.max(1, Math.min(vpWidth - 2, rect.left + rect.width / 2));
      const cy = Math.max(1, Math.min(vpHeight - 2, rect.top + rect.height / 2));

      const hit = document.elementFromPoint(cx, cy);
      if (!hit) return 'UNKNOWN';

      if (hit === el || el.contains(hit) || hit.contains(el)) {
        return 'NOT_OCCLUDED';
      }

      const p1 = document.elementFromPoint(rect.left + rect.width * 0.25, rect.top + rect.height * 0.25);
      const p2 = document.elementFromPoint(rect.left + rect.width * 0.75, rect.top + rect.height * 0.75);

      const hitP1 = p1 && (p1 === el || el.contains(p1) || p1.contains(el));
      const hitP2 = p2 && (p2 === el || el.contains(p2) || p2.contains(el));

      if (hitP1 || hitP2) {
        return 'PARTIALLY_OCCLUDED';
      }

      return 'OCCLUDED';
    } catch (_) {
      return 'UNKNOWN';
    }
  }

  function getSimplifiedDomPath(el) {
    const parts = [];
    let curr = el;
    let depth = 0;
    while (curr && curr.tagName && depth < 5) {
      let tag = curr.tagName.toLowerCase();
      if (curr.id) {
        parts.unshift(`${tag}#${curr.id}`);
        break;
      } else {
        parts.unshift(tag);
      }
      curr = curr.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function analyzeSemanticDom() {
    const vpWidth = window.innerWidth;
    const vpHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    const selector = [
      'a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'details',
      '[role]', '[contenteditable="true"]', '[tabindex]',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'main', 'header', 'footer', 'form'
    ].join(', ');

    const rawNodes = Array.from(document.querySelectorAll(selector));
    const elements = [];
    const rolesSummary = {};
    let visibleCount = 0;
    let interactiveCount = 0;
    let editableCount = 0;
    let occludedCount = 0;
    let partiallyOccludedCount = 0;

    const elementIdMap = new Map();
    const maxElements = 350;
    const sample = rawNodes.slice(0, maxElements);

    for (const el of sample) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const role = computeAriaRole(el);
      const interactivity = computeInteractivity(el, role);
      const visibility = computeVisibility(rect, style, vpWidth, vpHeight);
      const occlusion = testOcclusion(el, rect, visibility, vpWidth, vpHeight);
      const semanticName = getSemanticName(el);

      const targetId = assignId(el);
      elementIdMap.set(el, targetId);

      if (visibility === 'VISIBLE' || visibility === 'PARTIALLY_VISIBLE') visibleCount++;
      if (interactivity.interactive) interactiveCount++;
      if (interactivity.editable) editableCount++;
      if (occlusion === 'OCCLUDED') occludedCount++;
      if (occlusion === 'PARTIALLY_OCCLUDED') partiallyOccludedCount++;

      if (role) {
        rolesSummary[role] = (rolesSummary[role] || 0) + 1;
      }

      elements.push({
        target_id: targetId,
        tag: el.tagName.toLowerCase(),
        role: role || 'generic',
        semanticName: semanticName || '',
        text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        attributes: {
          type: el.getAttribute('type') || null,
          href: el.getAttribute('href') || null,
          placeholder: el.getAttribute('placeholder') || null,
          title: el.getAttribute('title') || null,
          name: el.getAttribute('name') || null,
          ariaLabel: el.getAttribute('aria-label') || null
        },
        state: {
          visibility,
          enabled: interactivity.enabled,
          interactive: interactivity.interactive,
          clickable: interactivity.clickable,
          editable: interactivity.editable,
          focusable: interactivity.focusable,
          checked: el.checked || el.getAttribute('aria-checked') === 'true' || null,
          selected: el.selected || el.getAttribute('aria-selected') === 'true' || null
        },
        spatial: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        },
        occlusion,
        hierarchy: {
          depth: 0,
          parent_id: null,
          children_ids: [],
          path: getSimplifiedDomPath(el)
        },
        _domNode: el
      });
    }

    for (const item of elements) {
      let p = item._domNode.parentElement;
      let depth = 0;
      while (p) {
        depth++;
        if (elementIdMap.has(p) && !item.hierarchy.parent_id) {
          item.hierarchy.parent_id = elementIdMap.get(p);
        }
        p = p.parentElement;
      }
      item.hierarchy.depth = depth;

      if (item.hierarchy.parent_id) {
        const parentItem = elements.find(x => x.target_id === item.hierarchy.parent_id);
        if (parentItem && !parentItem.hierarchy.children_ids.includes(item.target_id)) {
          parentItem.hierarchy.children_ids.push(item.target_id);
        }
      }

      delete item._domNode;
    }

    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: vpWidth,
        height: vpHeight,
        devicePixelRatio: dpr,
        scrollX: Math.round(scrollX),
        scrollY: Math.round(scrollY)
      },
      counts: {
        total: elements.length,
        visible: visibleCount,
        interactive: interactiveCount,
        editable: editableCount,
        occluded: occludedCount,
        partiallyOccluded: partiallyOccludedCount
      },
      roles: rolesSummary,
      elements
    };
  }

  function onMessage(msg, sender, sendResponse) {
    (async () => {
      try {
        if (msg.type === 'GET_M2_DOM_ANALYSIS') {
          const domAnalysis = analyzeSemanticDom();
          sendResponse({
            ok: true,
            data: domAnalysis
          });
          return;
        }
        if (msg.type === 'GET_VIEWPORT_METRICS') {
          sendResponse({
            ok: true,
            data: {
              cssWidth: window.innerWidth,
              cssHeight: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1,
              screenWidth: window.screen ? window.screen.width : null,
              screenHeight: window.screen ? window.screen.height : null,
              url: location.href,
              title: document.title
            }
          });
          return;
        }
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