// src/content/action-executor.ts
// Generic DOM Action Executor for PilotRaven browser agent.
// Integrates Universal Element Matching Engine with stale-element recovery and action safety checks.
// Zero website-specific selectors or logic.

import { PageElement, UniversalActionType } from '../types/index.js';
import { ElementMatcher } from '../services/matching/element-matcher.js';
import { MatchTarget, MatchResult, ElementFingerprint } from '../services/matching/matching-types.js';

export interface ActionExecutionResult {
  success: boolean;
  action: UniversalActionType;
  targetId?: string;
  matchedElementId?: string;
  matchResult?: MatchResult;
  error?: string;
  recoveredFromStale?: boolean;
}

export class ActionExecutor {
  private matcher: ElementMatcher;

  constructor() {
    this.matcher = new ElementMatcher();
  }

  /**
   * Resolves target element using ElementMatcher with stale recovery and executes the action.
   */
  public async execute(
    action: UniversalActionType,
    targetId?: string,
    value?: string,
    targetHint?: string,
    context?: string,
    elementsSnapshot: PageElement[] = [],
    prevFingerprint?: ElementFingerprint
  ): Promise<ActionExecutionResult> {
    // Non-element actions (scroll, wait, navigate, done)
    if (action === 'scroll') {
      const direction = value === 'up' ? -500 : 500;
      window.scrollBy({ top: direction, behavior: 'smooth' });
      return { success: true, action };
    }

    if (action === 'wait') {
      const waitMs = Number(value) || 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      return { success: true, action };
    }

    if (action === 'done' || action === 'navigate' || action === 'look' || action === 'back' || action === 'forward') {
      return { success: true, action };
    }

    // Element-targeted actions (click, type, press, select, check)
    const matchTarget: MatchTarget = {
      action,
      elementId: targetId,
      text: targetHint || value,
      targetHint,
      context,
    };

    // 1. Resolve element using Universal Element Matcher
    const matchResult = this.matcher.resolveElement(matchTarget, elementsSnapshot, prevFingerprint);

    if (!matchResult.matched || !matchResult.elementId) {
      return {
        success: false,
        action,
        targetId,
        matchResult,
        error: `Element resolution failed: ${matchResult.status} — ${matchResult.reason}`,
      };
    }

    const resolvedId = matchResult.elementId;
    const isRecovered = Boolean(targetId && resolvedId !== targetId);

    // 2. Find live DOM element
    const domEl = this.findDomElement(resolvedId);
    if (!domEl) {
      return {
        success: false,
        action,
        targetId,
        matchedElementId: resolvedId,
        matchResult,
        error: `Resolved element [${resolvedId}] could not be found in active DOM`,
      };
    }

    // 3. Execute DOM action
    try {
      await this.dispatchDomAction(domEl, action, value);
      return {
        success: true,
        action,
        targetId,
        matchedElementId: resolvedId,
        matchResult,
        recoveredFromStale: isRecovered,
      };
    } catch (err) {
      return {
        success: false,
        action,
        targetId,
        matchedElementId: resolvedId,
        matchResult,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private findDomElement(elementId: string): HTMLElement | null {
    // 1. Check data-agent-id attribute
    let el = document.querySelector(`[data-agent-id="${CSS.escape(elementId)}"]`) as HTMLElement | null;
    if (el) return el;

    // 2. Check id attribute
    el = document.getElementById(elementId);
    if (el) return el;

    return null;
  }

  private async dispatchDomAction(
    el: HTMLElement,
    action: UniversalActionType,
    value?: string
  ): Promise<void> {
    switch (action) {
      case 'click': {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.focus();
        el.click();
        return;
      }

      case 'type': {
        const textToType = value || '';
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.focus();

        const isInputOrTextarea = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '';

        if (isInputOrTextarea) {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) {
            setter.call(el, textToType);
          } else {
            (el as HTMLInputElement).value = textToType;
          }
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: textToType }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (isContentEditable) {
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
          }

          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, textToType);
          } catch (_e) {}

          if (!inserted) {
            el.textContent = textToType;
          }

          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: textToType }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          if ('value' in el) {
            (el as any).value = textToType;
          } else {
            el.textContent = textToType;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      case 'press': {
        const keyName = value || 'Enter';
        el.focus();

        const keyMap: Record<string, string> = { ENTER: 'Enter', TAB: 'Tab', ESC: 'Escape', BACKSPACE: 'Backspace' };
        const key = keyMap[keyName] || keyName;
        const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : (key.charCodeAt(0) || 0);

        const evDown = new KeyboardEvent('keydown', { key, code: key === 'Enter' ? 'Enter' : key, keyCode, which: keyCode, bubbles: true, cancelable: true });
        const evPress = new KeyboardEvent('keypress', { key, code: key === 'Enter' ? 'Enter' : key, keyCode, which: keyCode, bubbles: true, cancelable: true });
        const evUp = new KeyboardEvent('keyup', { key, code: key === 'Enter' ? 'Enter' : key, keyCode, which: keyCode, bubbles: true, cancelable: true });

        el.dispatchEvent(evDown);
        el.dispatchEvent(evPress);
        el.dispatchEvent(evUp);

        if (key === 'Enter') {
          if (el instanceof HTMLInputElement && el.form) {
            if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
            else el.form.submit();
          }
        }
        return;
      }

      case 'select': {
        if (el instanceof HTMLSelectElement && value) {
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      case 'check': {
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.click();
        }
        return;
      }

      default:
        throw new Error(`Unsupported DOM action: ${action}`);
    }
  }
}
