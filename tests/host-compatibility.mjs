import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLegacyInjection } from '../modules/injection-proof.js';
import { combineRequestSignals, withRequestSignal } from '../modules/network.js';

for (const scenario of ['ok', 'budget', 'wrong-book', 'disabled', 'regex', 'marker-stripped', 'exception', 'cancel']) {
    test(`1.14 dry preview provenance: ${scenario}`, async () => {
        const cachedEntry = { world: 'summary', uid: 1, content: '约定明日见面', disable: scenario === 'disabled' };
        const cachedBefore = structuredClone(cachedEntry);
        let listener, previews = 0, cancelled = false;
        const context = {
            eventTypes: { WORLDINFO_ENTRIES_LOADED: 'loaded' },
            eventSource: {
                on(event, handler) { assert.equal(event, 'loaded'); listener = handler; },
                makeLast() {},
                removeListener(event, handler) { assert.equal(handler, listener); listener = null; },
            },
        };
        const operation = verifyLegacyInjection(context, {
            matchesEntry: entry => entry.world === 'summary' && entry.uid === 1,
            expectedText: entry => scenario === 'regex' ? '' : entry.content,
            marker: 'MEWO_VERIFY_test-nonce',
            assertActive() { if (cancelled) throw new Error('cancelled'); },
            async preview() {
                previews++;
                const lore = { globalLore: scenario === 'wrong-book' ? [{ ...cachedEntry, world: 'other' }] : [cachedEntry] };
                listener(lore);
                assert.deepEqual(cachedEntry, cachedBefore, 'cached book is never modified');
                if (scenario === 'exception') throw new Error('preview failed');
                if (scenario === 'cancel') cancelled = true;
                // Duplicate content in chat cannot prove this lore entry passed budget.
                if (scenario === 'budget' || scenario === 'disabled') return `旧聊天引用：${cachedEntry.content}`;
                if (scenario === 'marker-stripped') return lore.globalLore[0].content.split('\n')[0];
                return [{ role: 'system', content: lore.globalLore[0].content }];
            },
        });
        if (scenario === 'ok') { await operation; assert.equal(previews, 2); }
        else await assert.rejects(operation);
        assert.equal(listener, null, 'temporary listener is always removed');
        assert.deepEqual(cachedEntry, cachedBefore);
    });
}

test('WebView cancellation forwards either abort and removes subscriptions after completion', () => {
    const a = new AbortController(), b = new AbortController();
    const reasons = [new Error('host stopped'), new Error('task cancelled')];
    for (const index of [0, 1]) {
        const sources = [new AbortController(), new AbortController()];
        const joined = combineRequestSignals(sources.map(source => source.signal));
        sources[index].abort(reasons[index]);
        assert.equal(joined.signal.reason, reasons[index]);
        joined.dispose();
    }
    const joined = combineRequestSignals([a.signal, b.signal]);
    joined.dispose();
    a.abort(); b.abort();
    assert.equal(joined.signal.aborted, false);
    assert.equal(combineRequestSignals([a.signal]).signal.aborted, true);
});

test('read cancellation does not need AbortSignal.throwIfAborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    await assert.rejects(withRequestSignal(() => assert.fail('must not read'), { signal: controller.signal }), /already cancelled/);
});
