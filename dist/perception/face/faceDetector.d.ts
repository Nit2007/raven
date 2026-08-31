import { DetectionResult } from '../../schema/detection.js';
export interface IFaceDetector {
    init(): Promise<void>;
    detectFaces(imageElement: CanvasImageSource): Promise<DetectionResult[]>;
}
export declare class ModelAgnosticFaceDetector implements IFaceDetector {
    private isInitialized;
    init(): Promise<void>;
    detectFaces(imageElement: CanvasImageSource): Promise<DetectionResult[]>;
}
