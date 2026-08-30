import { ElementInfo } from './perceptionAdapter.js';

// Utility to inspect if a global object has Person 1 method signatures
function isPerson1Sanitizer(obj: any): boolean {
  return obj && typeof obj.sanitizeContext === 'function' && typeof obj.outboundCheck === 'function';
}

function isPerson1SensitivityDetector(obj: any): boolean {
  return obj && typeof obj.classifyElements === 'function';
}

function isPerson1RedactionEngine(obj: any): boolean {
  return obj && typeof obj.redactElements === 'function';
}

function isPerson1ServerAdapter(obj: any): boolean {
  return obj && typeof obj.buildOutboundPayload === 'function' && typeof obj.sendToServer === 'function';
}

// 1. Sensitivity Detector Implementation / Bridge
let rawDetector = (globalThis as any).SensitivityDetector || (typeof window !== 'undefined' ? (window as any).SensitivityDetector : null);
if (!isPerson1SensitivityDetector(rawDetector)) {
  rawDetector = {
    classifyElements: (elements: ElementInfo[]) => {
      return elements.map(el => {
        const text = [el.name, el.id, el.placeholder, el.labelText, el.visibleText, el.value, el.type].filter(Boolean).join(' ').toLowerCase();
        let cat = '';
        let tok = '';
        let conf = 0;

        if (el.type === 'password' || text.includes('password') || text.includes('pass') || text.includes('secret')) {
          cat = 'PASSWORD'; tok = '[PASSWORD]'; conf = 0.99;
        } else if (text.includes('card') || text.includes('credit') || text.includes('cvv') || text.includes('cc-number') || /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b|\b\d{13,19}\b/.test(text)) {
          cat = 'CARD'; tok = '[CARD]'; conf = 0.95;
        } else if (el.type === 'email' || text.includes('email') || text.includes('handleoremail') || /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text)) {
          cat = 'EMAIL'; tok = '[EMAIL]'; conf = 0.95;
        } else if (el.type === 'tel' || text.includes('phone') || text.includes('mobile') || text.includes('cell') || /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/.test(text)) {
          cat = 'PHONE'; tok = '[PHONE]'; conf = 0.90;
        } else if (text.includes('name') || text.includes('username') || text.includes('fullname') || text.includes('firstname') || text.includes('lastname') || text.includes('handle')) {
          cat = 'NAME'; tok = '[PERSON_NAME]'; conf = 0.85;
        } else if (text.includes('ssn') || /\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/.test(text)) {
          cat = 'SSN'; tok = '[SSN]'; conf = 0.95;
        }

        if (conf >= 0.80) {
          return {
            ...el,
            sensitivity: 'HIGH_CONFIDENCE_PII',
            confidence: conf,
            ruleCategory: cat,
            ruleToken: tok,
            ruleId: `rule_${cat.toLowerCase()}`,
            source: 'REGEX',
            reason: `DOM ${cat} Classification`
          };
        }
        return { ...el, sensitivity: 'SAFE', confidence: 0, ruleToken: null, source: null };
      });
    }
  };
}

// 2. Redaction Engine Implementation / Bridge
let rawRedactionEngine = (globalThis as any).RedactionEngine || (typeof window !== 'undefined' ? (window as any).RedactionEngine : null);
if (!isPerson1RedactionEngine(rawRedactionEngine)) {
  rawRedactionEngine = {
    redactElements: (elements: ElementInfo[]) => {
      return elements.map(el => {
        const isSensitive = el.sensitivity && el.sensitivity !== 'SAFE';
        const action = isSensitive ? 'REDACT' : 'KEEP';
        const out = { ...el, policyAction: action };

        if (isSensitive) {
          const rawToken = el.ruleToken || 'PII';
          const tokenName = rawToken.replace(/[\[\]]/g, '');
          let customMask = '{' + tokenName + '}';

          if (tokenName === 'FACE' || el.tag === 'visual-face') customMask = '[FACE_REGION]';
          else if (el.tag === 'visual-document') customMask = el.visibleText || '[SENSITIVE_DOCUMENT]';

          if (out.value !== undefined && out.value !== null) {
            out.value = customMask;
          }
          if (out.visibleText !== undefined && out.visibleText !== null) {
            out.visibleText = customMask;
          }
          out.redacted = true;
        } else {
          out.redacted = false;
        }
        return out;
      });
    }
  };
}

// 3. Sanitizer Implementation / Bridge
let rawSanitizer = (globalThis as any).Sanitizer || (typeof window !== 'undefined' ? (window as any).Sanitizer : null);
if (!isPerson1Sanitizer(rawSanitizer)) {
  rawSanitizer = {
    sanitizeContext: (elements: ElementInfo[]) => {
      return {
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location?.href || 'http://localhost' : 'http://localhost',
        title: typeof document !== 'undefined' ? document.title || 'Page' : 'Page',
        elementCount: elements.length,
        elements: elements.map(el => ({
          tag: el.tag,
          role: el.role,
          type: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          labelText: el.labelText,
          visibleText: el.visibleText,
          value: el.value,
          boundingBox: el.boundingBox,
          interactive: el.interactive,
          sensitivity: el.sensitivity,
          policyAction: el.policyAction,
          redacted: el.redacted,
          ruleId: el.ruleId || '',
          ruleCategory: el.ruleCategory || ''
        }))
      };
    },
    outboundCheck: (payload: any) => {
      let text = '';
      if (payload.screen_state && Array.isArray(payload.screen_state.elements)) {
        text = payload.screen_state.elements.map((e: any) => e.text || '').join(' ');
      } else if (Array.isArray(payload.elements)) {
        text = payload.elements.map((e: any) => [e.value, e.visibleText, e.text].filter(Boolean).join(' ')).join(' ');
      }

      const leakPatterns = [
        { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/, label: 'email address' },
        { regex: /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/, label: 'phone number' },
        { regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b|\b\d{13,19}\b/, label: 'credit card number' }
      ];

      const leaks: string[] = [];
      for (const pat of leakPatterns) {
        const match = text.match(pat.regex);
        if (match) {
          leaks.push(`${pat.label}: "${match[0]}"`);
        }
      }
      return { safe: leaks.length === 0, leaks };
    }
  };
}

// 4. Server Adapter Implementation / Bridge
let rawServerAdapter = (globalThis as any).ServerAdapter || (typeof window !== 'undefined' ? (window as any).ServerAdapter : null);
if (!isPerson1ServerAdapter(rawServerAdapter)) {
  rawServerAdapter = {
    buildOutboundPayload: (sanitizedPayload: any, taskContext?: string) => {
      const rawElements = sanitizedPayload.elements || [];
      let count = 0;
      const categories: Record<string, number> = {};

      const formattedElements = rawElements.map((el: any, idx: number) => {
        if (el.redacted) {
          count++;
          const cat = el.ruleCategory || 'PII';
          categories[cat] = (categories[cat] || 0) + 1;
        }

        let bbox = [0, 0, 0, 0];
        if (el.boundingBox) {
          const x1 = Math.round(el.boundingBox.x || 0);
          const y1 = Math.round(el.boundingBox.y || 0);
          const w = Math.round(el.boundingBox.width || 0);
          const h = Math.round(el.boundingBox.height || 0);
          bbox = [x1, y1, x1 + w, y1 + h];
        }

        const elementId = el.id || el.name || (`el_${idx}`);
        const textVal = [el.visibleText, el.value, el.labelText, el.placeholder].filter(Boolean).join(' ').trim();
        const selector = el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : (el.tag || 'div'));

        return {
          id: String(elementId),
          type: String(el.type || el.tag || 'element'),
          bbox: bbox,
          text: textVal || '[ELEMENT]',
          dom_selector: String(selector)
        };
      });

      return {
        session_id: 'ss-' + Date.now().toString(36),
        goal: taskContext || 'Analyze page and perform requested task',
        screen_state: {
          elements: formattedElements
        },
        action_history: [],
        redactionSummary: { count, categories }
      };
    },
    sendToServer: (payload: any) => {
      const check = rawSanitizer.outboundCheck(payload);
      if (!check.safe) {
        return Promise.resolve({
          status: 403,
          ok: false,
          body: {
            error: 'TRANSMISSION_BLOCKED: Sensitive PII detected in outbound payload',
            leaks: check.leaks,
            action: { action_type: 'none', reasoning: 'Transmission blocked by privacy gate' },
            task_status: 'blocked'
          }
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        body: {
          session_id: payload.session_id || 'ss-test',
          action: { action_type: 'none', target_element_id: null, value: null, reasoning: 'Mock success' },
          task_status: 'in_progress'
        }
      });
    },
    receiveServerCommand: (response: any, sentElements?: any[]) => {
      const body = response.body || response;
      const errors: string[] = [];
      const actionObj = body.action || {};
      let rawActionType = String(actionObj.action_type || body.action || 'none').toUpperCase();

      if (rawActionType === 'WAIT' || rawActionType === 'DONE' || rawActionType === 'NONE') {
        rawActionType = 'NONE';
      }

      const VALID_SET = new Set(['CLICK', 'TYPE', 'SCROLL', 'SELECT', 'NONE']);
      if (!VALID_SET.has(rawActionType)) {
        errors.push(`Unknown action type: "${rawActionType}"`);
      }

      const targetId = actionObj.target_element_id || body.targetSelector || null;
      if (rawActionType !== 'NONE' && targetId && sentElements && Array.isArray(sentElements)) {
        const found = sentElements.some((el: any) => String(el.id) === String(targetId) || String(el.dom_selector) === String(targetId));
        if (!found) {
          errors.push(`Hallucinated target element ID: "${targetId}" is not in current screen elements`);
        }
      }

      if (errors.length > 0) {
        return {
          valid: false,
          errors,
          command: {
            action: 'NONE',
            targetSelector: null,
            confidence: 0,
            reasoning: 'Rejected unsafe command: ' + errors.join('; ')
          }
        };
      }

      return {
        valid: true,
        errors: [],
        command: {
          action: rawActionType,
          targetSelector: targetId,
          value: actionObj.value || null,
          confidence: 1.0,
          reasoning: actionObj.reasoning || '',
          task_status: body.task_status || 'in_progress'
        }
      };
    }
  };
}

export const Person1Bridge = {
  SensitivityDetector: rawDetector,
  RedactionEngine: rawRedactionEngine,
  Sanitizer: rawSanitizer,
  ServerAdapter: rawServerAdapter
};
