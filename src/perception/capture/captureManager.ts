import { PerceptionInput } from '../input/perceptionInput.js';

export interface CaptureResult {
  success: boolean;
  input?: PerceptionInput;
  error?: string;
}

export class CaptureManager {
  /**
   * Captures the current visible tab and constructs a PerceptionInput.
   * Handles errors gracefully (e.g., restricted chrome:// pages or permission errors).
   */
  public async captureVisibleViewport(): Promise<CaptureResult> {
    try {
      // 1. Verify active tab context
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) {
        return {
          success: false,
          error: 'No active browser tab found.'
        };
      }

      if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://') || activeTab.url.startsWith('edge://'))) {
        return {
          success: false,
          error: `Cannot capture restricted browser page (${activeTab.url.split('/')[0]}//). Please navigate to a standard webpage.`
        };
      }

      // 2. Perform visible viewport capture using Chrome Extension API
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });

      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return {
          success: false,
          error: 'Failed to capture visual state: Empty image payload returned.'
        };
      }

      // 3. Extract pixel dimensions locally
      const dimensions = await this.getImageDimensions(dataUrl);

      // 4. Construct PerceptionInput object
      const perceptionInput: PerceptionInput = {
        image: dataUrl,
        width: dimensions.width,
        height: dimensions.height,
        coordinateSpace: 'SCREENSHOT',
        devicePixelRatio: dimensions.devicePixelRatio || 1,
        timestamp: Date.now(),
        locality: {
          isLocal: true,
          externalAiUsed: false,
          uploadPerformed: false
        }
      };

      return {
        success: true,
        input: perceptionInput
      };
    } catch (err) {
      console.error('CaptureManager error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Capture failed: ${errorMessage}`
      };
    }
  }

  /**
   * Decodes image data URL locally to measure pixel dimensions.
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number; devicePixelRatio: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          devicePixelRatio: window.devicePixelRatio || 1
        });
      };
      img.onerror = () => {
        reject(new Error('Failed to decode captured image dimensions locally.'));
      };
      img.src = dataUrl;
    });
  }
}
