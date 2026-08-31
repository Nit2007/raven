/**
 * Content script running inside web pages.
 * Obtains viewport dimensions and devicePixelRatio for accurate coordinate mapping.
 */
export declare function getViewportMeta(): {
    width: number;
    height: number;
    devicePixelRatio: number;
};
