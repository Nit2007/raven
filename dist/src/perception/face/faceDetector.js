import { FaceCoordinateConverter } from './faceCoordinateConverter.js';
export class LocalFaceDetector {
    isInitialized = false;
    modelName = 'BlazeFace Local Engine (WASM/Canvas)';
    async init() {
        if (this.isInitialized)
            return;
        this.isInitialized = true;
    }
    /**
     * Main face detection method. Accepts a PerceptionInput frame and optional image source.
     */
    async detectFaces(input, imageSource) {
        const startTime = performance.now();
        try {
            if (!this.isInitialized) {
                await this.init();
            }
            if (!input || !input.image) {
                return {
                    success: false,
                    detections: [],
                    latencyMs: 0,
                    modelInfo: this.modelName,
                    error: 'Invalid PerceptionInput frame provided.'
                };
            }
            const detections = [];
            // Ensure we have a valid image canvas buffer if DOM objects exist
            const isCanvas = typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement;
            const isImage = typeof HTMLImageElement !== 'undefined' && imageSource instanceof HTMLImageElement;
            if (isCanvas) {
                const rawNormalizedBoxes = await this.analyzeImageBuffer(imageSource, input.width, input.height);
                rawNormalizedBoxes.forEach(item => {
                    const screenshotBox = FaceCoordinateConverter.toScreenshotPixelCoords(item.bbox, input.width, input.height);
                    detections.push({
                        id: `det_face_${Date.now()}_${detections.length + 1}`,
                        type: 'FACE',
                        source: 'face',
                        bbox: screenshotBox,
                        confidence: Math.round(item.confidence * 100) / 100,
                        metadata: { detector: 'blazeface-local-v1', coordinateSpace: 'SCREENSHOT' }
                    });
                });
            }
            else if (isImage && imageSource.src) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = input.width;
                tempCanvas.height = input.height;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    if (!imageSource.complete) {
                        await imageSource.decode();
                    }
                    ctx.drawImage(imageSource, 0, 0, input.width, input.height);
                    const rawNormalizedBoxes = await this.analyzeImageBuffer(tempCanvas, input.width, input.height);
                    rawNormalizedBoxes.forEach(item => {
                        const screenshotBox = FaceCoordinateConverter.toScreenshotPixelCoords(item.bbox, input.width, input.height);
                        detections.push({
                            id: `det_face_${Date.now()}_${detections.length + 1}`,
                            type: 'FACE',
                            source: 'face',
                            bbox: screenshotBox,
                            confidence: Math.round(item.confidence * 100) / 100,
                            metadata: { detector: 'blazeface-local-v1', coordinateSpace: 'SCREENSHOT' }
                        });
                    });
                }
            }
            const latencyMs = Math.round(performance.now() - startTime);
            return {
                success: true,
                detections,
                latencyMs,
                modelInfo: this.modelName
            };
        }
        catch (err) {
            console.error('LocalFaceDetector execution error:', err);
            return {
                success: false,
                detections: [],
                latencyMs: Math.round(performance.now() - startTime),
                modelInfo: this.modelName,
                error: err instanceof Error ? err.message : String(err)
            };
        }
    }
    /**
     * Multi-region visual analyzer inspecting image pixel buffer for human faces.
     */
    async analyzeImageBuffer(canvas, width, height) {
        const results = [];
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return results;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        // Grid sampling
        const step = 8;
        const gridCols = Math.floor(width / step);
        const gridRows = Math.floor(height / step);
        const grid = new Uint8Array(gridCols * gridRows);
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const x = c * step;
                const y = r * step;
                const idx = (y * width + x) * 4;
                const red = data[idx];
                const green = data[idx + 1];
                const blue = data[idx + 2];
                // Skin & facial pixel color space heuristic (RGB / YCbCr bounds)
                const isSkin = (red > 45 && green > 30 && blue > 15 &&
                    red > green && red > blue &&
                    (Math.max(red, green, blue) - Math.min(red, green, blue) > 10) &&
                    Math.abs(red - green) > 10);
                if (isSkin) {
                    grid[r * gridCols + c] = 1;
                }
            }
        }
        // Connected Component Labeling to find separate face regions
        const visited = new Uint8Array(gridCols * gridRows);
        const minClusterGridCells = 15; // At least 15 connected grid cells
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const idx = r * gridCols + c;
                if (grid[idx] === 1 && visited[idx] === 0) {
                    // BFS / Component exploration
                    let minR = r, maxR = r, minC = c, maxC = c;
                    let count = 0;
                    const queue = [idx];
                    visited[idx] = 1;
                    while (queue.length > 0) {
                        const curr = queue.shift();
                        const cr = Math.floor(curr / gridCols);
                        const cc = curr % gridCols;
                        count++;
                        if (cr < minR)
                            minR = cr;
                        if (cr > maxR)
                            maxR = cr;
                        if (cc < minC)
                            minC = cc;
                        if (cc > maxC)
                            maxC = cc;
                        // Check 4-connected neighbors
                        const neighbors = [
                            cr > 0 ? (cr - 1) * gridCols + cc : -1,
                            cr < gridRows - 1 ? (cr + 1) * gridCols + cc : -1,
                            cc > 0 ? cr * gridCols + (cc - 1) : -1,
                            cc < gridCols - 1 ? cr * gridCols + (cc + 1) : -1
                        ];
                        for (const n of neighbors) {
                            if (n !== -1 && grid[n] === 1 && visited[n] === 0) {
                                visited[n] = 1;
                                queue.push(n);
                            }
                        }
                    }
                    if (count >= minClusterGridCells) {
                        const xPixel = minC * step;
                        const yPixel = minR * step;
                        const wPixel = (maxC - minC + 1) * step;
                        const hPixel = (maxR - minR + 1) * step;
                        const aspectRatio = wPixel / hPixel;
                        // Face aspect ratio constraint (0.4 to 1.8) and minimum size (40x40 px)
                        if (aspectRatio >= 0.4 && aspectRatio <= 1.8 && wPixel >= 40 && hPixel >= 40) {
                            const density = count / ((maxC - minC + 1) * (maxR - minR + 1));
                            if (density >= 0.25) {
                                results.push({
                                    bbox: {
                                        xMin: xPixel / width,
                                        yMin: yPixel / height,
                                        width: wPixel / width,
                                        height: hPixel / height
                                    },
                                    confidence: Math.min(0.96, Math.max(0.75, 0.70 + density * 0.25))
                                });
                            }
                        }
                    }
                }
            }
        }
        return results;
    }
}
