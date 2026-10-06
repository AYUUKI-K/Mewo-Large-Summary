import { fetchJson } from './network.js';

export async function readWorldBook(context, name, options = {}) {
    const data = await fetchJson('/api/worldinfo/get', {
        method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify({ name }),
        cache: 'no-cache',
    }, { label: `读取世界书“${name}”失败`, ...options });
    if (!data?.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) {
        throw new Error(`世界书“${name}”的条目格式无效，已停止操作。`);
    }
    return data;
}

export async function saveVerifiedBook(context, name, data, verify, options = {}) {
    await context.saveWorldInfo(name, data, true);
    const saved = await readWorldBook(context, name, options);
    if (!verify(saved)) throw new Error('世界书保存后未能读回确认，请重试。');
    return saved;
}
