// Bound reads and body consumption together. Never race a host write: a late
// write must settle before another archive can be activated.
export async function withRequestSignal(operation, { signal, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
        const error = new Error('请求超时，请检查连接后重试。');
        error.name = 'TimeoutError';
        controller.abort(error);
    }, timeoutMs);
    try {
        controller.signal.throwIfAborted();
        return await operation(controller.signal);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}

export async function fetchJson(url, init = {}, options = {}) {
    return await withRequestSignal(async signal => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) throw new Error(`${options.label ?? '请求失败'}（HTTP ${response.status}）。`);
        if (response.status === 204) return null;
        return await response.json();
    }, { signal: init.signal, ...options });
}
