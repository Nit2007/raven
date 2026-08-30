/**
 * Content script running inside web pages.
 * Obtains viewport dimensions and devicePixelRatio for accurate coordinate mapping.
 */

(() => {
  function getViewportMeta() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  // Global listener for perception trigger
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_LOCAL_PERCEPTION') {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_AND_PERCEIVE',
        viewport: getViewportMeta()
      }, (response) => {
        window.postMessage({
          type: 'LOCAL_PERCEPTION_RESPONSE',
          detections: response?.detections || []
        }, '*');
      });
    }
  });
})();
