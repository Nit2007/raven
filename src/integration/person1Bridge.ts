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

// 3. Sanitizer Implementation / Bridge (Bypasses native Chrome window.Sanitizer collision)
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
      const text = (payload.elements || [])
        .map((e: any) => [e.value, e.visibleText].filter(Boolean).join(' '))
        .join(' ');

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
      let count = 0;
      const categories: Record<string, number> = {};
      const elements = (sanitizedPayload.elements || []).map((el: any) => {
        if (el.redacted) {
          count++;
          const cat = el.ruleCategory || 'PII';
          categories[cat] = (categories[cat] || 0) + 1;
        }
        return el;
      });

      return {
        version: '1.0.0',
        sessionId: 'ss-' + Date.now().toString(36),
        timestamp: new Date().toISOString(),
        url_hash: 'localhost',
        task: taskContext || '',
        elements,
        redactionSummary: { count, categories }
      };
    },
    sendToServer: (payload: any) => {
      const check = rawSanitizer.outboundCheck(payload);
      if (!check.safe) {
        return Promise.resolve({
          status: 403,
          ok: false,
          body: { error: 'TRANSMISSION_BLOCKED: Sensitive PII detected in outbound payload', leaks: check.leaks }
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        body: { requestId: 'mock-' + Date.now(), action: 'NONE', confidence: 0 }
      });
    }
  };
}

export const Person1Bridge = {
  SensitivityDetector: rawDetector,
  RedactionEngine: rawRedactionEngine,
  Sanitizer: rawSanitizer,
  ServerAdapter: rawServerAdapter
};
