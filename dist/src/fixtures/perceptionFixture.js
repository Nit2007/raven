/**
 * Deterministic Mock Integration Fixture for Person 1 (Privacy & Redaction Engine).
 * Allows Person 1 to develop, test, and validate privacy policies without live WASM OCR execution.
 */
export const SAMPLE_UNIFIED_PERCEPTION_RESULT = {
    schemaVersion: '1.0.0',
    status: 'SUCCESS',
    generatedAt: 1788029950000,
    screenshot: {
        width: 1920,
        height: 1080,
        coordinateSpace: 'SCREENSHOT'
    },
    detections: [
        {
            id: 'det_face_sample_1',
            type: 'FACE',
            source: 'face',
            bbox: {
                x: 120,
                y: 80,
                width: 150,
                height: 150
            },
            confidence: 0.96,
            metadata: {
                detector: 'blazeface-wasm-v1',
                coordinateSpace: 'SCREENSHOT'
            }
        },
        {
            id: 'det_pii_sample_email',
            type: 'PII_CANDIDATE',
            source: 'pii',
            bbox: {
                x: 450,
                y: 220,
                width: 210,
                height: 24
            },
            confidence: 0.99,
            metadata: {
                category: 'EMAIL',
                piiType: 'EMAIL',
                text: 'john.doe@example.com',
                evidence: ['EMAIL_PATTERN', 'EMAIL_LABEL_CONTEXT'],
                detector: 'pii-detector-v2-layered',
                coordinateSpace: 'SCREENSHOT'
            }
        },
        {
            id: 'det_pii_sample_phone',
            type: 'PII_CANDIDATE',
            source: 'pii',
            bbox: {
                x: 450,
                y: 260,
                width: 180,
                height: 24
            },
            confidence: 0.97,
            metadata: {
                category: 'PHONE',
                piiType: 'PHONE',
                text: '+91 9876543210',
                evidence: ['INTL_PHONE_PATTERN', 'MULTI_TOKEN_SPATIAL_GROUPING'],
                detector: 'pii-detector-v2-layered',
                coordinateSpace: 'SCREENSHOT'
            }
        },
        {
            id: 'det_ocr_sample_text',
            type: 'OCR_TEXT',
            source: 'ocr',
            bbox: {
                x: 450,
                y: 180,
                width: 320,
                height: 28
            },
            confidence: 0.92,
            metadata: {
                text: 'Welcome User Dashboard',
                detector: 'tesseract-wasm-v5-normalized',
                coordinateSpace: 'SCREENSHOT'
            }
        }
    ],
    counts: {
        faces: 1,
        ocrRegions: 1,
        piiCandidates: 2,
        total: 4
    },
    timing: {
        captureMs: 45,
        faceMs: 38,
        ocrInitMs: 0,
        ocrInferenceMs: 420,
        normalizationMs: 0.5,
        piiMs: 0.3,
        fusionMs: 0.2,
        totalMs: 504
    },
    locality: {
        isLocal: true,
        externalAiUsed: false,
        networkUploadPerformed: false
    },
    subsystems: {
        face: { status: 'SUCCESS' },
        ocr: { status: 'SUCCESS' },
        pii: { status: 'SUCCESS' }
    }
};
