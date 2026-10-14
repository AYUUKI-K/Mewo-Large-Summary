// Internal host imports live here so version adaptation has one boundary.
export async function nativeScript() { return await import('/script.js'); }
export async function chatCompletionApi() { return await import('/scripts/openai.js'); }
export async function tokenizerApi() { return await import('/scripts/tokenizers.js'); }
export async function regexApi() { return await import('/scripts/extensions/regex/engine.js'); }

export async function worldInfoNames(context) {
    if (typeof context.getWorldInfoNames === 'function') return context.getWorldInfoNames();
    // ST 1.14–1.17 expose the live list from world-info, but not from context.
    const { world_names } = await import('/scripts/world-info.js');
    if (!Array.isArray(world_names)) throw new Error('酒馆没有返回有效的世界书列表，请刷新后重试。');
    return [...world_names];
}
