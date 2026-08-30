import { LocalPerceptionPipeline } from '../perception/perceptionPipeline.js';
import { PerceptionFrameInput } from '../schema/detection.js';

const pipeline = new LocalPerceptionPipeline();
let isInitialized = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RUN_LOCAL_PERCEPTION') {
    (async () => {
      try {
        if (!isInitialized) {
          await pipeline.init();
          isInitialized = true;
        }

        const input: PerceptionFrameInput = {
          dataUrl: message.dataUrl,
          viewport: message.viewport,
          timestamp: message.timestamp
        };

        // Load image into Offscreen canvas
        const img = new Image();
        img.src = input.dataUrl;
        await img.decode();

        const canvas = document.getElementById('perceptionCanvas') as HTMLCanvasElement;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
        }

        const detections = await pipeline.perceiveFrame(input, canvas);
        sendResponse({ success: true, detections });
      } catch (err) {
        console.error('Offscreen perception failed:', err);
        sendResponse({ success: false, error: String(err) });
      }
    })();

    return true; // Async response
  }
});
