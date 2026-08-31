/**
 * PageFingerprint — Lightweight deterministic page state fingerprinting.
 *
 * Used to detect meaningful browser transitions and evaluate action causality.
 * STRICT PRIVACY GUARANTEE: Never includes raw sensitive values or PII.
 */
export function createPageFingerprint(sanitizedPageState) {
    if (!sanitizedPageState) {
        return {
            fingerprint: 'fp_empty',
            navigationKey: 'nav_empty',
            elementSignatureHash: 'hash_empty'
        };
    }
    // 1. Normalized URL & Navigation Key
    const rawUrl = sanitizedPageState.url || 'http://localhost';
    let normalizedUrl = rawUrl;
    try {
        const parsed = new URL(rawUrl);
        normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    }
    catch (_) {
        normalizedUrl = rawUrl.split('?')[0].split('#')[0];
    }
    const navigationKey = simpleHash(normalizedUrl);
    // 2. Safe Structural Elements Extraction (EXCLUDING PII/sensitive values)
    const elements = sanitizedPageState.elements || [];
    const safeSignatures = [];
    elements.forEach((el) => {
        // Skip redacted or sensitive elements from fingerprint content calculation
        if (el.redacted || (el.sensitivity && el.sensitivity !== 'SAFE')) {
            safeSignatures.push(`[REDACTED_EL:${el.tag || 'el'}:${el.role || ''}]`);
            return;
        }
        const tag = String(el.tag || el.type || '').toLowerCase();
        const role = String(el.role || '').toLowerCase();
        const id = String(el.id || '').toLowerCase();
        const name = String(el.name || '').toLowerCase();
        // Extract safe label/text (filter out potential unrecognized sensitive strings)
        let safeText = String(el.visibleText || el.text || el.labelText || el.placeholder || '').trim();
        if (isPotentialPii(safeText)) {
            safeText = '[SAFE_MASKED]';
        }
        else {
            safeText = safeText.slice(0, 30).toLowerCase();
        }
        safeSignatures.push(`${tag}:${role}:${id}:${name}:${safeText}`);
    });
    const title = String(sanitizedPageState.title || 'page').toLowerCase().slice(0, 50);
    const elementSignatureHash = simpleHash(safeSignatures.join('|'));
    const fingerprint = `fp_${navigationKey}_${elementSignatureHash}_${simpleHash(title)}`;
    console.log(`[RAVEN:FINGERPRINT] generated: ${fingerprint}`, {
        navigationKey,
        elementCount: elements.length
    });
    return {
        fingerprint,
        navigationKey,
        elementSignatureHash
    };
}
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
function isPotentialPii(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    if (lower.includes('@') && lower.includes('.'))
        return true; // Email
    if (/(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/.test(text))
        return true; // Phone
    if (/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b|\b\d{13,19}\b/.test(text))
        return true; // Card
    if (/\b\d{12}\b|\b\d{4}\s\d{4}\s\d{4}\b/.test(text))
        return true; // Aadhaar
    return false;
}
