import { PerceptionFusionEngine } from '../perception/fusion/perceptionFusion.js';
export class MlEvaluator {
    /**
     * Evaluates predicted detections against ground-truth annotations using IoU matching.
     */
    evaluateDetections(predictions, groundTruth, iouThreshold = 0.40) {
        let truePositives = 0;
        let falsePositives = 0;
        const matchedGt = new Set();
        for (const pred of predictions) {
            let isMatched = false;
            for (const gt of groundTruth) {
                if (matchedGt.has(gt.id))
                    continue;
                if (pred.type !== gt.type)
                    continue;
                const iou = PerceptionFusionEngine.computeIoU(pred.bbox, gt.bbox);
                if (iou >= iouThreshold) {
                    // If text or category expected, verify partial match
                    if (gt.expectedText && pred.metadata?.text) {
                        const predText = pred.metadata.text.toLowerCase().replace(/\s+/g, '');
                        const expectedText = gt.expectedText.toLowerCase().replace(/\s+/g, '');
                        if (!predText.includes(expectedText) && !expectedText.includes(predText)) {
                            continue;
                        }
                    }
                    if (gt.expectedCategory && pred.metadata?.category) {
                        if (pred.metadata.category !== gt.expectedCategory) {
                            continue;
                        }
                    }
                    matchedGt.add(gt.id);
                    truePositives++;
                    isMatched = true;
                    break;
                }
            }
            if (!isMatched) {
                falsePositives++;
            }
        }
        const falseNegatives = Math.max(0, groundTruth.length - truePositives);
        const precision = (truePositives + falsePositives) > 0
            ? truePositives / (truePositives + falsePositives)
            : 1.0;
        const recall = (truePositives + falseNegatives) > 0
            ? truePositives / (truePositives + falseNegatives)
            : 1.0;
        const f1Score = (precision + recall) > 0
            ? (2 * precision * recall) / (precision + recall)
            : 0.0;
        const accuracyPercentage = Math.round(f1Score * 10000) / 100;
        return {
            truePositives,
            falsePositives,
            falseNegatives,
            precision: Math.round(precision * 1000) / 1000,
            recall: Math.round(recall * 1000) / 1000,
            f1Score: Math.round(f1Score * 1000) / 1000,
            accuracyPercentage
        };
    }
}
