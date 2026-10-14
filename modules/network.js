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
        if (controller.signal.aborted) throw controller.signal.reason ?? new Error('请求已取消。');
        return await operation(controller.signal);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}

// Older Android/iOS WebViews lack AbortSignal.any. Keep this local so other
// extensions and the host retain their own fetch/AbortSignal implementations.
export function combineRequestSignals(signals) {
    const controller = new AbortController();
    const listeners = [];
    const dispose = () => {
        for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
        listeners.length = 0;
    };
    for (const signal of signals.filter(Boolean)) {
        const cancel = () => { controller.abort(signal.reason); dispose(); };
        if (signal.aborted) { cancel(); break; }
        signal.addEventListener('abort', cancel, { once: true });
        listeners.push([signal, cancel]);
    }
    return { signal: controller.signal, dispose };
}

export async function fetchJson(url, init = {}, options = {}) {
    return await withRequestSignal(async signal => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) {
            const error = new Error(`${options.label ?? '请求失败'}（HTTP ${response.status}）。`);
            error.status = response.status;
            throw error;
        }
        if (response.status === 204) return null;
        return await response.json();
    }, { signal: init.signal, ...options });
}
