// test/element-matcher.test.ts
// Comprehensive Unit & Functional Test Suite for PilotRaven Universal Element Matching Engine
// Covers 21+ mandatory test categories with synthetic DOM scenarios.

import { ElementMatcher } from '../src/services/matching/element-matcher.js';
import { PageElement } from '../src/types/index.js';
import { MatchTarget } from '../src/services/matching/matching-types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖\x1b[0m ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

function runTests() {
  console.log('\x1b[36m====================================================\x1b[0m');
  console.log('\x1b[36m🧪 PilotRaven Universal Element Matcher Test Suite\x1b[0m');
  console.log('\x1b[36m====================================================\x1b[0m\n');

  const matcher = new ElementMatcher();

  // Test A: Exact match
  {
    const elements: PageElement[] = [
      { id: 'el_1', tag: 'button', role: 'button', text: 'Login', visible: true, enabled: true, editable: false },
      { id: 'el_2', tag: 'button', role: 'button', text: 'Sign Up', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Login', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_1', 'Category A: Exact match ("Login" -> Login button)');
  }

  // Test B: Case variation
  {
    const elements: PageElement[] = [
      { id: 'el_1', tag: 'button', role: 'button', text: 'Login', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'LOGIN', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_1', 'Category B: Case variation ("LOGIN" -> Login)');
  }

  // Test C: Formatting variation
  {
    const elements: PageElement[] = [
      { id: 'el_1', tag: 'button', role: 'button', text: 'Log In', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: '  Log-In  ', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_1', 'Category C: Formatting variation ("  Log-In  " -> Log In)');
  }

  // Test D: Fuzzy typo tolerance
  {
    const elements: PageElement[] = [
      { id: 'el_1', tag: 'button', role: 'button', text: 'Checkout', visible: true, enabled: true, editable: false },
      { id: 'el_2', tag: 'button', role: 'button', text: 'Settings', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Checkot', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_1', 'Category D: Fuzzy typo ("Checkot" -> Checkout)');
  }

  // Test E: Role distinction (button vs text div)
  {
    const elements: PageElement[] = [
      { id: 'el_heading', tag: 'div', role: 'heading', text: 'Login Help', visible: true, enabled: true, editable: false },
      { id: 'el_btn', tag: 'button', role: 'button', text: 'Login', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Login', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_btn', 'Category E: Role distinction (button outranks non-interactive container)');
  }

  // Test F: ARIA match
  {
    const elements: PageElement[] = [
      { id: 'el_search', tag: 'button', role: 'button', text: '', aria_label: 'Search Store', visible: true, enabled: true, editable: false },
      { id: 'el_cart', tag: 'button', role: 'button', text: '', aria_label: 'Shopping Cart', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Search Store', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_search', 'Category F: ARIA match (aria-label "Search Store")');
  }

  // Test G: Placeholder match
  {
    const elements: PageElement[] = [
      { id: 'el_input', tag: 'input', role: 'textbox', text: '', placeholder: 'Search products and brands', visible: true, enabled: true, editable: true },
    ];
    const res = matcher.match({ text: 'Search products', action: 'type' }, elements);
    assert(res.matched && res.elementId === 'el_input', 'Category G: Placeholder match ("Search products" -> input placeholder)');
  }

  // Test H: Form field & type matching
  {
    const elements: PageElement[] = [
      { id: 'el_label', tag: 'label', role: 'text', text: 'Email Address', visible: true, enabled: true, editable: false },
      { id: 'el_input', tag: 'input', role: 'textbox', text: '', type: 'email', name: 'user_email', visible: true, enabled: true, editable: true },
    ];
    const res = matcher.match({ text: 'Enter email address', action: 'type' }, elements);
    assert(res.matched && res.elementId === 'el_input', 'Category H: Form field match (prefers editable input over static label)');
  }

  // Test I: Context disambiguation
  {
    const elements: PageElement[] = [
      { id: 'el_account_email', tag: 'input', role: 'textbox', text: '', parent_text: 'Account Settings Profile', visible: true, enabled: true, editable: true },
      { id: 'el_news_email', tag: 'input', role: 'textbox', text: '', parent_text: 'Newsletter Subscription Footer', visible: true, enabled: true, editable: true },
    ];
    const res = matcher.match({ text: 'email', context: 'Account Settings', action: 'type' }, elements);
    assert(res.matched && res.elementId === 'el_account_email', 'Category I: Context disambiguation (Account email vs Newsletter email)');
  }

  // Test J: Ordinal matching
  {
    const elements: PageElement[] = [
      { id: 'el_p1', tag: 'button', role: 'button', text: 'Add to Cart', bbox: [100, 100, 80, 30], visible: true, enabled: true, editable: false },
      { id: 'el_p2', tag: 'button', role: 'button', text: 'Add to Cart', bbox: [100, 200, 80, 30], visible: true, enabled: true, editable: false },
      { id: 'el_p3', tag: 'button', role: 'button', text: 'Add to Cart', bbox: [100, 300, 80, 30], visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'click the second Add to Cart', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_p2', 'Category J: Ordinal matching ("second Add to Cart" -> 2nd item)');
  }

  // Test K: Visual ordering (row & column ordering)
  {
    const elements: PageElement[] = [
      { id: 'el_row1_col2', tag: 'a', role: 'link', text: 'Product Item', bbox: [200, 50, 80, 80], visible: true, enabled: true, editable: false },
      { id: 'el_row1_col1', tag: 'a', role: 'link', text: 'Product Item', bbox: [50, 50, 80, 80], visible: true, enabled: true, editable: false },
      { id: 'el_row2_col1', tag: 'a', role: 'link', text: 'Product Item', bbox: [50, 180, 80, 80], visible: true, enabled: true, editable: false },
    ];
    const res1 = matcher.match({ text: 'Product Item', ordinal: 1, action: 'click' }, elements);
    const res2 = matcher.match({ text: 'Product Item', ordinal: 2, action: 'click' }, elements);
    assert(res1.elementId === 'el_row1_col1' && res2.elementId === 'el_row1_col2', 'Category K: Visual ordering (top-left is #1, top-right is #2)');
  }

  // Test L: Disabled candidate protection
  {
    const elements: PageElement[] = [
      { id: 'el_disabled', tag: 'button', role: 'button', text: 'Submit Order', visible: true, enabled: false, editable: false },
      { id: 'el_enabled', tag: 'button', role: 'button', text: 'Submit Order', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Submit Order', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_enabled', 'Category L: Disabled candidate protection (enabled candidate chosen)');
  }

  // Test M: Invisible candidate protection
  {
    const elements: PageElement[] = [
      { id: 'el_hidden', tag: 'button', role: 'button', text: 'Continue', visible: false, enabled: true, editable: false },
      { id: 'el_visible', tag: 'button', role: 'button', text: 'Continue', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Continue', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_visible', 'Category M: Invisible candidate protection (visible candidate chosen)');
  }

  // Test N: Stale element recovery (element ID changed in dynamic DOM)
  {
    const oldFp = {
      tag: 'button',
      role: 'button',
      normalizedText: 'confirm payment',
      normalizedAria: '',
      normalizedPlaceholder: '',
      normalizedName: '',
      type: 'submit',
      normalizedParentText: 'checkout',
      signature: 'button|button|confirm payment',
    };
    // Page re-rendered: el_old is gone, replaced by el_fresh with same semantics
    const freshElements: PageElement[] = [
      { id: 'el_fresh', tag: 'button', role: 'button', text: 'Confirm Payment', type: 'submit', parent_text: 'Checkout', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.resolveElement(
      { elementId: 'el_old', text: 'Confirm Payment', action: 'click', expectedFingerprint: oldFp },
      freshElements
    );
    assert(res.matched && res.elementId === 'el_fresh', 'Category N: Stale element recovery across dynamic DOM mutations');
  }

  // Test O: SPA element mutation validation
  {
    const element: PageElement = { id: 'el_tab', tag: 'button', role: 'tab', text: 'Overview', visible: true, enabled: true, editable: false };
    const fp = matcher.createFingerprint(element);
    const res = matcher.resolveElement({ elementId: 'el_tab', action: 'click' }, [element], fp);
    assert(res.matched && res.elementId === 'el_tab', 'Category O: SPA element validation with compatible fingerprint');
  }

  // Test P: Ambiguous candidates protection (Never silently click an ambiguous candidate!)
  {
    const elements: PageElement[] = [
      { id: 'el_btnA', tag: 'button', role: 'button', text: 'Delete File', visible: true, enabled: true, editable: false },
      { id: 'el_btnB', tag: 'button', role: 'button', text: 'Delete File', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Delete File', action: 'click' }, elements);
    assert(!res.matched && res.status === 'AMBIGUOUS', 'Category P: Ambiguity protection (identically valid candidates return AMBIGUOUS)');
  }

  // Test Q: No match scenario
  {
    const elements: PageElement[] = [
      { id: 'el_1', tag: 'button', role: 'button', text: 'Login', visible: true, enabled: true, editable: false },
      { id: 'el_2', tag: 'button', role: 'button', text: 'Sign Up', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Download PDF Report', action: 'click' }, elements);
    assert(!res.matched && res.status === 'NO_MATCH', 'Category Q: No match scenario (unrelated target returns NO_MATCH)');
  }

  // Test R: Custom ARIA controls (div with role="button")
  {
    const elements: PageElement[] = [
      { id: 'el_custom_btn', tag: 'div', role: 'button', text: 'Launch App', visible: true, enabled: true, editable: false },
    ];
    const res = matcher.match({ text: 'Launch App', action: 'click' }, elements);
    assert(res.matched && res.elementId === 'el_custom_btn', 'Category R: Custom ARIA control (<div role="button">)');
  }

  // Test S: Contenteditable custom input
  {
    const elements: PageElement[] = [
      { id: 'el_editor', tag: 'div', role: 'textbox', text: '', editable: true, visible: true, enabled: true },
    ];
    const res = matcher.match({ text: 'Message body', action: 'type' }, elements);
    assert(res.matched && res.elementId === 'el_editor', 'Category S: Contenteditable element matched for type action');
  }

  // Test T: Long page (50+ elements) performance
  {
    const largeList: PageElement[] = [];
    for (let i = 1; i <= 60; i++) {
      largeList.push({
        id: `el_item_${i}`,
        tag: 'button',
        role: 'button',
        text: `Item Option ${i}`,
        bbox: [100, i * 40, 120, 30],
        visible: true,
        enabled: true,
        editable: false,
      });
    }
    const t0 = performance.now();
    const res = matcher.match({ text: 'Item Option 42', action: 'click' }, largeList);
    const elapsed = performance.now() - t0;
    assert(res.matched && res.elementId === 'el_item_42' && elapsed < 10, `Category T: Long page 60 candidates matched in ${elapsed.toFixed(2)}ms (< 10ms target)`);
  }

  // Test U: Mixed interactive elements across actions
  {
    const mixedList: PageElement[] = [
      { id: 'el_chk', tag: 'input', role: 'checkbox', type: 'checkbox', text: 'Agree to terms', visible: true, enabled: true, editable: false },
      { id: 'el_sel', tag: 'select', role: 'combobox', text: 'Choose Country', visible: true, enabled: true, editable: false },
    ];
    const resCheck = matcher.match({ text: 'Agree to terms', action: 'check' }, mixedList);
    const resSelect = matcher.match({ text: 'Choose Country', action: 'select' }, mixedList);
    assert(resCheck.elementId === 'el_chk' && resSelect.elementId === 'el_sel', 'Category U: Mixed interactive elements matched to appropriate actions');
  }

  console.log('\n\x1b[36m====================================================\x1b[0m');
  if (failed === 0) {
    console.log(`\x1b[32m🎉 All ${passed} functional tests passed!\x1b[0m`);
  } else {
    console.error(`\x1b[31m❌ ${failed} functional tests failed (${passed} passed)\x1b[0m`);
    process.exit(1);
  }
}

runTests();
