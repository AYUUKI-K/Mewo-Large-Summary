const STORAGE_KEY = 'meow-large-summary-panel-v1';
const mounted = new WeakMap();
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function clampPanelFrame(frame = {}, viewport) {
    if (!frame || typeof frame !== 'object') frame = {};
    const roomWidth = Math.max(1, viewport.width - 24);
    const roomHeight = Math.max(1, viewport.height - 24);
    const width = Math.min(roomWidth, Math.max(Math.min(300, roomWidth), finite(frame.width, 400)));
    const height = viewport.width <= 600 ? roomHeight
        : Math.min(roomHeight, Math.max(Math.min(280, roomHeight), finite(frame.height, Math.min(680, roomHeight - 64))));
    const x = Math.max(12, Math.min(viewport.width - width - 12, finite(frame.x, viewport.width - width - 20)));
    const y = Math.max(12, Math.min(viewport.height - height - 12, finite(frame.y, viewport.height - height - 88)));
    return { x, y, width, height };
}

export function mountFloatingPanel(root, { onOpen = () => {} } = {}) {
    if (mounted.has(root)) return mounted.get(root);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* Preferences are optional. */ }
    let open = false;
    let drag = null;
    let frame = null;
    let saveTimer;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const viewport = () => ({ width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });
    const home = document.createElement('div');
    home.className = 'als-dock-placeholder';
    home.hidden = true;
    const dock = document.createElement('button');
    dock.type = 'button';
    dock.className = 'menu_button';
    dock.textContent = '喵喵大总结已在悬浮窗口打开 · 收回到这里';
    home.append(dock);
    root.before(home);

    const shell = document.createElement('div');
    shell.className = 'als-settings als-floating-shell';
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'als-float-launcher';
    launcher.setAttribute('aria-label', '打开总结悬浮窗口');
    launcher.setAttribute('aria-controls', root.id);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML = '<span class="als-mascot als-launcher-mascot" aria-hidden="true"></span><span class="als-launcher-label"><span>总结</span><small class="als-launcher-count"></small></span><span class="als-launcher-status" aria-hidden="true"></span>';
    shell.append(launcher);
    document.body.append(shell);

    const header = document.createElement('div');
    header.className = 'als-floating-header';
    header.hidden = true;
    header.innerHTML = '<button type="button" class="als-floating-grip" aria-label="移动悬浮窗口，方向键微调位置"><span class="als-mascot als-header-mascot" aria-hidden="true"></span><span>喵喵大总结</span><span class="als-grip-dots" aria-hidden="true">⠿</span></button><button type="button" class="als-icon-button als-floating-close" aria-label="收起悬浮窗口" title="收起悬浮窗口"><span aria-hidden="true">−</span></button>';
    root.prepend(header);
    const handle = header.querySelector('.als-floating-grip');
    const opener = root.querySelector('.als-open-floating');

    const persist = (immediate = false) => {
        clearTimeout(saveTimer);
        const write = () => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, frame })); } catch { /* Private mode can reject writes. */ }
        };
        if (immediate) write();
        else saveTimer = setTimeout(write, 120);
    };
    const applyFrame = next => {
        frame = clampPanelFrame(next, viewport());
        Object.assign(root.style, { left: frame.x + 'px', top: frame.y + 'px', width: frame.width + 'px', height: frame.height + 'px' });
    };
    const close = ({ focusDock = false } = {}) => {
        if (!open) return;
        open = false;
        drag = null;
        header.hidden = true;
        root.classList.remove('als-floating');
        root.removeAttribute('role');
        root.removeAttribute('aria-label');
        root.removeAttribute('aria-modal');
        for (const property of ['left', 'top', 'width', 'height']) root.style.removeProperty(property);
        home.after(root);
        home.hidden = true;
        shell.hidden = false;
        launcher.setAttribute('aria-expanded', 'false');
        persist(true);
        if (focusDock) opener?.focus();
        else launcher.focus();
    };
    const show = ({ focus = true } = {}) => {
        if (open) { if (focus) handle.focus(); return; }
        open = true;
        document.body.append(root);
        root.classList.add('als-floating');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'false');
        root.setAttribute('aria-label', '喵喵大总结悬浮面板');
        header.hidden = false;
        home.hidden = false;
        shell.hidden = true;
        launcher.setAttribute('aria-expanded', 'true');
        applyFrame(frame ?? saved.frame);
        onOpen();
        persist(true);
        if (focus) handle.focus();
    };
    const on = (target, event, callback) => target?.addEventListener(event, callback, options);
    on(launcher, 'click', () => show());
    on(opener, 'click', () => show());
    on(dock, 'click', () => close({ focusDock: true }));
    on(header.querySelector('.als-floating-close'), 'click', () => close());
    on(root, 'keydown', event => {
        if (open && event.key === 'Escape' && !event.defaultPrevented && event.target.tagName !== 'SELECT') {
            event.preventDefault();
            close();
        }
    });
    on(handle, 'pointerdown', event => {
        if (!open || event.button !== 0) return;
        const rect = root.getBoundingClientRect();
        drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: rect.x, y: rect.y };
        handle.focus({ preventScroll: true });
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    on(handle, 'pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        applyFrame({ ...frame, x: drag.x + event.clientX - drag.clientX, y: drag.y + event.clientY - drag.clientY });
    });
    const endDrag = event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        persist();
    };
    on(handle, 'pointerup', endDrag);
    on(handle, 'pointercancel', endDrag);
    on(handle, 'lostpointercapture', () => { drag = null; });
    on(handle, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 8;
        applyFrame({ ...frame, x: frame.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
            y: frame.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) });
        persist();
    });
    const resize = () => { if (open) { applyFrame(frame); persist(); } };
    on(window, 'resize', resize);
    on(window.visualViewport, 'resize', resize);
    const observer = new ResizeObserver(() => {
        if (!open || drag) return;
        const rect = root.getBoundingClientRect();
        if (Math.abs(rect.width - frame.width) < 1 && Math.abs(rect.height - frame.height) < 1) return;
        applyFrame({ ...frame, width: rect.width, height: rect.height });
        persist();
    });
    observer.observe(root);
    const controller = {
        open: show, close,
        update({ busy = false, enabled = true, tokens } = {}) {
            launcher.classList.toggle('als-launcher-busy', busy);
            launcher.classList.toggle('als-launcher-paused', !enabled);
            launcher.title = busy ? '总结任务处理中' : enabled ? '打开总结与记忆面板' : '插件已关闭 · 可查看历史';
            launcher.querySelector('.als-launcher-count').textContent = Number.isFinite(tokens)
                ? (tokens >= 1000 ? (tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1) + 'k' : String(tokens)) : '';
        },
        destroy() {
            close({ focusDock: true });
            lifecycle.abort();
            observer.disconnect();
            clearTimeout(saveTimer);
            shell.remove();
            header.remove();
            home.remove();
            mounted.delete(root);
        },
    };
    mounted.set(root, controller);
    if (saved.open) show({ focus: false });
    return controller;
}
