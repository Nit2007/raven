import { UnifiedPerceptionResult, BoundingBox } from '../schema/detection.js';
export interface ElementInfo {
    tag: string;
    role?: string | null;
    type?: string;
    name?: string;
    id?: string;
    placeholder?: string;
    labelText?: string;
    visibleText?: string;
    value?: string;
    boundingBox?: BoundingBox;
    interactive?: boolean;
    sensitivity?: string;
    confidence?: number;
    ruleToken?: string | null;
    policyAction?: string;
    redacted?: boolean;
    ruleId?: string;
    ruleCategory?: string;
    source?: string;
    reason?: string;
    stableRef?: string;
}
export declare class PerceptionAdapter {
    /**
     * Calculates Intersection over Union (IoU) between two bounding boxes.
     */
    static calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number;
    /**
     * Checks if boxA spatial region contains or overlaps boxB center.
     */
    static boxesOverlap(boxA: BoundingBox, boxB: BoundingBox): boolean;
    /**
     * Fuses Person 2's UnifiedPerceptionResult into Person 1's DOM element list.
     * Modifies/enriches matching DOM elements and appends canvas/visual-only detections.
     */
    static mergePerceptionWithDOM(domElements: ElementInfo[], perceptionResult: UnifiedPerceptionResult): ElementInfo[];
}
