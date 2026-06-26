#!/usr/bin/env node

/*
 * Focused assertions for the Inbox action payload contract.
 *
 * Feature notes:
 * Uses existing Wolstencroft local fixtures to verify actionTitle/actionCategory
 * derivation, evidence-only TraceMarkdown, bounded source-note evidence, and
 * contract warnings for legacy compound checkbox text. This test does not write
 * CRM, SQL, summary, accumulated-action, or index artifacts.
 */

const assert = require('assert');
const { buildPayloadsForFiles, payloadContractWarnings } = require('./post-inbox');

const wolstencroftActionsPath = 'data/0/daily-triage/2026/05/29/actions-2026-05-29.md';

const payloadItems = buildPayloadsForFiles({
  filePaths: [wolstencroftActionsPath],
  importDate: '2026-05-29',
  includeChecked: false,
  skipRemoved: true,
  status: 'open',
});

const wolstencroftItem = payloadItems.find((item) => (
  item.payload.accountId === 101
  && /wolstencroft/i.test(item.payload.actionTitle || '')
));

assert(wolstencroftItem, 'expected Wolstencroft account 101 payload');

const { payload } = wolstencroftItem;
assert.strictEqual(payload.actionCategory, 'relationship owner review');
assert.strictEqual(payload.actionTitle, "Confirm Wolstencroft's leadership coverage after Roman St. Germain's resignation");
assert.match(payload.actionText, /Purpose:/);
assert.match(payload.traceMarkdown, /#### Source note evidence/);
assert.match(payload.traceMarkdown, /Note: 2232/);
assert.doesNotMatch(payload.traceMarkdown, /####\s+Insight/i);
assert.doesNotMatch(payload.traceMarkdown, /####\s+Tensions/i);
assert.doesNotMatch(payload.traceMarkdown, /####\s+Memory/i);

const warnings = payloadContractWarnings([wolstencroftItem]).map((warning) => warning.warning);
assert(warnings.includes('purpose-clause-in-action-text'), 'expected Purpose clause warning');
assert(warnings.includes('possible-compound-action-purpose-and'), 'expected compound-action warning');

console.log('Inbox action contract assertions passed.');
