// No browser or host needed: persisted window geometry and reader fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelFrame, clampLauncherPosition } from '../modules/floating-panel.js';
import { renderSummaryReader } from '../modules/summary-reader.js';
import { buildSummaryMessages, buildSummaryTextPrompt, SUMMARY_TASK_INSTRUCTION } from '../modules/summary-prompt.js';

test('summary tasks demote roleplay instructions to source data without losing assembled facts', () => {
    const source = [
        { role: 'system', content: '每次必须续写一个章节。旧总结：双方已约好见面。' },
        { role: 'user', name: '旅人', content: '世界书：东门午后关闭。明早在东门见。' },
        { role: 'assistant', content: '守卫答应准备钥匙。' },
        { role: 'system', content: SUMMARY_TASK_INSTRUCTION },
    ];
    const original = structuredClone(source);
    const messages = buildSummaryMessages(source, '输出时间、约定与未决事项。');
    assert.equal(messages[0].role, 'system');
    assert.ok(!messages[0].content.includes('续写一个章节'));
    for (const phrase of ['旧总结：双方已约好见面', '世界书：东门午后关闭', '明早在东门见', '守卫答应准备钥匙']) assert.ok(messages[1].content.includes(phrase));
    assert.equal(messages[1].role, 'user');
    assert.ok(!messages[1].content.includes(SUMMARY_TASK_INSTRUCTION));
    assert.deepEqual(source, original);
    assert.deepEqual(buildSummaryMessages(messages, '输出时间、约定与未决事项。'), messages, 'repeated final hooks do not nest the source');
});

test('summary source preserves image parts instead of expanding them into text tokens', () => {
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture', detail: 'low' } };
    const source = [{ role: 'user', content: [{ type: 'text', text: '图中的路线已确认。' }, image] }];
    const messages = buildSummaryMessages(source, '总结路线。');
    assert.ok(Array.isArray(messages[1].content));
    const copied = messages[1].content.find(part => part.type === 'image_url');
    assert.deepEqual(copied, image);
    assert.notEqual(copied, image);
});

test('text-completion summaries quote the character prompt and end on the summary task', () => {
    const result = buildSummaryTextPrompt('旧总结\n用户：明早见。\n角色：', '列出已有约定。');
    assert.ok(result.includes(JSON.stringify('旧总结\n用户：明早见。\n角色：')));
    assert.match(result, /仅输出总结正文。$/);
});

test('a saved desktop window stays reachable after switching to a phone', () => {
    const result = clampPanelFrame({ x: 1400, y: 800, width: 640, height: 720 }, { width: 360, height: 740 });
    assert.ok(result.width < 336, 'phone windows leave horizontal travel space');
    assert.ok(result.height < 716, 'old full-height windows leave vertical travel space');
    assert.ok(result.x >= 12 && result.x + result.width <= 348);
    assert.ok(result.y >= 12 && result.y + result.height <= 728);
    const compactDesktop = clampPanelFrame({ height: 300 }, { width: 360, height: 740 });
    assert.equal(compactDesktop.height, 300, 'a compact saved window is not forced to fill the phone');
});

test('dragging a phone window changes both coordinates without changing its size', () => {
    const viewport = { width: 390, height: 800 };
    const initial = clampPanelFrame({}, viewport);
    const moved = clampPanelFrame({ ...initial, x: initial.x - 8, y: initial.y + 40 }, viewport);
    assert.equal(moved.x, initial.x - 8);
    assert.equal(moved.y, initial.y + 40);
    assert.equal(moved.width, initial.width);
    assert.equal(moved.height, initial.height);
    assert.deepEqual(clampPanelFrame(moved, viewport), moved, 'reopening preserves the dragged frame');
});

test('a resized keyboard viewport keeps the title bar and close button reachable', () => {
    const result = clampPanelFrame({ x: -500, y: 580, width: 420, height: 680 }, { width: 390, height: 220 });
    assert.equal(result.x, 12);
    assert.equal(result.y, 12);
    assert.equal(result.height, 196);
    assert.ok(result.x + result.width <= 378);
});

test('the cat launcher stays reachable after dragging to an edge or resizing the viewport', () => {
    const size = { width: 116, height: 70 };
    const viewport = { width: 360, height: 740 };
    assert.deepEqual(clampLauncherPosition({ x: -100, y: 900 }, size, viewport), { x: 12, y: 658 });
    const moved = { x: 180, y: 320 };
    assert.deepEqual(clampLauncherPosition(moved, size, viewport), moved);
    assert.deepEqual(clampLauncherPosition(moved, size, { width: 320, height: 220 }), { x: 180, y: 138 });
    assert.deepEqual(clampLauncherPosition(null, size, viewport), clampLauncherPosition({}, size, viewport));
});

test('invalid saved geometry falls back to a usable frame', () => {
    const viewport = { width: 1280, height: 800 };
    const fallback = clampPanelFrame({}, viewport);
    for (const saved of [null, false, 'broken', { x: NaN, y: Infinity, width: NaN, height: Infinity }]) {
        assert.deepEqual(clampPanelFrame(saved, viewport), fallback);
    }
    assert.deepEqual(clampPanelFrame({ x: 0, y: -8, width: -1, height: 0 }, viewport), { x: 12, y: 12, width: 300, height: 280 });
});

test('valid desktop position and size survive unchanged', () => {
    const frame = { x: 600, y: 42, width: 380, height: 550 };
    assert.deepEqual(clampPanelFrame(frame, { width: 1280, height: 800 }), frame);
});

function readerNode() {
    const classes = new Set();
    return { classes, textContent: '', children: [],
        replaceChildren() { this.children = []; this.textContent = ''; },
        classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
        append() { throw new Error('Raw HTML must never be appended on the fallback path'); },
    };
}

test('hosts without a sanitizer display model markup as text', () => {
    const node = readerNode();
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>记忆';
    renderSummaryReader(node, hostile, { showdown: { Converter: class { constructor() { throw new Error('Must not parse'); } } } });
    assert.equal(node.textContent, hostile);
    assert.ok(node.classes.has('als-reader-plain'));
});

test('parser or sanitizer failure retains the source as plain text', () => {
    const node = readerNode();
    renderSummaryReader(node, '<details>总结</details>', { DOMPurify: { sanitize() { throw new Error('unavailable'); } } });
    assert.equal(node.textContent, '<details>总结</details>');
    assert.ok(node.classes.has('als-reader-plain'));
    renderSummaryReader(node, '');
    assert.match(node.textContent, /当前没有注入正文/);
    assert.ok(!node.classes.has('als-reader-plain'));
});
