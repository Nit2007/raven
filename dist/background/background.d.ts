/**
 * Background Service Worker for Manifest V3 Extension
 * Manages Offscreen Document lifecycle and screenshot perception dispatch.
 */
declare let offscreenDocumentCreated: boolean;
declare function ensureOffscreenDocumentExists(): Promise<void>;
