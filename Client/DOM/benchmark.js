const fs = require('fs');
const path = require('path');

// Mock browser environment for sensitivity-detector.js
global.chrome = { runtime: { getURL: (p) => path.join(__dirname, p) } };
global.window = { location: { hostname: 'benchmark' } };

// Node-fetch requires absolute URLs. Bypass entirely: mock fetch to load synchronously
// from a __dirname-resolved path so it works regardless of CWD.
global.fetch = function (url) {
  try {
    var resolved = url.startsWith('http') ? url : path.resolve(__dirname, url);
    var data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return Promise.resolve({ json: function () { return Promise.resolve(data); } });
  } catch (e) {
    return Promise.reject(e);
  }
};

// Load Sensitivity Detector in this context
const code = fs.readFileSync(path.join(__dirname, 'sensitivity-detector.js'), 'utf8');
eval(code);

const corpus = [
  // Archetype 1: Banking Login
  { tag: 'input', type: 'text',     name: 'username', labelText: 'User ID',        value: 'alice123',                                   trueLabel: 'CREDENTIAL' },
  { tag: 'input', type: 'password', name: 'pwd',      labelText: 'Password',        value: 'secret!',                                    trueLabel: 'CREDENTIAL' },

  // Archetype 2: E-commerce Checkout
  { tag: 'input', type: 'email',    name: 'email',    labelText: 'Contact Email',   value: 'bob@example.com',                            trueLabel: 'CONTACT' },
  { tag: 'input', type: 'tel',      name: 'phone',    labelText: 'Phone',           value: '555-123-4567',                               trueLabel: 'CONTACT' },
  { tag: 'input', type: 'text',     name: 'cc',       labelText: 'Card Number',     value: '4111 1111 1111 1111',                        trueLabel: 'FINANCIAL' },
  { tag: 'input', type: 'text',     name: 'cvv',      labelText: 'CVV',             value: '123',                                        trueLabel: 'FINANCIAL' },

  // Archetype 3: Free text PII (text nodes — no field tag)
  { tag: 'div',  visibleText: 'Please send to bob@example.com or call me at 555-123-4567.', trueLabel: 'CONTACT' },
  { tag: 'p',    visibleText: 'John Doe visited New York last week.',                        trueLabel: 'NER' },

  // Archetype 4: Medical Intake
  { tag: 'input', type: 'text',     name: 'ssn',      labelText: 'Social Security', value: '123-45-6789',                               trueLabel: 'GOVERNMENT' },

  // Archetype 5: Unlabeled bio textarea
  { tag: 'textarea', name: 'bio', labelText: '', value: 'My name is Alice Smith and I live in Seattle.',                                  trueLabel: 'NER' },

  // Archetype 6: Clustered split-name fields
  { tag: 'input', type: 'text', name: 'f', labelText: 'First', value: 'Alice', stableRef: 'form > div:nth-of-type(1)',                   trueLabel: 'NER' },
  { tag: 'input', type: 'text', name: 'l', labelText: 'Last',  value: 'Smith', stableRef: 'form > div:nth-of-type(1)',                   trueLabel: 'NER' },

  // Archetype 7: Safe (should NOT be flagged)
  { tag: 'p',      visibleText: 'Our shipping policy takes 3 to 5 business days.',           trueLabel: 'SAFE' },
  { tag: 'button', type: 'button', labelText: 'Submit Order',                                trueLabel: 'SAFE' }
];

async function runBenchmark() {
  await new Promise(function (resolve) { SensitivityDetector.loadPiiPatterns(resolve); });

  // Task 3 precondition guard — fail loudly before producing misleading accuracy numbers
  var fieldCount  = (typeof compiledRules !== 'undefined') ? compiledRules.fieldRules.length : 0;
  var textCount   = (typeof compiledRules !== 'undefined') ? compiledRules.textRules.length  : 0;
  // Access via the module since compiledRules is private inside the IIFE
  // We infer rule-load success from whether classifyElements produces any non-SAFE result
  // on an obviously sensitive input before touching the corpus.
  var probe = SensitivityDetector.classifyElements([
    { tag: 'input', type: 'email', name: 'email', labelText: 'Email', value: 'test@example.com' }
  ]);
  if (!probe[0] || probe[0].sensitivity === 'SAFE') {
    console.error('\n[BENCHMARK GUARD] Rules appear empty — classifying a known-sensitive email input returned SAFE.');
    console.error('[BENCHMARK GUARD] Do not trust the numbers below. Fix rule loading first.\n');
    process.exitCode = 1;
  }

  var results = SensitivityDetector.classifyElements(corpus);

  // Overall metrics
  var tp = 0, fp = 0, fn = 0, tn = 0;
  var byCategory = {};

  results.forEach(function (res, i) {
    var isSensitive = res.sensitivity === 'HIGH_CONFIDENCE_PII' || res.sensitivity === 'LOW_CONFIDENCE_PII';
    var trueLabel   = corpus[i].trueLabel;
    var shouldBe    = trueLabel !== 'SAFE';

    if (!byCategory[trueLabel]) byCategory[trueLabel] = { tp: 0, fp: 0, fn: 0, tn: 0 };

    if (isSensitive && shouldBe)  { tp++; byCategory[trueLabel].tp++; }
    else if (isSensitive && !shouldBe) { fp++; byCategory[trueLabel].fp++; }
    else if (!isSensitive && shouldBe) { fn++; byCategory[trueLabel].fn++; console.log('  MISSED:', JSON.stringify({ tag: res.tag, name: res.name || '', labelText: res.labelText || '', trueLabel })); }
    else                           { tn++; byCategory[trueLabel].tn++; }
  });

  var precision = tp / (tp + fp) || 0;
  var recall    = tp / (tp + fn) || 0;
  var f1        = (2 * precision * recall) / (precision + recall) || 0;

  console.log('\n--- Generalized Redaction Benchmark ---');
  console.log('Overall:');
  console.log('  TP=' + tp + ' FP=' + fp + ' FN=' + fn + ' TN=' + tn);
  console.log('  Precision: ' + (precision * 100).toFixed(1) + '%');
  console.log('  Recall:    ' + (recall    * 100).toFixed(1) + '%');
  console.log('  F1 Score:  ' + (f1        * 100).toFixed(1) + '%');

  console.log('\nPer-Category Breakdown:');
  Object.keys(byCategory).sort().forEach(function (cat) {
    var c  = byCategory[cat];
    var p  = c.tp / (c.tp + c.fp) || 0;
    var r  = c.tp / (c.tp + c.fn) || 0;
    var f  = (2 * p * r) / (p + r) || 0;
    console.log('  ' + cat.padEnd(12) + '  P=' + (p*100).toFixed(0).padStart(3) + '%'
                     + '  R=' + (r*100).toFixed(0).padStart(3) + '%'
                     + '  F1=' + (f*100).toFixed(0).padStart(3) + '%'
                     + '  (TP=' + c.tp + ' FP=' + c.fp + ' FN=' + c.fn + ')');
  });
}

runBenchmark();
