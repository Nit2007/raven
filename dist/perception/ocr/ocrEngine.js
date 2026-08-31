export class ModelAgnosticOcrEngine {
    isInitialized = false;
    async init() {
        this.isInitialized = true;
    }
    async recognizeText(imageElement) {
        if (!this.isInitialized) {
            await this.init();
        }
        return { words: [], detections: [] };
    }
}
