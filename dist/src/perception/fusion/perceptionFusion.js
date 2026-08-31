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
     * Validates and clamps a bounding box to SCREENSHOT dimensions.
     * x >= 0, y >= 0, x + width <= screenshotWidth, y + height <= screenshotHeight.
     */
    static validateAndClampBBox(bbox, imgWidth, imgHeight) {
        const clampedX = Math.max(0, Math.min(bbox.x, imgWidth));
        const clampedY = Math.max(0, Math.min(bbox.y, imgHeight));
        const maxW = Math.max(0, imgWidth - clampedX);
        const maxH = Math.max(0, imgHeight - clampedY);
        const clampedW = Math.max(0, Math.min(bbox.width, maxW));
        const clampedH = Math.max(0, Math.min(bbox.height, maxH));
        return {
            x: clampedX,
            y: clampedY,
            width: clampedW,
            height: clampedH
        };
    }
    /**
     * Fuses multi-source detection arrays (Face, OCR, PII, Vision) into a single deduplicated list.
     * Priority: PII_CANDIDATE > FACE > VISUAL_REGION > OCR_TEXT
     * Deduplication preserves distinct detection types and nearby distinct text values.
     */
    fuseDetections(detectionGroups, imgWidthOrIou = 1920, imgHeight = 1080, iouThreshold = 0.5) {
        let imgW = imgWidthOrIou;
        let iouThresh = iouThreshold;
        if (imgWidthOrIou > 0 && imgWidthOrIou <= 1.0) {
            iouThresh = imgWidthOrIou;
            imgW = 1920;
        }
        const rawAll = detectionGroups.flat();
        if (rawAll.length === 0)
            return [];
        // 1. Validate & clamp coordinates for all input detections
        const allDetections = rawAll.map(det => ({
            ...det,
            bbox: PerceptionFusionEngine.validateAndClampBBox(det.bbox, imgW, imgHeight)
        }));
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
                if (current.type === candidate.type && iou >= iouThresh) {
                    const currentText = (current.metadata?.text || '').trim();
                    const candidateText = (candidate.metadata?.text || '').trim();
                    if (currentText && candidateText && currentText !== candidateText) {
                        continue;
                    }
                    suppressed.add(candidate.id);
                }
                else if (current.type === 'PII_CANDIDATE' && candidate.type === 'OCR_TEXT' && iou >= iouThresh) {
                    suppressed.add(candidate.id);
                }
            }
        }
        return fused;
    }
    /**
     * Main entry point constructing UnifiedPerceptionResult for Person 1 handoff.
     */
    buildUnifiedResult(input) {
        const { screenshotWidth, screenshotHeight, faceResults, ocrResults, piiResults, visionResults, timing } = input;
        const faceDets = faceResults?.status === 'SUCCESS' ? faceResults.detections : [];
        const ocrDets = ocrResults?.status === 'SUCCESS' ? ocrResults.detections : [];
        const piiDets = piiResults?.status === 'SUCCESS' ? piiResults.detections : [];
        const visionDets = visionResults?.status === 'SUCCESS' ? visionResults.detections : [];
        // Run fusion & deduplication across all sources (Face, PII, Vision, OCR)
        const fusedDetections = this.fuseDetections([faceDets, piiDets, visionDets, ocrDets], screenshotWidth, screenshotHeight);
        const faceSubsys = faceResults ? { status: faceResults.status, error: faceResults.error } : { status: 'SKIPPED' };
        const ocrSubsys = ocrResults ? { status: ocrResults.status, error: ocrResults.error } : { status: 'SKIPPED' };
        const piiSubsys = piiResults ? { status: piiResults.status, error: piiResults.error } : { status: 'SKIPPED' };
        const visionSubsys = visionResults ? { status: visionResults.status, error: visionResults.error } : { status: 'SKIPPED' };
        const statuses = [faceSubsys.status, ocrSubsys.status, piiSubsys.status, visionSubsys.status];
        const successCount = statuses.filter(s => s === 'SUCCESS').length;
        const failedCount = statuses.filter(s => s === 'FAILED').length;
        let overallStatus = 'SUCCESS';
        if (failedCount > 0) {
            overallStatus = successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILURE';
        }
        const locality = {
            isLocal: true,
            externalAiUsed: false,
            networkUploadPerformed: false
        };
        return {
            schemaVersion: '1.0.0',
            status: overallStatus,
            generatedAt: Date.now(),
            screenshot: {
                width: screenshotWidth,
                height: screenshotHeight,
                coordinateSpace: 'SCREENSHOT'
            },
            detections: fusedDetections,
            counts: {
                faces: faceDets.length,
                ocrRegions: ocrDets.length,
                piiCandidates: piiDets.length,
                visualObjects: visionDets.length,
                total: fusedDetections.length
            },
            timing,
            locality,
            subsystems: {
                face: faceSubsys,
                ocr: ocrSubsys,
                pii: piiSubsys,
                vision: visionSubsys
            }
        };
    }
}
