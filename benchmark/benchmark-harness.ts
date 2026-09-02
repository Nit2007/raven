// benchmark/benchmark-harness.ts
// PilotRaven Universal Element Matching Engine Benchmark Harness
// 200+ Realistic Synthetic & Real-World Scenarios measuring Accuracy, Recall, Ambiguity, Latency, and Ablation.

import { ElementMatcher } from '../src/services/matching/element-matcher.js';
import { PageElement } from '../src/types/index.js';
import { MatchTarget, MatchStatus, AblationMode, MatchingConfig } from '../src/services/matching/matching-types.js';
import { DEFAULT_MATCHING_CONFIG } from '../src/services/matching/matching-config.js';

export interface BenchmarkScenario {
  id: string;
  category: string;
  description: string;
  target: MatchTarget;
  elements: PageElement[];
  expectedStatus: MatchStatus;
  expectedElementId?: string;
  allowAmbiguous?: boolean;
}

export interface BenchmarkResults {
  totalScenarios: number;
  top1Accuracy: number; // percentage
  top3Recall: number; // percentage
  falsePositiveRate: number; // percentage
  ambiguousPrecision: number; // percentage
  noMatchAccuracy: number; // percentage
  staleRecoveryRate: number; // percentage
  avgLatencyMs: number;
  p95LatencyMs: number;
  latencies: number[];
  failedScenarios: Array<{ id: string; expected: string; actual: string; reason: string }>;
}

export function generateBenchmarkDataset(): BenchmarkScenario[] {
  const dataset: BenchmarkScenario[] = [];

  // Helper to add scenario
  function add(
    id: string,
    category: string,
    description: string,
    target: MatchTarget,
    elements: PageElement[],
    expectedStatus: MatchStatus,
    expectedElementId?: string,
    allowAmbiguous: boolean = false
  ) {
    dataset.push({
      id,
      category,
      description,
      target,
      elements,
      expectedStatus,
      expectedElementId,
      allowAmbiguous,
    });
  }

  // =========================================================================
  // CATEGORY 1: Exact Text Matches (30 scenarios)
  // =========================================================================
  const buttonLabels = [
    'Login', 'Sign In', 'Sign Up', 'Register', 'Submit', 'Checkout', 'Save',
    'Cancel', 'Delete', 'Edit', 'Update', 'Download', 'Upload', 'Search',
    'Explore', 'Continue', 'Back', 'Next', 'Finish', 'Apply', 'Reset',
    'Filter', 'Sort', 'Add to Cart', 'Buy Now', 'Subscribe', 'View Details',
    'Contact Us', 'Help', 'Terms & Conditions'
  ];

  buttonLabels.forEach((label, idx) => {
    const elId = `btn_${idx + 1}`;
    add(
      `EXACT_${idx + 1}`,
      'Exact Text',
      `Click exact button "${label}"`,
      { text: label, action: 'click' },
      [
        { id: 'btn_other_1', tag: 'button', role: 'button', text: 'Home', visible: true, enabled: true, editable: false },
        { id: elId, tag: 'button', role: 'button', text: label, visible: true, enabled: true, editable: false },
        { id: 'btn_other_2', tag: 'button', role: 'button', text: 'Settings', visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 2: Case & Formatting Variations (25 scenarios)
  // =========================================================================
  const formattingPairs = [
    { target: 'LOG IN', elem: 'Log In' },
    { target: 'sign-up', elem: 'Sign Up' },
    { target: '  check out  ', elem: 'Checkout' },
    { target: 'add_to_cart', elem: 'Add to Cart' },
    { target: 'BUY-NOW', elem: 'Buy Now' },
    { target: 'view_details', elem: 'View Details' },
    { target: 'sign•in', elem: 'Sign In' },
    { target: 'SAVE & CONTINUE', elem: 'Save & Continue' },
    { target: 'edit-profile', elem: 'Edit Profile' },
    { target: 'delete_account', elem: 'Delete Account' },
    { target: 'RESET-PASSWORD', elem: 'Reset Password' },
    { target: 'order-history', elem: 'Order History' },
    { target: 'track_order', elem: 'Track Order' },
    { target: 'payment_methods', elem: 'Payment Methods' },
    { target: 'PRIVACY POLICY', elem: 'Privacy Policy' },
    { target: 'terms-of-service', elem: 'Terms of Service' },
    { target: 'contact-support', elem: 'Contact Support' },
    { target: 'LIVE-CHAT', elem: 'Live Chat' },
    { target: 'give_feedback', elem: 'Give Feedback' },
    { target: 'DARK MODE', elem: 'Dark Mode' },
    { target: 'notifications_settings', elem: 'Notifications Settings' },
    { target: 'SECURITY-KEY', elem: 'Security Key' },
    { target: 'api-keys', elem: 'API Keys' },
    { target: 'MANAGE-SUBSCRIPTION', elem: 'Manage Subscription' },
    { target: 'export-data', elem: 'Export Data' },
  ];

  formattingPairs.forEach((pair, idx) => {
    const elId = `fmt_${idx + 1}`;
    add(
      `FORMAT_${idx + 1}`,
      'Formatting & Case',
      `Match "${pair.target}" -> "${pair.elem}"`,
      { text: pair.target, action: 'click' },
      [
        { id: elId, tag: 'button', role: 'button', text: pair.elem, visible: true, enabled: true, editable: false },
        { id: 'fmt_noise', tag: 'button', role: 'button', text: 'Overview', visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 3: Typo & Fuzzy Tolerance (20 scenarios)
  // =========================================================================
  const typos = [
    { target: 'Logn', elem: 'Login' },
    { target: 'Chekout', elem: 'Checkout' },
    { target: 'Sgn In', elem: 'Sign In' },
    { target: 'Regstr', elem: 'Register' },
    { target: 'Contnue', elem: 'Continue' },
    { target: 'Submt', elem: 'Submit' },
    { target: 'Downlod', elem: 'Download' },
    { target: 'Sttings', elem: 'Settings' },
    { target: 'Prfile', elem: 'Profile' },
    { target: 'Accnt', elem: 'Account' },
    { target: 'Pyment', elem: 'Payment' },
    { target: 'Biling', elem: 'Billing' },
    { target: 'Notifcations', elem: 'Notifications' },
    { target: 'Dashbord', elem: 'Dashboard' },
    { target: 'Anlytics', elem: 'Analytics' },
    { target: 'Pswrd', elem: 'Password' },
    { target: 'Prefrences', elem: 'Preferences' },
    { target: 'Securty', elem: 'Security' },
    { target: 'Invc', elem: 'Invoice' },
    { target: 'Cncel', elem: 'Cancel' },
  ];

  typos.forEach((item, idx) => {
    const elId = `typo_${idx + 1}`;
    add(
      `TYPO_${idx + 1}`,
      'Typo Tolerance',
      `Match typo "${item.target}" -> "${item.elem}"`,
      { text: item.target, action: 'click' },
      [
        { id: elId, tag: 'button', role: 'button', text: item.elem, visible: true, enabled: true, editable: false },
        { id: 'typo_noise', tag: 'button', role: 'button', text: 'Documentation', visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 4: ARIA & Accessibility Matching (20 scenarios)
  // =========================================================================
  const ariaItems = [
    { target: 'Search', aria: 'Search website' },
    { target: 'Close Dialog', aria: 'Close modal dialog' },
    { target: 'Menu', aria: 'Open main navigation menu' },
    { target: 'Shopping Cart', aria: 'View shopping cart (3 items)' },
    { target: 'User Account', aria: 'User profile and account settings' },
    { target: 'Like Video', aria: 'Like this post or video' },
    { target: 'Share', aria: 'Share to social networks' },
    { target: 'Bookmark', aria: 'Save bookmark' },
    { target: 'Volume', aria: 'Adjust audio volume and mute' },
    { target: 'Play', aria: 'Play video' },
    { target: 'Pause', aria: 'Pause video stream' },
    { target: 'Fullscreen', aria: 'Toggle fullscreen mode' },
    { target: 'Previous Page', aria: 'Go to previous page' },
    { target: 'Next Page', aria: 'Go to next page' },
    { target: 'Filter Results', aria: 'Filter search results' },
    { target: 'Sort Items', aria: 'Sort items by price' },
    { target: 'Refresh', aria: 'Refresh feed' },
    { target: 'Help Info', aria: 'Help and more info' },
    { target: 'Expand Details', aria: 'Expand section details' },
    { target: 'Collapse', aria: 'Collapse sidebar' },
  ];

  ariaItems.forEach((item, idx) => {
    const elId = `aria_${idx + 1}`;
    add(
      `ARIA_${idx + 1}`,
      'ARIA Matching',
      `Match target "${item.target}" with aria-label "${item.aria}"`,
      { text: item.target, action: 'click' },
      [
        { id: 'aria_noise', tag: 'button', role: 'button', text: '', aria_label: 'Unrelated icon button', visible: true, enabled: true, editable: false },
        { id: elId, tag: 'button', role: 'button', text: '', aria_label: item.aria, visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 5: Form Fields & Placeholders (25 scenarios)
  // =========================================================================
  const formFields = [
    { target: 'Search query', tag: 'input', type: 'search', placeholder: 'Search products...', role: 'searchbox' },
    { target: 'Email address', tag: 'input', type: 'email', placeholder: 'name@example.com', role: 'textbox' },
    { target: 'Password', tag: 'input', type: 'password', placeholder: 'Enter your password', role: 'textbox' },
    { target: 'First name', tag: 'input', type: 'text', placeholder: 'First Name', role: 'textbox' },
    { target: 'Last name', tag: 'input', type: 'text', placeholder: 'Last Name', role: 'textbox' },
    { target: 'Phone number', tag: 'input', type: 'tel', placeholder: '+1 (555) 000-0000', role: 'textbox' },
    { target: 'Street address', tag: 'input', type: 'text', placeholder: '123 Main St', role: 'textbox' },
    { target: 'City', tag: 'input', type: 'text', placeholder: 'San Francisco', role: 'textbox' },
    { target: 'Postal Code', tag: 'input', type: 'text', placeholder: '94105', role: 'textbox' },
    { target: 'Company Name', tag: 'input', type: 'text', placeholder: 'Acme Corp', role: 'textbox' },
    { target: 'Job Title', tag: 'input', type: 'text', placeholder: 'Software Engineer', role: 'textbox' },
    { target: 'Website URL', tag: 'input', type: 'url', placeholder: 'https://example.com', role: 'textbox' },
    { target: 'Credit card number', tag: 'input', type: 'text', placeholder: '4000 1234 5678 9010', role: 'textbox' },
    { target: 'Security code CVV', tag: 'input', type: 'text', placeholder: '123', role: 'textbox' },
    { target: 'Expiration date', tag: 'input', type: 'text', placeholder: 'MM/YY', role: 'textbox' },
    { target: 'Promo discount code', tag: 'input', type: 'text', placeholder: 'SUMMER2026', role: 'textbox' },
    { target: 'Message notes', tag: 'textarea', type: undefined, placeholder: 'Write your comments here...', role: 'textbox' },
    { target: 'Feedback message', tag: 'textarea', type: undefined, placeholder: 'Tell us how we can improve', role: 'textbox' },
    { target: 'Bug description', tag: 'textarea', type: undefined, placeholder: 'Steps to reproduce the issue...', role: 'textbox' },
    { target: 'Bio summary', tag: 'textarea', type: undefined, placeholder: 'Short bio about yourself', role: 'textbox' },
    { target: 'Quantity', tag: 'input', type: 'number', placeholder: '1', role: 'spinbutton' },
    { target: 'Price minimum', tag: 'input', type: 'number', placeholder: 'Min Price', role: 'spinbutton' },
    { target: 'Price maximum', tag: 'input', type: 'number', placeholder: 'Max Price', role: 'spinbutton' },
    { target: 'Birth date', tag: 'input', type: 'date', placeholder: 'YYYY-MM-DD', role: 'textbox' },
    { target: 'Username', tag: 'input', type: 'text', placeholder: 'Choose a unique username', role: 'textbox' },
  ];

  formFields.forEach((field, idx) => {
    const elId = `input_${idx + 1}`;
    const nameAttr = field.target.toLowerCase().replace(/\s+/g, '_');
    add(
      `FORM_${idx + 1}`,
      'Form & Placeholder',
      `Type target "${field.target}" into input with placeholder "${field.placeholder}"`,
      { text: field.target, action: 'type' },
      [
        { id: 'form_label_noise', tag: 'label', role: 'text', text: field.target, visible: true, enabled: true, editable: false },
        { id: elId, tag: field.tag, role: field.role, type: field.type, placeholder: field.placeholder, name: nameAttr, parent_text: field.target, text: '', visible: true, enabled: true, editable: true },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 6: Ordinal & Visual Row Matching (20 scenarios)
  // =========================================================================
  for (let i = 1; i <= 20; i++) {
    const ordinalNum = (i % 3) + 1; // 1, 2, or 3
    const ordinalWords = ['first', 'second', 'third'];
    const word = ordinalWords[ordinalNum - 1];

    const cardElements: PageElement[] = [
      { id: `card_${i}_1`, tag: 'button', role: 'button', text: 'Select Plan', bbox: [50, 100, 100, 40], visible: true, enabled: true, editable: false },
      { id: `card_${i}_2`, tag: 'button', role: 'button', text: 'Select Plan', bbox: [50, 200, 100, 40], visible: true, enabled: true, editable: false },
      { id: `card_${i}_3`, tag: 'button', role: 'button', text: 'Select Plan', bbox: [50, 300, 100, 40], visible: true, enabled: true, editable: false },
    ];

    add(
      `ORDINAL_${i}`,
      'Ordinal Resolution',
      `Click the ${word} Select Plan button`,
      { text: `Click the ${word} Select Plan`, action: 'click' },
      cardElements,
      'MATCHED',
      `card_${i}_${ordinalNum}`
    );
  }

  // =========================================================================
  // CATEGORY 7: Context Disambiguation (15 scenarios)
  // =========================================================================
  const contextPairs = [
    { target: 'Email', ctx: 'Billing Info', matchedParent: 'Billing Info Contact Details', noiseParent: 'Newsletter Footer' },
    { target: 'Password', ctx: 'Admin Portal', matchedParent: 'Admin Portal Sign-In', noiseParent: 'User Sign-In' },
    { target: 'Save', ctx: 'Profile Picture', matchedParent: 'Profile Picture Avatar Settings', noiseParent: 'Account Security' },
    { target: 'Delete', ctx: 'Workspace Team', matchedParent: 'Workspace Team Member Settings', noiseParent: 'Personal Account' },
    { target: 'Download', ctx: 'Invoice 2026', matchedParent: 'Invoice 2026 Billing Receipt', noiseParent: 'Brochure PDF' },
    { target: 'Subscribe', ctx: 'Pro Plan', matchedParent: 'Pro Plan Subscription Tier', noiseParent: 'Free Newsletter' },
    { target: 'Edit', ctx: 'Shipping Address', matchedParent: 'Shipping Address Delivery Destination', noiseParent: 'Billing Address' },
    { target: 'Confirm', ctx: 'Payment Gateway', matchedParent: 'Payment Gateway Credit Card', noiseParent: 'Email Verification' },
    { target: 'Apply', ctx: 'Job Application', matchedParent: 'Job Application Career Form', noiseParent: 'Promo Voucher' },
    { target: 'Select', ctx: 'Standard Delivery', matchedParent: 'Standard Delivery 3-5 Days Shipping', noiseParent: 'Express Shipping' },
    { target: 'Submit', ctx: 'Bug Report', matchedParent: 'Bug Report Issue Tracker Form', noiseParent: 'General Feedback' },
    { target: 'View', ctx: 'Order #9821', matchedParent: 'Order #9821 Receipt History', noiseParent: 'Recommended Items' },
    { target: 'Enable', ctx: 'Two Factor Auth', matchedParent: 'Two Factor Auth 2FA Security Settings', noiseParent: 'SMS Notifications' },
    { target: 'Connect', ctx: 'GitHub Account', matchedParent: 'GitHub Account OAuth Integration', noiseParent: 'Slack Webhook' },
    { target: 'Export', ctx: 'Analytics Report', matchedParent: 'Analytics Report Traffic Metrics', noiseParent: 'Raw Audit Log' },
  ];

  contextPairs.forEach((pair, idx) => {
    const elId = `ctx_${idx + 1}_target`;
    add(
      `CONTEXT_${idx + 1}`,
      'Context Disambiguation',
      `Match "${pair.target}" with context "${pair.ctx}"`,
      { text: pair.target, context: pair.ctx, action: 'click' },
      [
        { id: `ctx_${idx + 1}_noise`, tag: 'button', role: 'button', text: pair.target, parent_text: pair.noiseParent, visible: true, enabled: true, editable: false },
        { id: elId, tag: 'button', role: 'button', text: pair.target, parent_text: pair.matchedParent, visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 8: Ambiguity Protection (15 scenarios - MUST return AMBIGUOUS)
  // =========================================================================
  for (let i = 1; i <= 15; i++) {
    add(
      `AMBIGUOUS_${i}`,
      'Ambiguity Protection',
      `Detect ambiguous identical candidates for "Delete Item ${i}"`,
      { text: `Delete Item`, action: 'click' },
      [
        { id: `amb_a_${i}`, tag: 'button', role: 'button', text: 'Delete Item', visible: true, enabled: true, editable: false },
        { id: `amb_b_${i}`, tag: 'button', role: 'button', text: 'Delete Item', visible: true, enabled: true, editable: false },
      ],
      'AMBIGUOUS',
      undefined,
      true
    );
  }

  // =========================================================================
  // CATEGORY 9: Stale Element Recovery (15 scenarios)
  // =========================================================================
  for (let i = 1; i <= 15; i++) {
    const oldFp = {
      tag: 'button',
      role: 'button',
      normalizedText: `save draft ${i}`,
      normalizedAria: '',
      normalizedPlaceholder: '',
      normalizedName: '',
      type: 'button',
      normalizedParentText: 'editor container',
      signature: `button|button|save draft ${i}`,
    };

    add(
      `STALE_${i}`,
      'Stale Element Recovery',
      `Recover stale element ID el_stale_${i} after DOM re-render`,
      {
        elementId: `el_stale_${i}`,
        text: `Save Draft ${i}`,
        action: 'click',
        expectedFingerprint: oldFp,
      },
      [
        { id: 'el_other', tag: 'button', role: 'button', text: 'Discard', visible: true, enabled: true, editable: false },
        { id: `el_fresh_${i}`, tag: 'button', role: 'button', text: `Save Draft ${i}`, parent_text: 'Editor Container', visible: true, enabled: true, editable: false },
      ],
      'MATCHED',
      `el_fresh_${i}`
    );
  }

  // =========================================================================
  // CATEGORY 10: Adversarial Substring & Distractor Cases (15 scenarios)
  // =========================================================================
  const adversarialCases = [
    { target: 'Search', correct: 'Search', distractors: ['Search History', 'Search Settings', 'Search Documentation'] },
    { target: 'Login', correct: 'Login', distractors: ['Login Help', 'Login with Google', 'Login with Apple', 'Login FAQ'] },
    { target: 'Checkout', correct: 'Checkout', distractors: ['Checkout Policy', 'Express Checkout Help', 'Guest Checkout FAQ'] },
    { target: 'Profile', correct: 'Profile', distractors: ['Profile Picture', 'Public Profile Preview', 'Edit Profile Header'] },
    { target: 'Delete', correct: 'Delete', distractors: ['Delete Confirmation', 'Delete All Files', 'Delete Trash Bin'] },
    { target: 'Settings', correct: 'Settings', distractors: ['Account Settings', 'Privacy Settings', 'Theme Settings'] },
    { target: 'Help', correct: 'Help', distractors: ['Help Center', 'Help Community', 'Help Articles'] },
    { target: 'Download', correct: 'Download', distractors: ['Download Manager', 'Download PDF Log', 'Download App'] },
    { target: 'Subscribe', correct: 'Subscribe', distractors: ['Subscribe Newsletter', 'Manage Subscriptions', 'Unsubscribe'] },
    { target: 'Cart', correct: 'Cart', distractors: ['Cart Summary', 'Add to Cart', 'Empty Cart'] },
    { target: 'Contact', correct: 'Contact', distractors: ['Contact Support', 'Contact Sales', 'Contact Directory'] },
    { target: 'Security', correct: 'Security', distractors: ['Security Log', 'Security Checklist', 'Security Warnings'] },
    { target: 'Feedback', correct: 'Feedback', distractors: ['Feedback History', 'Give Product Feedback', 'Feedback Form'] },
    { target: 'Billing', correct: 'Billing', distractors: ['Billing FAQ', 'Billing Invoices', 'Billing Address'] },
    { target: 'Notifications', correct: 'Notifications', distractors: ['Notifications Bell', 'Notification Preferences', 'Mute Notifications'] },
  ];

  adversarialCases.forEach((adv, idx) => {
    const elId = `adv_target_${idx + 1}`;
    const candidates: PageElement[] = [
      { id: elId, tag: 'button', role: 'button', text: adv.correct, visible: true, enabled: true, editable: false },
    ];
    adv.distractors.forEach((d, dIdx) => {
      candidates.push({
        id: `adv_dist_${idx + 1}_${dIdx}`,
        tag: 'button',
        role: 'button',
        text: d,
        visible: true,
        enabled: true,
        editable: false,
      });
    });

    add(
      `ADVERSARIAL_${idx + 1}`,
      'Adversarial Distractors',
      `Match exact "${adv.correct}" among lengthier distractors`,
      { text: adv.target, action: 'click' },
      candidates,
      'MATCHED',
      elId
    );
  });

  // =========================================================================
  // CATEGORY 11: Real-World Web Scenarios (Navigation, Auth, Shopping, Dialogs) (15 scenarios)
  // =========================================================================
  const realWorldScenarios = [
    {
      desc: 'Amazon-style shopping header',
      target: { text: 'Search products', action: 'type' as const },
      elements: [
        { id: 'rw_nav_logo', tag: 'a', role: 'link', text: 'Store Logo', visible: true, enabled: true, editable: false },
        { id: 'rw_search_box', tag: 'input', role: 'searchbox', text: '', type: 'text', placeholder: 'Search products, brands and more', visible: true, enabled: true, editable: true },
        { id: 'rw_search_btn', tag: 'button', role: 'button', text: 'Go', aria_label: 'Submit search', visible: true, enabled: true, editable: false },
        { id: 'rw_cart_btn', tag: 'a', role: 'link', text: 'Cart', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_search_box',
    },
    {
      desc: 'Google-style sign-in page',
      target: { text: 'Next', action: 'click' as const },
      elements: [
        { id: 'rw_email', tag: 'input', role: 'textbox', text: '', type: 'email', placeholder: 'Email or phone', visible: true, enabled: true, editable: true },
        { id: 'rw_forgot', tag: 'a', role: 'link', text: 'Forgot email?', visible: true, enabled: true, editable: false },
        { id: 'rw_create', tag: 'button', role: 'button', text: 'Create account', visible: true, enabled: true, editable: false },
        { id: 'rw_next', tag: 'button', role: 'button', text: 'Next', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_next',
    },
    {
      desc: 'GitHub-style repository page',
      target: { text: 'Clone repository', action: 'click' as const },
      elements: [
        { id: 'rw_code_btn', tag: 'button', role: 'button', text: 'Code', aria_label: 'Clone or download repository', visible: true, enabled: true, editable: false },
        { id: 'rw_star_btn', tag: 'button', role: 'button', text: 'Star', visible: true, enabled: true, editable: false },
        { id: 'rw_fork_btn', tag: 'button', role: 'button', text: 'Fork', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_code_btn',
    },
    {
      desc: 'Modal confirmation dialog',
      target: { text: 'Confirm Deletion', action: 'click' as const },
      elements: [
        { id: 'rw_modal_body', tag: 'div', role: 'dialog', text: 'Are you sure you want to delete this project?', visible: true, enabled: true, editable: false },
        { id: 'rw_cancel_btn', tag: 'button', role: 'button', text: 'Cancel', visible: true, enabled: true, editable: false },
        { id: 'rw_confirm_btn', tag: 'button', role: 'button', text: 'Confirm Deletion', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_confirm_btn',
    },
    {
      desc: 'Rich-text chat prompt box',
      target: { text: 'Ask a question', action: 'type' as const },
      elements: [
        { id: 'rw_chat_history', tag: 'div', role: 'region', text: 'Previous conversation history...', visible: true, enabled: true, editable: false },
        { id: 'rw_prompt_input', tag: 'div', role: 'textbox', text: '', editable: true, placeholder: 'Message or ask a question...', visible: true, enabled: true },
        { id: 'rw_send_btn', tag: 'button', role: 'button', text: 'Send', aria_label: 'Send message', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_prompt_input',
    },
    {
      desc: 'Product filter sidebar checkbox',
      target: { text: 'In Stock Only', action: 'check' as const },
      elements: [
        { id: 'rw_filter_heading', tag: 'h3', role: 'heading', text: 'Availability', visible: true, enabled: true, editable: false },
        { id: 'rw_stock_chk', tag: 'input', role: 'checkbox', type: 'checkbox', text: 'In Stock Only', visible: true, enabled: true, editable: false },
        { id: 'rw_deals_chk', tag: 'input', role: 'checkbox', type: 'checkbox', text: 'Special Deals', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_stock_chk',
    },
    {
      desc: 'Country dropdown selector',
      target: { text: 'Select Country', action: 'select' as const },
      elements: [
        { id: 'rw_addr_input', tag: 'input', role: 'textbox', text: '', type: 'text', placeholder: 'Address line 1', visible: true, enabled: true, editable: true },
        { id: 'rw_country_select', tag: 'select', role: 'combobox', text: 'Select Country', visible: true, enabled: true, editable: false },
        { id: 'rw_zip_input', tag: 'input', role: 'textbox', text: '', type: 'text', placeholder: 'Zip Code', visible: true, enabled: true, editable: true },
      ],
      expectedId: 'rw_country_select',
    },
    {
      desc: 'Video player control button',
      target: { text: 'Play video', action: 'click' as const },
      elements: [
        { id: 'rw_v_seek', tag: 'div', role: 'slider', text: '', aria_label: 'Seek slider', visible: true, enabled: true, editable: false },
        { id: 'rw_v_play', tag: 'button', role: 'button', text: '', aria_label: 'Play (k)', visible: true, enabled: true, editable: false },
        { id: 'rw_v_mute', tag: 'button', role: 'button', text: '', aria_label: 'Mute (m)', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_v_play',
    },
    {
      desc: 'Tabbed navigation switcher',
      target: { text: 'Billing History', action: 'click' as const },
      elements: [
        { id: 'rw_tab_general', tag: 'button', role: 'tab', text: 'General', visible: true, enabled: true, editable: false },
        { id: 'rw_tab_security', tag: 'button', role: 'tab', text: 'Security', visible: true, enabled: true, editable: false },
        { id: 'rw_tab_billing', tag: 'button', role: 'tab', text: 'Billing History', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_tab_billing',
    },
    {
      desc: 'Cookie consent banner acceptance',
      target: { text: 'Accept all cookies', action: 'click' as const },
      elements: [
        { id: 'rw_cookie_text', tag: 'p', role: 'text', text: 'We use cookies to improve your experience.', visible: true, enabled: true, editable: false },
        { id: 'rw_cookie_reject', tag: 'button', role: 'button', text: 'Reject non-essential', visible: true, enabled: true, editable: false },
        { id: 'rw_cookie_accept', tag: 'button', role: 'button', text: 'Accept All Cookies', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_cookie_accept',
    },
    {
      desc: 'Pagination next page link',
      target: { text: 'Next page', action: 'click' as const },
      elements: [
        { id: 'rw_page_1', tag: 'a', role: 'link', text: '1', visible: true, enabled: true, editable: false },
        { id: 'rw_page_2', tag: 'a', role: 'link', text: '2', visible: true, enabled: true, editable: false },
        { id: 'rw_page_next', tag: 'a', role: 'link', text: 'Next >', aria_label: 'Go to next page', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_page_next',
    },
    {
      desc: 'Dark mode theme toggle switch',
      target: { text: 'Dark theme', action: 'check' as const },
      elements: [
        { id: 'rw_theme_toggle', tag: 'input', role: 'switch', text: '', type: 'checkbox', aria_label: 'Dark theme toggle', visible: true, enabled: true, editable: false },
        { id: 'rw_theme_label', tag: 'span', role: 'text', text: 'Dark theme', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_theme_toggle',
    },
    {
      desc: 'Multi-step wizard continue button',
      target: { text: 'Proceed to Payment', action: 'click' as const },
      elements: [
        { id: 'rw_wiz_back', tag: 'button', role: 'button', text: 'Back to shipping', visible: true, enabled: true, editable: false },
        { id: 'rw_wiz_next', tag: 'button', role: 'button', text: 'Proceed to Payment', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_wiz_next',
    },
    {
      desc: 'Form password reset link',
      target: { text: 'Forgot your password', action: 'click' as const },
      elements: [
        { id: 'rw_auth_email', tag: 'input', role: 'textbox', text: '', placeholder: 'Email', visible: true, enabled: true, editable: true },
        { id: 'rw_auth_pass', tag: 'input', role: 'textbox', text: '', placeholder: 'Password', visible: true, enabled: true, editable: true },
        { id: 'rw_auth_forgot', tag: 'a', role: 'link', text: 'Forgot your password?', visible: true, enabled: true, editable: false },
        { id: 'rw_auth_btn', tag: 'button', role: 'button', text: 'Sign in', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_auth_forgot',
    },
    {
      desc: 'Download CSV export button',
      target: { text: 'Export CSV', action: 'click' as const },
      elements: [
        { id: 'rw_table_filter', tag: 'input', role: 'textbox', text: '', placeholder: 'Filter table...', visible: true, enabled: true, editable: true },
        { id: 'rw_table_export', tag: 'button', role: 'button', text: 'Export CSV', aria_label: 'Download table data as CSV', visible: true, enabled: true, editable: false },
      ],
      expectedId: 'rw_table_export',
    },
  ];

  realWorldScenarios.forEach((scen, idx) => {
    add(
      `REALWORLD_${idx + 1}`,
      'Real-World DOMs',
      scen.desc,
      scen.target,
      scen.elements,
      'MATCHED',
      scen.expectedId
    );
  });

  // =========================================================================
  // CATEGORY 12: No-Match Unrelated Queries (10 scenarios)
  // =========================================================================
  const noMatchQueries = [
    'Book Flight Tickets to Tokyo',
    'Download Financial Annual Audit PDF 2025',
    'Transfer Bitcoin Wallet Balance',
    'Open Spotify Playlist Controls',
    'Order Pepperoni Pizza Delivery',
    'Configure Kubernetes Cluster Nodes',
    'Connect Bluetooth Gaming Controller',
    'Render 3D Unreal Engine Scene',
    'Stream Live Twitch Broadcast',
    'Calibrate Smart Thermostat Sensors',
  ];

  noMatchQueries.forEach((q, idx) => {
    add(
      `NOMATCH_${idx + 1}`,
      'No-Match Negative',
      `Reject unrelated query "${q}"`,
      { text: q, action: 'click' },
      [
        { id: 'nm_1', tag: 'button', role: 'button', text: 'Home', visible: true, enabled: true, editable: false },
        { id: 'nm_2', tag: 'button', role: 'button', text: 'Products', visible: true, enabled: true, editable: false },
        { id: 'nm_3', tag: 'button', role: 'button', text: 'About Us', visible: true, enabled: true, editable: false },
      ],
      'NO_MATCH'
    );
  });

  return dataset;
}

/**
 * Runs the benchmark dataset against a given ElementMatcher instance and ablation mode.
 */
export function runBenchmark(
  matcher: ElementMatcher,
  dataset: BenchmarkScenario[],
  ablation: AblationMode = 'FULL',
  configOverride?: Partial<MatchingConfig>
): BenchmarkResults {
  const latencies: number[] = [];
  const failedScenarios: Array<{ id: string; expected: string; actual: string; reason: string }> = [];

  let correctTop1 = 0;
  let correctTop3 = 0;
  let falsePositives = 0;
  let ambiguousCorrect = 0;
  let ambiguousTotal = 0;
  let noMatchCorrect = 0;
  let noMatchTotal = 0;
  let staleCorrect = 0;
  let staleTotal = 0;

  for (const scenario of dataset) {
    const t0 = performance.now();
    const result = scenario.target.elementId && scenario.target.expectedFingerprint
      ? matcher.resolveElement(scenario.target, scenario.elements, scenario.target.expectedFingerprint)
      : matcher.match(scenario.target, scenario.elements, configOverride, ablation);
    const elapsed = performance.now() - t0;
    latencies.push(elapsed);

    const isStaleScenario = scenario.category === 'Stale Element Recovery';
    const isNoMatchScenario = scenario.expectedStatus === 'NO_MATCH';
    const isAmbiguousScenario = scenario.expectedStatus === 'AMBIGUOUS';

    if (isStaleScenario) staleTotal++;
    if (isNoMatchScenario) noMatchTotal++;
    if (isAmbiguousScenario) ambiguousTotal++;

    // Evaluate Result
    if (isNoMatchScenario) {
      if (result.status === 'NO_MATCH' || !result.matched) {
        noMatchCorrect++;
        correctTop1++;
        correctTop3++;
      } else {
        falsePositives++;
        failedScenarios.push({
          id: scenario.id,
          expected: 'NO_MATCH',
          actual: `${result.status} (${result.elementId})`,
          reason: result.reason,
        });
      }
      continue;
    }

    if (isAmbiguousScenario) {
      if (result.status === 'AMBIGUOUS') {
        ambiguousCorrect++;
        correctTop1++;
        correctTop3++;
      } else {
        if (result.matched) falsePositives++;
        failedScenarios.push({
          id: scenario.id,
          expected: 'AMBIGUOUS',
          actual: `${result.status} (${result.elementId})`,
          reason: result.reason,
        });
      }
      continue;
    }

    // Normal matching scenarios
    if (result.matched && result.elementId === scenario.expectedElementId) {
      correctTop1++;
      correctTop3++;
      if (isStaleScenario) staleCorrect++;
    } else {
      // Check top 3 recall
      const inTop3 = result.candidates.slice(0, 3).some((c) => c.elementId === scenario.expectedElementId);
      if (inTop3) {
        correctTop3++;
      }

      if (result.matched && result.elementId !== scenario.expectedElementId) {
        falsePositives++;
      }

      failedScenarios.push({
        id: scenario.id,
        expected: `${scenario.expectedStatus} [${scenario.expectedElementId}]`,
        actual: `${result.status} [${result.elementId}]`,
        reason: result.reason,
      });
    }
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const total = dataset.length;
  const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / total;
  const p95Index = Math.floor(total * 0.95);
  const p95Latency = latencies[p95Index] || latencies[latencies.length - 1];

  return {
    totalScenarios: total,
    top1Accuracy: Number(((correctTop1 / total) * 100).toFixed(2)),
    top3Recall: Number(((correctTop3 / total) * 100).toFixed(2)),
    falsePositiveRate: Number(((falsePositives / total) * 100).toFixed(2)),
    ambiguousPrecision: ambiguousTotal > 0 ? Number(((ambiguousCorrect / ambiguousTotal) * 100).toFixed(2)) : 100,
    noMatchAccuracy: noMatchTotal > 0 ? Number(((noMatchCorrect / noMatchTotal) * 100).toFixed(2)) : 100,
    staleRecoveryRate: staleTotal > 0 ? Number(((staleCorrect / staleTotal) * 100).toFixed(2)) : 100,
    avgLatencyMs: Number(avgLatency.toFixed(3)),
    p95LatencyMs: Number(p95Latency.toFixed(3)),
    latencies,
    failedScenarios,
  };
}

export function runAblationStudy(dataset: BenchmarkScenario[]): Record<AblationMode, BenchmarkResults> {
  const matcher = new ElementMatcher();
  const modes: AblationMode[] = [
    'EXACT_ONLY',
    'TEXT_ROLE',
    'TEXT_ROLE_ARIA',
    'TEXT_ROLE_CONTEXT',
    'FULL',
  ];

  const results: Partial<Record<AblationMode, BenchmarkResults>> = {};
  for (const mode of modes) {
    results[mode] = runBenchmark(matcher, dataset, mode);
  }

  return results as Record<AblationMode, BenchmarkResults>;
}

export function runThresholdTuning(dataset: BenchmarkScenario[]): Array<{ name: string; config: Partial<MatchingConfig>; results: BenchmarkResults }> {
  const matcher = new ElementMatcher();

  const configs: Array<{ name: string; config: Partial<MatchingConfig> }> = [
    {
      name: 'Aggressive (accept: 0.55, margin: 0.04)',
      config: { confidence: { ...DEFAULT_MATCHING_CONFIG.confidence, accept: 0.55, ambiguous: 0.45, minimumMargin: 0.04 } },
    },
    {
      name: 'Conservative (accept: 0.75, margin: 0.12)',
      config: { confidence: { ...DEFAULT_MATCHING_CONFIG.confidence, accept: 0.75, ambiguous: 0.60, minimumMargin: 0.12 } },
    },
    {
      name: 'Default Balanced (accept: 0.65, margin: 0.07)',
      config: DEFAULT_MATCHING_CONFIG,
    },
  ];

  return configs.map((c) => ({
    name: c.name,
    config: c.config,
    results: runBenchmark(matcher, dataset, 'FULL', c.config),
  }));
}

// CLI Execution entry point
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('benchmark-harness')) {
  console.log('\x1b[36m======================================================================\x1b[0m');
  console.log('\x1b[32m🚀 PilotRaven Universal Element Matching Engine Benchmark\x1b[0m');
  console.log('\x1b[36m======================================================================\x1b[0m\n');

  const dataset = generateBenchmarkDataset();
  console.log(`Generated \x1b[1m${dataset.length}\x1b[0m benchmark scenarios across 12 distinct categories.\n`);

  const matcher = new ElementMatcher();
  const benchmark = runBenchmark(matcher, dataset, 'FULL');

  console.log('## ELEMENT MATCHING BENCHMARK RESULTS');
  console.log('----------------------------------------------------');
  console.log(`Total Scenarios:         ${benchmark.totalScenarios}`);
  console.log(`Top-1 Accuracy:          \x1b[32m${benchmark.top1Accuracy}%\x1b[0m`);
  console.log(`Top-3 Recall:            \x1b[32m${benchmark.top3Recall}%\x1b[0m`);
  console.log(`False Positive Rate:     \x1b[33m${benchmark.falsePositiveRate}%\x1b[0m`);
  console.log(`Ambiguous Case Precision:\x1b[32m${benchmark.ambiguousPrecision}%\x1b[0m`);
  console.log(`No-Match Accuracy:       \x1b[32m${benchmark.noMatchAccuracy}%\x1b[0m`);
  console.log(`Stale Element Recovery:  \x1b[32m${benchmark.staleRecoveryRate}%\x1b[0m`);
  console.log(`Average Latency:         \x1b[36m${benchmark.avgLatencyMs} ms\x1b[0m`);
  console.log(`P95 Latency:             \x1b[36m${benchmark.p95LatencyMs} ms\x1b[0m`);
  console.log('----------------------------------------------------\n');

  if (benchmark.failedScenarios.length > 0) {
    console.log(`Failed / Ambiguous Discrepancies (${benchmark.failedScenarios.length}):`);
    benchmark.failedScenarios.slice(0, 5).forEach((f) => {
      console.log(`  - [${f.id}] Expected: ${f.expected} | Actual: ${f.actual} (${f.reason})`);
    });
    console.log('');
  }

  console.log('## ABLATION STUDY RESULTS');
  console.log('----------------------------------------------------');
  const ablation = runAblationStudy(dataset);
  console.log(`1. Exact Only:           Top-1: ${ablation.EXACT_ONLY.top1Accuracy}% | Latency: ${ablation.EXACT_ONLY.avgLatencyMs}ms`);
  console.log(`2. Text + Role:          Top-1: ${ablation.TEXT_ROLE.top1Accuracy}% | Latency: ${ablation.TEXT_ROLE.avgLatencyMs}ms`);
  console.log(`3. Text + Role + ARIA:   Top-1: ${ablation.TEXT_ROLE_ARIA.top1Accuracy}% | Latency: ${ablation.TEXT_ROLE_ARIA.avgLatencyMs}ms`);
  console.log(`4. Text + Role + Context:Top-1: ${ablation.TEXT_ROLE_CONTEXT.top1Accuracy}% | Latency: ${ablation.TEXT_ROLE_CONTEXT.avgLatencyMs}ms`);
  console.log(`5. Full Cascade Matcher: Top-1: \x1b[32m${ablation.FULL.top1Accuracy}%\x1b[0m | Latency: \x1b[36m${ablation.FULL.avgLatencyMs}ms\x1b[0m`);
  console.log('----------------------------------------------------\n');

  console.log('## THRESHOLD TUNING EVALUATION');
  console.log('----------------------------------------------------');
  const tuning = runThresholdTuning(dataset);
  tuning.forEach((t) => {
    console.log(`* ${t.name}: Top-1: ${t.results.top1Accuracy}% | FPR: ${t.results.falsePositiveRate}% | Ambiguous Precision: ${t.results.ambiguousPrecision}%`);
  });
  console.log('----------------------------------------------------\n');
}
