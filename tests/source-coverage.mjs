import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoveragePlan, captureCoverageSources, missingCoverage, thresholdBudgetWarning } from '../modules/source-coverage.js';
import { summarySourceChanged, historyDigest } from '../modules/summary-model.js';

test('coverage maps filtered host indices back to raw floors without modifying input', () => {
    const chat = [{ mes: '隐藏', is_system: true }, { mes: '原文A' }, { mes: '原文B' }];
    const core = [{ index: 0, mes: '处理后A' }, { index: 1, mes: '处理后B' }];
    const original = structuredClone({ chat, core });
    const plan = createCoveragePlan(chat);
    captureCoverageSources(plan, core);
    assert.deepEqual(missingCoverage(plan.sources, [{ content: '处理后B' }]), [1]);
    assert.deepEqual(missingCoverage(plan.sources, [{ content: '处理后A' }, { content: '处理后B' }]), []);
    assert.deepEqual({ chat, core }, original);
});

test('duplicate lines need distinct occurrences and removed messages stay missing', () => {
    assert.deepEqual(missingCoverage([{ index: 0, text: '同一句话' }, { index: 1, text: '同一句话' }], '同一句话'), [1]);
    const plan = createCoveragePlan([{ mes: 'A' }, { mes: 'B' }]);
    captureCoverageSources(plan, [{ index: 1, mes: 'B' }]);
    assert.deepEqual(missingCoverage(plan.sources, 'A B'), [0]);
});

test('hidden tool messages do not shift visible floor mapping', () => {
    const chat = [{ mes: '工具', is_system: true, extra: { tool_invocations: [] } }, { mes: '剧情' }];
    const plan = createCoveragePlan(chat);
    captureCoverageSources(plan, [{ index: 0, mes: '工具', is_system: true }, { index: 1, mes: '剧情' }]);
    assert.deepEqual(missingCoverage(plan.sources, '剧情'), []);
});

test('source validity ignores appended messages and visibility but detects old edits/swipes/deletion', () => {
    const chat = [{ mes: '旧事', swipe_id: 0 }, { mes: '接续' }];
    const meta = { sourceEnd: 1, sourceDigest: historyDigest(chat, 1) };
    chat.push({ mes: '新增' });
    chat[0].is_system = true;
    assert.equal(summarySourceChanged(chat, meta), false);
    chat[0].swipe_id = 1;
    assert.equal(summarySourceChanged(chat, meta), true);
    chat[0].swipe_id = 0;
    chat[0].mes = '修改旧事';
    assert.equal(summarySourceChanged(chat, meta), true);
    assert.equal(summarySourceChanged([], meta), true);
    assert.equal(summarySourceChanged(chat, { sourceEnd: 1 }), false, 'legacy unknown provenance is not falsely invalidated');
});

test('budget warnings are advisory and absent for ample/unknown budgets', () => {
    assert.equal(thresholdBudgetWarning(60000, 120000), '');
    assert.equal(thresholdBudgetWarning(60000, null), '');
    assert.match(thresholdBudgetWarning(60000, 30000), /可能无法触发/);
    assert.match(thresholdBudgetWarning(60000, 60000), /不会自动修改/);
});
