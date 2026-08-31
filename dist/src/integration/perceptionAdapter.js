export class PerceptionAdapter {
    /**
     * Calculates Intersection over Union (IoU) between two bounding boxes.
     */
    static calculateIoU(boxA, boxB) {
        const xA = Math.max(boxA.x, boxB.x);
        const yA = Math.max(boxA.y, boxB.y);
        const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
        const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
        const interWidth = Math.max(0, xB - xA);
        const interHeight = Math.max(0, yB - yA);
        const interArea = interWidth * interHeight;
        const areaA = boxA.width * boxA.height;
        const areaB = boxB.width * boxB.height;
        const unionArea = areaA + areaB - interArea;
        return unionArea > 0 ? interArea / unionArea : 0;
    }
    /**
     * Checks if boxA spatial region contains or overlaps boxB center.
     */
    static boxesOverlap(boxA, boxB) {
        if (!boxA || !boxB)
            return false;
        const iou = PerceptionAdapter.calculateIoU(boxA, boxB);
        if (iou > 0.1)
            return true;
        // Center point inside check
        const centerX = boxB.x + boxB.width / 2;
        const centerY = boxB.y + boxB.height / 2;
        return (centerX >= boxA.x &&
            centerX <= boxA.x + boxA.width &&
            centerY >= boxA.y &&
            centerY <= boxA.y + boxA.height);
    }
    /**
     * Fuses Person 2's UnifiedPerceptionResult into Person 1's DOM element list.
     * Modifies/enriches matching DOM elements and appends canvas/visual-only detections.
     */
    static mergePerceptionWithDOM(domElements, perceptionResult) {
        const mergedElements = [...domElements];
        if (!perceptionResult || !perceptionResult.detections) {
            return mergedElements;
        }
        for (const det of perceptionResult.detections) {
            if (det.type === 'PII_CANDIDATE') {
                const piiCategory = (det.metadata?.category || 'PERSONAL_DATA').toUpperCase();
                const piiToken = `[${piiCategory}]`;
                const detText = (det.metadata?.text || '').trim();
                let matched = false;
                // Try to match with existing DOM elements spatially or by text
                for (const el of mergedElements) {
                    const elText = ((el.visibleText || '') + ' ' + (el.value || '')).trim();
                    const spatialMatch = el.boundingBox ? PerceptionAdapter.boxesOverlap(det.bbox, el.boundingBox) : false;
                    const textMatch = detText.length > 0 && elText.length > 0 && elText.includes(detText);
                    if (spatialMatch || textMatch) {
                        el.sensitivity = det.confidence >= 0.80 ? 'HIGH_CONFIDENCE_PII' : 'LOW_CONFIDENCE_PII';
                        el.confidence = Math.max(el.confidence || 0, det.confidence);
                        el.ruleToken = piiToken;
                        el.ruleId = `person2-pii-${det.id}`;
                        el.ruleCategory = piiCategory;
                        el.source = 'PERSON2_LOCAL_PII';
                        el.reason = `Person 2 Local PII Detector (${piiCategory})`;
                        matched = true;
                    }
                }
                // If no matching DOM element exists (e.g. Canvas or scanned image text), add visual PII element
                if (!matched) {
                    mergedElements.push({
                        tag: 'visual-ocr-pii',
                        role: 'text',
                        visibleText: detText || piiToken,
                        value: detText,
                        boundingBox: det.bbox,
                        interactive: false,
                        sensitivity: det.confidence >= 0.80 ? 'HIGH_CONFIDENCE_PII' : 'LOW_CONFIDENCE_PII',
                        confidence: det.confidence,
                        ruleToken: piiToken,
                        ruleId: `person2-pii-${det.id}`,
                        ruleCategory: piiCategory,
                        source: 'PERSON2_LOCAL_PERCEPTION',
                        reason: `Person 2 OCR PII Candidate (${piiCategory})`
                    });
                }
            }
            else if (det.type === 'FACE') {
                mergedElements.push({
                    tag: 'visual-face',
                    role: 'image',
                    visibleText: '[FACE_REGION]',
                    boundingBox: det.bbox,
                    interactive: false,
                    sensitivity: 'HIGH_CONFIDENCE_PII',
                    confidence: det.confidence,
                    ruleToken: '[FACE]',
                    ruleId: `person2-face-${det.id}`,
                    ruleCategory: 'BIOMETRIC_FACE',
                    source: 'PERSON2_BLAZEFACE',
                    reason: 'Person 2 BlazeFace Visual Detector'
                });
            }
            else if (det.type === 'VISUAL_REGION') {
                const cat = (det.metadata?.category || 'VISUAL_DOCUMENT').toUpperCase();
                mergedElements.push({
                    tag: 'visual-document',
                    role: 'image',
                    visibleText: `[${cat}]`,
                    boundingBox: det.bbox,
                    interactive: false,
                    sensitivity: 'HIGH_CONFIDENCE_PII',
                    confidence: det.confidence,
                    ruleToken: `[${cat}]`,
                    ruleId: `person2-vis-${det.id}`,
                    ruleCategory: 'SENSITIVE_DOCUMENT',
                    source: 'PERSON2_VISUAL_DETECTOR',
                    reason: `Person 2 Visual Document Detector (${cat})`
                });
            }
        }
        return mergedElements;
    }
}
