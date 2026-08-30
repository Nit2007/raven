import { BoundingBox, DetectionResult } from '../../schema/detection.js';

export interface RawOcrWord {
  text: string;
  bbox: BoundingBox;
  confidence: number;
}

export type PiiCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'PAYMENT_CARD'
  | 'GOVERNMENT_ID'
  | 'PERSON_NAME'
  | 'ADDRESS'
  | 'PASSWORD'
  | 'UNKNOWN';

export interface PiiDetectionMetadata {
  category: PiiCategory;
  piiType: PiiCategory; // Backward compatibility with DetectionResult metadata
  text: string;
  evidence: string[];
  detector: string;
  coordinateSpace: 'SCREENSHOT';
  [key: string]: unknown;
}

export class PiiCandidateDetector {
  // Deterministic Pattern Regexes
  private static readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
  private static readonly PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{4,5}\b/;
  private static readonly LOCAL_PHONE_REGEX = /\b(?:\+\d{1,3}[-.\s]?)?[6-9]\d{2,4}[-.\s]?\d{3,5}[-.\s]?\d{3,4}\b|\b(?:\+\d{1,3}[-.\s]?)?[6-9]\d{9}\b/;
  private static readonly PAN_REGEX = /\b[A-Z]{5}\d{4}[A-Z]{1}\b/;
  private static readonly AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
  private static readonly SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
  private static readonly SECRET_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36})\b/;

  // Suppressive Context Words (False Positive Protectors)
  private static readonly NON_PHONE_CONTEXT_REGEX = /\b(?:order|product|item|version|room|price|cost|id|sku|code|ref|ref#|#)\b/i;

  /**
   * Main entry point for Local PII Candidate Detection.
   * Scans OCR words, evaluates single and multi-token spatial sequences, patterns, context, and bounding boxes.
   */
  public detectPiiFromOcr(ocrResults: RawOcrWord[]): DetectionResult[] {
    const detections: DetectionResult[] = [];
    if (!ocrResults || ocrResults.length === 0) return detections;

    let idCounter = 1;

    for (let i = 0; i < ocrResults.length; i++) {
      const item = ocrResults[i];
      const text = item.text.trim();
      if (!text) continue;

      const nearbyContextText = this.getNearbyContextText(ocrResults, i);

      // Check 1: EMAIL Detection
      if (PiiCandidateDetector.EMAIL_REGEX.test(text)) {
        const hasLabel = /\b(?:email|mail|contact)\b/i.test(nearbyContextText);
        const evidence = ['EMAIL_PATTERN'];
        if (hasLabel) evidence.push('EMAIL_LABEL_CONTEXT');

        const confidence = Math.min(0.99, Math.max(0.85, item.confidence * (hasLabel ? 1.05 : 0.98)));

        detections.push(this.createDetection(
          idCounter++,
          'EMAIL',
          text,
          item.bbox,
          confidence,
          evidence
        ));
        continue;
      }

      // Check 2: International PHONE Detection (If text starts with '+')
      if (text.startsWith('+')) {
        const phoneSeq = this.tryExtractMultiTokenPhone(ocrResults, i);
        if (phoneSeq) {
          const hasPhoneLabel = /\b(?:phone|mobile|tel|cell|call|contact|whatsapp)\b/i.test(nearbyContextText);
          const hasNonPhoneLabel = PiiCandidateDetector.NON_PHONE_CONTEXT_REGEX.test(nearbyContextText);

          if (!hasNonPhoneLabel || hasPhoneLabel) {
            const evidence = ['PHONE_PATTERN'];
            if (phoneSeq.tokenCount > 1) evidence.push('MULTI_TOKEN_SPATIAL_GROUPING');
            if (hasPhoneLabel) evidence.push('PHONE_LABEL_CONTEXT');

            let confidence = phoneSeq.avgConfidence * (hasPhoneLabel ? 1.05 : 0.88);
            if (hasNonPhoneLabel && !hasPhoneLabel) confidence *= 0.40;

            if (confidence >= 0.70 && (!hasNonPhoneLabel || hasPhoneLabel)) {
              detections.push(this.createDetection(
                idCounter++,
                'PHONE',
                phoneSeq.combinedText,
                phoneSeq.mergedBBox,
                Math.min(0.99, confidence),
                evidence
              ));
              i += (phoneSeq.tokenCount - 1);
              continue;
            }
          }
        }
      }

      // Check 3: PAYMENT CARD Detection (13-19 digits, strictly numeric without '+' prefix, Luhn check)
      const cardSeq = this.tryExtractMultiTokenCard(ocrResults, i);
      if (cardSeq) {
        const isLuhnValid = this.luhnCheck(cardSeq.cleanDigits);
        const hasCardLabel = /\b(?:card|credit|debit|visa|mastercard|amex)\b/i.test(nearbyContextText);

        if (isLuhnValid || hasCardLabel) {
          const evidence = ['CARD_PATTERN'];
          if (cardSeq.tokenCount > 1) evidence.push('MULTI_TOKEN_SPATIAL_GROUPING');
          if (isLuhnValid) evidence.push('LUHN_CHECKSUM_VALID');
          if (hasCardLabel) evidence.push('CARD_LABEL_CONTEXT');

          const confidence = Math.min(0.99, Math.max(0.85, cardSeq.avgConfidence * (isLuhnValid ? 1.05 : 0.90)));

          detections.push(this.createDetection(
            idCounter++,
            'PAYMENT_CARD',
            cardSeq.combinedText,
            cardSeq.mergedBBox,
            confidence,
            evidence
          ));
          i += (cardSeq.tokenCount - 1);
          continue;
        }
      }

      // Check 4: Local / National PHONE Detection (Non '+' prefix phone numbers)
      const phoneSeq = this.tryExtractMultiTokenPhone(ocrResults, i);
      if (phoneSeq) {
        const hasPhoneLabel = /\b(?:phone|mobile|tel|cell|call|contact|whatsapp)\b/i.test(nearbyContextText);
        const hasNonPhoneLabel = PiiCandidateDetector.NON_PHONE_CONTEXT_REGEX.test(nearbyContextText);

        if (!hasNonPhoneLabel || hasPhoneLabel) {
          const evidence = ['PHONE_PATTERN'];
          if (phoneSeq.tokenCount > 1) evidence.push('MULTI_TOKEN_SPATIAL_GROUPING');
          if (hasPhoneLabel) evidence.push('PHONE_LABEL_CONTEXT');

          let confidence = phoneSeq.avgConfidence * (hasPhoneLabel ? 1.05 : 0.88);
          if (hasNonPhoneLabel && !hasPhoneLabel) confidence *= 0.40;

          if (confidence >= 0.70 && (!hasNonPhoneLabel || hasPhoneLabel)) {
            detections.push(this.createDetection(
              idCounter++,
              'PHONE',
              phoneSeq.combinedText,
              phoneSeq.mergedBBox,
              Math.min(0.99, confidence),
              evidence
            ));
            i += (phoneSeq.tokenCount - 1);
            continue;
          }
        }
      }

      // Check 5: GOVERNMENT ID Detection (PAN / SSN / Aadhaar)
      if (PiiCandidateDetector.PAN_REGEX.test(text)) {
        detections.push(this.createDetection(
          idCounter++,
          'GOVERNMENT_ID',
          text,
          item.bbox,
          Math.min(0.99, item.confidence * 0.98),
          ['PAN_CARD_PATTERN']
        ));
        continue;
      }

      if (PiiCandidateDetector.SSN_REGEX.test(text)) {
        detections.push(this.createDetection(
          idCounter++,
          'GOVERNMENT_ID',
          text,
          item.bbox,
          Math.min(0.99, item.confidence * 0.98),
          ['SSN_PATTERN']
        ));
        continue;
      }

      const aadhaarSeq = this.tryExtractMultiTokenAadhaar(ocrResults, i);
      if (aadhaarSeq) {
        const hasAadhaarLabel = /\b(?:aadhaar|uid|govt|identity)\b/i.test(nearbyContextText);
        if (hasAadhaarLabel) {
          detections.push(this.createDetection(
            idCounter++,
            'GOVERNMENT_ID',
            aadhaarSeq.combinedText,
            aadhaarSeq.mergedBBox,
            Math.min(0.99, aadhaarSeq.avgConfidence * 1.02),
            ['AADHAAR_PATTERN', 'GOVT_ID_LABEL_CONTEXT']
          ));
          i += (aadhaarSeq.tokenCount - 1);
          continue;
        }
      }

      // Check 6: PERSON NAME Detection (Label Context Driven)
      const hasNameLabel = /\b(?:name|user|customer|patient)\b/i.test(nearbyContextText);
      if (hasNameLabel && /^[A-Z][a-z]+$/.test(text) && text !== 'Name' && text !== 'User') {
        let combinedText = text;
        let combinedBBox = { ...item.bbox };
        let consumedCount = 1;
        if (i + 1 < ocrResults.length) {
          const nextText = ocrResults[i + 1].text.trim();
          if (/^[A-Z][a-z]+$/.test(nextText)) {
            combinedText = `${text} ${nextText}`;
            combinedBBox = this.mergeBoundingBoxes(item.bbox, ocrResults[i + 1].bbox);
            consumedCount = 2;
          }
        }

        detections.push(this.createDetection(
          idCounter++,
          'PERSON_NAME',
          combinedText,
          combinedBBox,
          Math.min(0.98, Math.max(0.85, item.confidence * 0.95)),
          ['NAME_LABEL_CONTEXT', 'CAPITALIZED_NAME_PATTERN']
        ));
        i += (consumedCount - 1);
        continue;
      }

      // Check 7: ADDRESS Detection (Context Driven)
      const hasAddressLabel = /\b(?:address|street|city|pin|zip|state)\b/i.test(nearbyContextText);
      if (hasAddressLabel && text.length >= 3 && !/^(address|street|city|zip)$/i.test(text)) {
        detections.push(this.createDetection(
          idCounter++,
          'ADDRESS',
          text,
          item.bbox,
          Math.min(0.95, item.confidence * 0.88),
          ['ADDRESS_LABEL_CONTEXT']
        ));
        continue;
      }

      // Check 8: PASSWORD / SECRET Detection
      const hasPasswordLabel = /\b(?:password|passcode|secret|token|api[_\s]?key)\b/i.test(nearbyContextText);
      const isSecretKey = PiiCandidateDetector.SECRET_KEY_REGEX.test(text);

      if (hasPasswordLabel || isSecretKey) {
        const evidence = [];
        if (isSecretKey) evidence.push('API_SECRET_PATTERN');
        if (hasPasswordLabel) evidence.push('PASSWORD_LABEL_CONTEXT');

        detections.push(this.createDetection(
          idCounter++,
          'PASSWORD',
          text,
          item.bbox,
          Math.min(0.99, isSecretKey ? 0.99 : item.confidence * 0.95),
          evidence
        ));
        continue;
      }
    }

    // 2. Spatial Deduplication
    return this.deduplicateCandidates(detections);
  }

  /**
   * Evaluates spatially adjacent OCR tokens for multi-token phone numbers (e.g. +91 733 961 3670, +91 99444 90004, +92 318 9664771, +39 339 214 9566).
   */
  private tryExtractMultiTokenPhone(
    words: RawOcrWord[],
    startIndex: number
  ): { combinedText: string; mergedBBox: BoundingBox; avgConfidence: number; tokenCount: number } | null {
    const firstWord = words[startIndex];
    const firstText = firstWord.text.trim();
    if (!/^(\+|\d)/.test(firstText)) return null;
    const cleanFirstDigits = firstText.replace(/[^0-9]/g, '');

    // Single token phone check (must be 10-12 digits or start with + and 10+ digits)
    const isSingleMatch = (PiiCandidateDetector.PHONE_REGEX.test(firstText) || PiiCandidateDetector.LOCAL_PHONE_REGEX.test(firstText)) && cleanFirstDigits.length >= 10 && cleanFirstDigits.length <= 13;
    if (isSingleMatch) {
      return {
        combinedText: firstText,
        mergedBBox: { ...firstWord.bbox },
        avgConfidence: firstWord.confidence,
        tokenCount: 1
      };
    }

    // Evaluate up to 4 contiguous spatially adjacent tokens
    let combinedStr = firstText;
    let mergedBox = { ...firstWord.bbox };
    let confSum = firstWord.confidence;
    const maxLookahead = Math.min(words.length - startIndex, 4);

    for (let count = 2; count <= maxLookahead; count++) {
      const nextWord = words[startIndex + count - 1];
      const prevWord = words[startIndex + count - 2];
      const nextText = nextWord.text.trim();

      const dy = Math.abs(nextWord.bbox.y - prevWord.bbox.y);
      const dx = nextWord.bbox.x - (prevWord.bbox.x + prevWord.bbox.width);
      if (dy > 20 || dx > 65) break;

      combinedStr += ' ' + nextText;
      mergedBox = this.mergeBoundingBoxes(mergedBox, nextWord.bbox);
      confSum += nextWord.confidence;

      const cleanDigits = combinedStr.replace(/[^0-9]/g, '');
      const isMultiMatch = (PiiCandidateDetector.PHONE_REGEX.test(combinedStr) || PiiCandidateDetector.LOCAL_PHONE_REGEX.test(combinedStr)) && cleanDigits.length >= 10 && cleanDigits.length <= 13;

      if (isMultiMatch) {
        return {
          combinedText: combinedStr,
          mergedBBox: mergedBox,
          avgConfidence: confSum / count,
          tokenCount: count
        };
      }
    }

    return null;
  }

  /**
   * Evaluates spatially adjacent OCR tokens for multi-token payment cards (e.g. 4111 1111 1111 1111).
   * Strictly rejects any text containing a '+' country code prefix.
   */
  private tryExtractMultiTokenCard(
    words: RawOcrWord[],
    startIndex: number
  ): { combinedText: string; cleanDigits: string; mergedBBox: BoundingBox; avgConfidence: number; tokenCount: number } | null {
    const firstWord = words[startIndex];
    const firstText = firstWord.text.trim();

    // Rejection rule: Payment cards NEVER start with a '+' prefix
    if (firstText.startsWith('+')) return null;

    let combinedStr = firstText;
    let mergedBox = { ...firstWord.bbox };
    let confSum = firstWord.confidence;
    let cleanDigits = firstText.replace(/[-\s]/g, '');

    if (!/^\d+$/.test(cleanDigits)) return null;

    if (/^\d{13,19}$/.test(cleanDigits)) {
      return { combinedText: firstText, cleanDigits, mergedBBox: mergedBox, avgConfidence: firstWord.confidence, tokenCount: 1 };
    }

    const maxLookahead = Math.min(words.length - startIndex, 5);
    for (let count = 2; count <= maxLookahead; count++) {
      const nextWord = words[startIndex + count - 1];
      const prevWord = words[startIndex + count - 2];
      const nextText = nextWord.text.trim();

      if (nextText.startsWith('+')) break;

      const dy = Math.abs(nextWord.bbox.y - prevWord.bbox.y);
      const dx = nextWord.bbox.x - (prevWord.bbox.x + prevWord.bbox.width);
      if (dy > 20 || dx > 60) break;

      combinedStr += ' ' + nextText;
      mergedBox = this.mergeBoundingBoxes(mergedBox, nextWord.bbox);
      confSum += nextWord.confidence;
      cleanDigits = combinedStr.replace(/[-\s]/g, '');

      if (!/^\d+$/.test(cleanDigits)) break;

      if (/^\d{13,19}$/.test(cleanDigits)) {
        return { combinedText: combinedStr, cleanDigits, mergedBBox: mergedBox, avgConfidence: confSum / count, tokenCount: count };
      }
    }

    return null;
  }

  /**
   * Evaluates spatially adjacent OCR tokens for Aadhaar numbers (e.g. 1234 5678 9012).
   */
  private tryExtractMultiTokenAadhaar(
    words: RawOcrWord[],
    startIndex: number
  ): { combinedText: string; mergedBBox: BoundingBox; avgConfidence: number; tokenCount: number } | null {
    const firstWord = words[startIndex];
    const firstText = firstWord.text.trim();

    if (PiiCandidateDetector.AADHAAR_REGEX.test(firstText)) {
      return { combinedText: firstText, mergedBBox: { ...firstWord.bbox }, avgConfidence: firstWord.confidence, tokenCount: 1 };
    }

    if (startIndex + 2 < words.length) {
      const w2 = words[startIndex + 1];
      const w3 = words[startIndex + 2];
      const combined = `${firstText} ${w2.text.trim()} ${w3.text.trim()}`;
      if (PiiCandidateDetector.AADHAAR_REGEX.test(combined)) {
        const merged = this.mergeBoundingBoxes(this.mergeBoundingBoxes(firstWord.bbox, w2.bbox), w3.bbox);
        return { combinedText: combined, mergedBBox: merged, avgConfidence: (firstWord.confidence + w2.confidence + w3.confidence) / 3, tokenCount: 3 };
      }
    }

    return null;
  }

  /**
   * Scans spatial neighborhood for contextual label words.
   */
  private getNearbyContextText(words: RawOcrWord[], targetIndex: number): string {
    const target = words[targetIndex];
    const contextWords: string[] = [];

    const start = Math.max(0, targetIndex - 4);
    for (let j = start; j < targetIndex; j++) {
      const prev = words[j];
      const dy = Math.abs(prev.bbox.y - target.bbox.y);
      const dx = target.bbox.x - (prev.bbox.x + prev.bbox.width);
      if (dy <= 30 && dx <= 250) {
        contextWords.push(prev.text);
      }
    }

    return contextWords.join(' ');
  }

  /**
   * Validates credit card digits using Luhn algorithm.
   */
  private luhnCheck(cardNumberStr: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let i = cardNumberStr.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumberStr.charAt(i), 10);
      if (isNaN(digit)) return false;
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * Merges two bounding boxes into a single bounding box.
   */
  private mergeBoundingBoxes(b1: BoundingBox, b2: BoundingBox): BoundingBox {
    const xMin = Math.min(b1.x, b2.x);
    const yMin = Math.min(b1.y, b2.y);
    const xMax = Math.max(b1.x + b1.width, b2.x + b2.width);
    const yMax = Math.max(b1.y + b1.height, b2.y + b2.height);
    return {
      x: xMin,
      y: yMin,
      width: xMax - xMin,
      height: yMax - yMin
    };
  }

  /**
   * Deduplicates identical candidate values or highly overlapping spatial boxes.
   */
  private deduplicateCandidates(detections: DetectionResult[]): DetectionResult[] {
    const result: DetectionResult[] = [];
    const seenKeys = new Set<string>();

    for (const det of detections) {
      const meta = det.metadata as PiiDetectionMetadata;
      const key = `${meta.category}_${meta.text}_${det.bbox.x}_${det.bbox.y}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push(det);
      }
    }

    return result;
  }

  /**
   * Factory method constructing a DetectionResult conforming strictly to DETECTION_SCHEMA.md.
   */
  private createDetection(
    index: number,
    category: PiiCategory,
    text: string,
    bbox: BoundingBox,
    confidence: number,
    evidence: string[]
  ): DetectionResult {
    return {
      id: `det_pii_${Date.now()}_${index}`,
      type: 'PII_CANDIDATE',
      source: 'pii',
      bbox: { ...bbox },
      confidence: Math.round(confidence * 100) / 100,
      metadata: {
        category,
        piiType: category, // Backward compatibility
        text,
        evidence,
        detector: 'pii-detector-v2-layered',
        coordinateSpace: 'SCREENSHOT'
      }
    };
  }
}
