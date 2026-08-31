export class PiiCandidateDetector {
    // Regex patterns for common PII candidates
    static EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    static PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    static CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
    static SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
    static SECRET_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36})\b/g;
    /**
     * Scans recognized OCR words/text blocks for PII candidate patterns.
     */
    detectPiiFromOcr(ocrResults) {
        const detections = [];
        let counter = 1;
        for (const wordItem of ocrResults) {
            const text = wordItem.text.trim();
            if (!text)
                continue;
            let piiType = null;
            let confidence = wordItem.confidence;
            if (PiiCandidateDetector.EMAIL_REGEX.test(text)) {
                piiType = 'EMAIL';
                confidence = Math.min(1.0, confidence * 1.0);
            }
            else if (PiiCandidateDetector.PHONE_REGEX.test(text)) {
                piiType = 'PHONE';
                confidence = Math.min(1.0, confidence * 0.95);
            }
            else if (PiiCandidateDetector.CREDIT_CARD_REGEX.test(text.replace(/[-\s]/g, ''))) {
                piiType = 'CREDIT_CARD';
                confidence = Math.min(1.0, confidence * 0.98);
            }
            else if (PiiCandidateDetector.SSN_REGEX.test(text)) {
                piiType = 'SSN';
                confidence = Math.min(1.0, confidence * 0.99);
            }
            else if (PiiCandidateDetector.SECRET_KEY_REGEX.test(text)) {
                piiType = 'PASSWORD';
                confidence = 1.0;
            }
            if (piiType) {
                detections.push({
                    id: `det_pii_${Date.now()}_${counter++}`,
                    type: 'PII_CANDIDATE',
                    source: 'pii',
                    bbox: { ...wordItem.bbox },
                    confidence,
                    metadata: {
                        text,
                        piiType,
                        detector: 'regex-heuristic-v1'
                    }
                });
            }
        }
        return detections;
    }
}
