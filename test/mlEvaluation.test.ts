import assert from 'node:assert';
import { test } from 'node:test';
import { GroundTruthAnnotation, MlEvaluator } from '../src/eval/mlEvaluator.js';
import { DetectionResult } from '../src/schema/detection.js';

test('ML Evaluation Metric Engine - Precision, Recall, F1 Calculation', () => {
  const evaluator = new MlEvaluator();

  const groundTruth: GroundTruthAnnotation[] = [
    { id: 'gt_face_1', type: 'FACE', bbox: { x: 100, y: 100, width: 80, height: 80 } },
    { id: 'gt_email_1', type: 'PII_CANDIDATE', bbox: { x: 300, y: 200, width: 180, height: 24 }, expectedCategory: 'EMAIL', expectedText: 'test@example.com' },
    { id: 'gt_phone_1', type: 'PII_CANDIDATE', bbox: { x: 300, y: 250, width: 160, height: 24 }, expectedCategory: 'PHONE', expectedText: '+91 9876543210' },
    { id: 'gt_text_1', type: 'OCR_TEXT', bbox: { x: 300, y: 150, width: 250, height: 30 }, expectedText: 'Welcome Dashboard' }
  ];

  const predictions: DetectionResult[] = [
    { id: 'pred_face_1', type: 'FACE', source: 'face', bbox: { x: 102, y: 100, width: 78, height: 80 }, confidence: 0.95 },
    { id: 'pred_email_1', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 300, y: 200, width: 180, height: 24 }, confidence: 0.98, metadata: { category: 'EMAIL', text: 'test@example.com' } },
    { id: 'pred_phone_1', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 300, y: 250, width: 160, height: 24 }, confidence: 0.97, metadata: { category: 'PHONE', text: '+91 9876543210' } },
    { id: 'pred_text_1', type: 'OCR_TEXT', source: 'ocr', bbox: { x: 300, y: 150, width: 250, height: 30 }, confidence: 0.91, metadata: { text: 'Welcome Dashboard' } }
  ];

  const metrics = evaluator.evaluateDetections(predictions, groundTruth);

  assert.strictEqual(metrics.truePositives, 4);
  assert.strictEqual(metrics.falsePositives, 0);
  assert.strictEqual(metrics.falseNegatives, 0);
  assert.strictEqual(metrics.precision, 1.0);
  assert.strictEqual(metrics.recall, 1.0);
  assert.strictEqual(metrics.f1Score, 1.0);
  assert.strictEqual(metrics.accuracyPercentage, 100);
});

test('ML Evaluation Metric Engine - False Positive and False Negative Handling', () => {
  const evaluator = new MlEvaluator();

  const groundTruth: GroundTruthAnnotation[] = [
    { id: 'gt_email_1', type: 'PII_CANDIDATE', bbox: { x: 100, y: 100, width: 150, height: 20 }, expectedCategory: 'EMAIL' },
    { id: 'gt_phone_1', type: 'PII_CANDIDATE', bbox: { x: 100, y: 150, width: 150, height: 20 }, expectedCategory: 'PHONE' }
  ];

  // 1 True Positive (email), 1 False Positive (spurious card), 1 False Negative (missed phone)
  const predictions: DetectionResult[] = [
    { id: 'pred_email_1', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 100, y: 100, width: 150, height: 20 }, confidence: 0.95, metadata: { category: 'EMAIL' } },
    { id: 'pred_spurious', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 500, y: 500, width: 200, height: 20 }, confidence: 0.85, metadata: { category: 'PAYMENT_CARD' } }
  ];

  const metrics = evaluator.evaluateDetections(predictions, groundTruth);

  assert.strictEqual(metrics.truePositives, 1);
  assert.strictEqual(metrics.falsePositives, 1);
  assert.strictEqual(metrics.falseNegatives, 1);
  assert.strictEqual(metrics.precision, 0.5);
  assert.strictEqual(metrics.recall, 0.5);
  assert.strictEqual(metrics.f1Score, 0.5);
});
