export class ModelAgnosticFaceDetector {
    isInitialized = false;
    async init() {
        // In offscreen WASM runtime, loads local model weights
        this.isInitialized = true;
    }
    async detectFaces(imageElement) {
        if (!this.isInitialized) {
            await this.init();
        }
        // Placeholder for WASM/WebGPU BlazeFace execution output array
        return [];
    }
}
