import { promptContainsText } from './generation-validation.js';

// ST 1.14 has no scan-done event during dry generation. First check the real
// prompt, then trace the exact entry through a second, marked dry preview.
// Replace only transient lore-array elements; never edit the cached book.
export async function verifyLegacyInjection(context, {
    matchesEntry, preview, expectedText, assertActive, marker,
}) {
    const event = context.eventTypes?.WORLDINFO_ENTRIES_LOADED;
    if (!event || !context.eventSource?.removeListener) {
        throw new Error('酒馆缺少世界书验证接口；总结已保留，未隐藏消息。请升级宿主后重试隐藏。');
    }
    let candidate = null;
    let trace = false;
    const observe = lore => {
        for (const key of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
            const entries = lore?.[key];
            if (!Array.isArray(entries)) continue;
            for (let i = 0; i < entries.length; i++) {
                if (!matchesEntry(entries[i]) || entries[i].disable) continue;
                candidate = { ...entries[i] };
                if (trace) entries[i] = { ...entries[i], content: `${entries[i].content}\n${marker}` };
            }
        }
    };
    context.eventSource.on(event, observe);
    context.eventSource.makeLast?.(event, observe);
    try {
        const actual = await preview();
        assertActive();
        if (!candidate) throw new Error('总结已保存，但当前世界书未加载此存档条目；未隐藏消息。');
        const expected = await expectedText(candidate);
        if (!promptContainsText(actual, expected)) {
            throw new Error('总结已保存，但无法在最终提示词中确认正文；未隐藏消息。请检查预算、预设、正则或模板后重试隐藏。');
        }
        trace = true;
        candidate = null;
        const traced = await preview();
        assertActive();
        if (!candidate || !promptContainsText(traced, marker) || !promptContainsText(traced, expected)) {
            throw new Error('总结已保存，但旧版酒馆的条目来源验证未通过；未隐藏消息。请检查世界书预算、正则或模板后重试隐藏。');
        }
    } finally {
        context.eventSource.removeListener(event, observe);
    }
}
