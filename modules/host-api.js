// Internal host imports live here so version adaptation has one boundary.
export async function nativeScript() { return await import('/script.js'); }
export async function chatCompletionApi() { return await import('/scripts/openai.js'); }
export async function tokenizerApi() { return await import('/scripts/tokenizers.js'); }
export async function regexApi() { return await import('/scripts/extensions/regex/engine.js'); }
