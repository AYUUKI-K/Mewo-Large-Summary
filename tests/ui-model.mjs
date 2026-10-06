// No browser or host needed: persisted window geometry and reader fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelFrame } from '../modules/floating-panel.js';
import { renderSummaryReader } from '../modules/summary-reader.js';

test('a saved desktop window stays reachable after switching to a phone', () => {
    const result = clampPanelFrame({ x: 1400, y: 800, width: 640, height: 720 }, { width: 360, height: 740 });
    assert.deepEqual(result, { x: 12, y: 12, width: 336, height: 716 });
    const compactDesktop = clampPanelFrame({ height: 300 }, { width: 360, height: 740 });
    assert.equal(compactDesktop.height, 716, 'phone layout uses the available height even after resizing on desktop');
});

test('a resized keyboard viewport keeps the title bar and close button reachable', () => {
    const result = clampPanelFrame({ x: -500, y: 580, width: 420, height: 680 }, { width: 390, height: 220 });
    assert.equal(result.x, 12);
    assert.equal(result.y, 12);
    assert.equal(result.height, 196);
    assert.ok(result.x + result.width <= 378);
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
