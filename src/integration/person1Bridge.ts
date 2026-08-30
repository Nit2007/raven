import { ElementInfo } from './perceptionAdapter.js';

// Person 1 Global Module Wrappers (Evaluated safely in both Extension and Node environments)
let _SensitivityDetector: any = (globalThis as any).SensitivityDetector;
let _RedactionEngine: any = (globalThis as any).RedactionEngine;
let _Sanitizer: any = (globalThis as any).Sanitizer;
let _ServerAdapter: any = (globalThis as any).ServerAdapter;

// If not present in globalThis (e.g. inside browser extension popup bundle), load built-in fallback implementations
if (!_SensitivityDetector) {
  _SensitivityDetector = (window as any).SensitivityDetector || {
    classifyElements: (elements: ElementInfo[]) => {
      return elements.map(el => {
        const text = [el.name, el.id, el.placeholder, el.labelText, el.visibleText, el.value, el.type].filter(Boolean).join(' ').toLowerCase();
        let cat = '';
        let tok = '';
        let conf = 0;

        if (el.type === 'email' || text.includes('email') || /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text)) {
          cat = 'EMAIL'; tok = '[EMAIL]'; conf = 0.95;
        } else if (el.type === 'tel' || text.includes('phone') || text.includes('mobile') || text.includes('tel') || /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/.test(text)) {
          cat = 'PHONE'; tok = '[PHONE]'; conf = 0.90;
        } else if (text.includes('card') || text.includes('credit') || text.includes('cvv') || /\b(?:\d[\s\-]?){13,19}\b/.test(text)) {
          cat = 'CARD'; tok = '[CARD]'; conf = 0.95;
        } else if (text.includes('name') || text.includes('user') || text.includes('fullname')) {
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
            source: 'REGEX',
            reason: `DOM ${cat} Detection`
          };
        }
        return { ...el, sensitivity: 'SAFE', confidence: 0, ruleToken: null, source: null };
      });
    }
  };
}

if (!_RedactionEngine) {
  _RedactionEngine = (window as any).RedactionEngine || {
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

if (!_Sanitizer) {
  _Sanitizer = (window as any).Sanitizer || {
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
        /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
        /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/,
        /\b(?:\d[\s\-]?){13,19}\b/
      ];

      const leaks: string[] = [];
      for (const pat of leakPatterns) {
        const match = text.match(pat);
        if (match) {
          leaks.push(`PII match: "${match[0]}"`);
        }
      }
      return { safe: leaks.length === 0, leaks };
    }
  };
}

if (!_ServerAdapter) {
  _ServerAdapter = (window as any).ServerAdapter || {
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
      const check = _Sanitizer.outboundCheck(payload);
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
  SensitivityDetector: _SensitivityDetector,
  RedactionEngine: _RedactionEngine,
  Sanitizer: _Sanitizer,
  ServerAdapter: _ServerAdapter
};
