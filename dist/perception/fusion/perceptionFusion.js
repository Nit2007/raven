export class PerceptionFusionEngine {
    /**
     * Computes Intersection over Union (IoU) between two bounding boxes.
     */
    static computeIoU(a, b) {
        const xMin = Math.max(a.x, b.x);
        const yMin = Math.max(a.y, b.y);
        const xMax = Math.min(a.x + a.width, b.x + b.width);
        const yMax = Math.min(a.y + a.height, b.y + b.height);
        const intersectionWidth = Math.max(0, xMax - xMin);
        const intersectionHeight = Math.max(0, yMax - yMin);
        const intersectionArea = intersectionWidth * intersectionHeight;
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        const unionArea = areaA + areaB - intersectionArea;
        if (unionArea <= 0)
            return 0;
        return intersectionArea / unionArea;
    }
    /**
     * Fuses multi-source detection arrays (Face, OCR, PII, Vision) into a single deduplicated list.
     * Priority: PII_CANDIDATE > FACE > VISUAL_REGION > OCR_TEXT
     */
    fuseDetections(detectionGroups, iouThreshold = 0.5) {
        const allDetections = detectionGroups.flat();
        if (allDetections.length === 0)
            return [];
        // Sort by priority and confidence
        const typePriority = {
            PII_CANDIDATE: 4,
            FACE: 3,
            VISUAL_REGION: 2,
            OCR_TEXT: 1
        };
        allDetections.sort((a, b) => {
            const prioDiff = (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
            if (prioDiff !== 0)
                return prioDiff;
            return b.confidence - a.confidence;
        });
        const fused = [];
        const suppressed = new Set();
        for (let i = 0; i < allDetections.length; i++) {
            const current = allDetections[i];
            if (suppressed.has(current.id))
                continue;
            fused.push(current);
            for (let j = i + 1; j < allDetections.length; j++) {
                const candidate = allDetections[j];
                if (suppressed.has(candidate.id))
                    continue;
                const iou = PerceptionFusionEngine.computeIoU(current.bbox, candidate.bbox);
                if (iou >= iouThreshold) {
                    // Suppress lower priority overlapping box
                    suppressed.add(candidate.id);
                }
            }
        }
        return fused;
    }
}
