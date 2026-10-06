const STORAGE_KEY = 'meow-large-summary-panel-v1';
const mounted = new WeakMap();
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function clampPanelFrame(frame = {}, viewport) {
    if (!frame || typeof frame !== 'object') frame = {};
    const mobile = viewport.width <= 600;
    // Leave travel space on phones, including when loading an old full-screen frame.
    const roomWidth = Math.max(1, Math.min(viewport.width - 24, mobile ? Math.max(300, viewport.width - 48) : Infinity));
    const roomHeight = Math.max(1, Math.min(viewport.height - 24, mobile ? Math.max(280, Math.round(viewport.height * .8)) : Infinity));
    const width = Math.min(roomWidth, Math.max(Math.min(300, roomWidth), finite(frame.width, 400)));
    const height = Math.min(roomHeight, Math.max(Math.min(280, roomHeight), finite(frame.height, mobile ? Math.min(560, roomHeight) : Math.min(680, roomHeight - 64))));
    const x = Math.max(12, Math.min(viewport.width - width - 12, finite(frame.x, viewport.width - width - 20)));
    const y = Math.max(12, Math.min(viewport.height - height - 12, finite(frame.y, viewport.height - height - 88)));
    return { x, y, width, height };
}

export function clampLauncherPosition(position = {}, size, viewport) {
    if (!position || typeof position !== 'object') position = {};
    return {
        x: Math.max(12, Math.min(viewport.width - size.width - 12, finite(position.x, viewport.width - size.width - 20))),
        y: Math.max(12, Math.min(viewport.height - size.height - 12, finite(position.y, viewport.height - size.height - 88))),
    };
}

export function mountFloatingPanel(root, { onOpen = () => {} } = {}) {
    if (mounted.has(root)) return mounted.get(root);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* Preferences are optional. */ }
    let open = false;
    let drag = null;
    let frame = null;
    let launcherPosition = saved.launcherPosition ?? null;
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
    header.innerHTML = '<button type="button" class="als-floating-grip" aria-label="移动悬浮窗口，方向键微调位置，Home 键复位" title="拖动标题栏移动；方向键微调，Home 键复位"><span class="als-mascot als-header-mascot" aria-hidden="true"></span><span>喵喵大总结</span><span class="als-grip-dots" aria-hidden="true">⠿</span></button><button type="button" class="als-icon-button als-floating-close" aria-label="收起悬浮窗口" title="收起悬浮窗口"><span aria-hidden="true">−</span></button>';
    root.prepend(header);
    const handle = header.querySelector('.als-floating-grip');
    const opener = root.querySelector('.als-open-floating');

    const persist = (immediate = false) => {
        clearTimeout(saveTimer);
        const write = () => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, frame, launcherPosition })); } catch { /* Private mode can reject writes. */ }
        };
        if (immediate) write();
        else saveTimer = setTimeout(write, 120);
    };
    const applyFrame = next => {
        frame = clampPanelFrame(next, viewport());
        Object.assign(root.style, { left: frame.x + 'px', top: frame.y + 'px', width: frame.width + 'px', height: frame.height + 'px' });
    };
    const applyLauncherPosition = next => {
        if (open) return;
        launcherPosition = clampLauncherPosition(next, shell.getBoundingClientRect(), viewport());
        Object.assign(shell.style, { left: launcherPosition.x + 'px', top: launcherPosition.y + 'px', right: 'auto', bottom: 'auto' });
    };
    const stopDrag = () => {
        const current = drag;
        drag = null;
        if (current?.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    };
    const close = ({ focusDock = false } = {}) => {
        if (!open) return;
        open = false;
        stopDrag();
        header.hidden = true;
        root.classList.remove('als-floating');
        root.removeAttribute('role');
        root.removeAttribute('aria-label');
        root.removeAttribute('aria-modal');
        for (const property of ['left', 'top', 'width', 'height']) root.style.removeProperty(property);
        home.after(root);
        home.hidden = true;
        shell.hidden = false;
        if (launcherPosition) applyLauncherPosition(launcherPosition);
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
    on(opener, 'click', () => show());
    on(dock, 'click', () => close({ focusDock: true }));
    on(header.querySelector('.als-floating-close'), 'click', () => close());
    on(root, 'keydown', event => {
        if (open && event.key === 'Escape' && !event.defaultPrevented && event.target.tagName !== 'SELECT') {
            event.preventDefault();
            close();
        }
    });
    const bindMovement = (target, enabled, getPosition, move, reset) => {
        let suppressClick = false;
        on(target, 'pointerdown', event => {
            if (!enabled() || drag || event.button !== 0 || event.isPrimary === false) return;
            suppressClick = false;
            const position = getPosition();
            drag = { target, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: position.x, y: position.y };
            target.focus({ preventScroll: true });
            target.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        on(target, 'pointermove', event => {
            if (drag?.target !== target || drag.pointerId !== event.pointerId) return;
            const dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY;
            if (!suppressClick && Math.hypot(dx, dy) < 5) return;
            suppressClick = true;
            move({ x: drag.x + dx, y: drag.y + dy });
        });
        const endDrag = event => {
            if (drag?.target !== target || drag.pointerId !== event.pointerId) return;
            stopDrag();
            persist(true);
        };
        on(target, 'pointerup', endDrag);
        on(target, 'pointercancel', endDrag);
        on(target, 'lostpointercapture', endDrag);
        // Register before the launcher's open handler: releasing a drag is not a tap.
        on(target, 'click', event => {
            if (suppressClick && event.detail !== 0) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            suppressClick = false;
        });
        on(target, 'keydown', event => {
            if (!enabled() || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Home') reset();
            else {
                const position = getPosition();
                const step = event.shiftKey ? 40 : 8;
                move({ x: position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                    y: position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) });
            }
            persist(true);
        });
    };
    bindMovement(handle, () => open, () => root.getBoundingClientRect(), position => applyFrame({ ...frame, ...position }), () => applyFrame({ ...frame, x: undefined, y: undefined }));
    bindMovement(launcher, () => !open, () => shell.getBoundingClientRect(), applyLauncherPosition, () => {
        launcherPosition = null;
        for (const property of ['left', 'top', 'right', 'bottom']) shell.style.removeProperty(property);
    });
    on(launcher, 'click', () => show());
    const resize = () => {
        stopDrag();
        if (open) applyFrame(frame);
        else if (launcherPosition) applyLauncherPosition(launcherPosition);
        persist();
    };
    on(window, 'resize', resize);
    on(window.visualViewport, 'resize', resize);
    const observer = new ResizeObserver(entries => {
        if (!open && launcherPosition && entries.some(entry => entry.target === shell)) applyLauncherPosition(launcherPosition);
        if (!open || drag) return;
        const rect = root.getBoundingClientRect();
        if (Math.abs(rect.width - frame.width) < 1 && Math.abs(rect.height - frame.height) < 1) return;
        applyFrame({ ...frame, width: rect.width, height: rect.height });
        persist();
    });
    observer.observe(root);
    observer.observe(shell);
    if (launcherPosition) applyLauncherPosition(launcherPosition);
    const controller = {
        open: show, close,
        update({ busy = false, enabled = true, tokens } = {}) {
            launcher.classList.toggle('als-launcher-busy', busy);
            launcher.classList.toggle('als-launcher-paused', !enabled);
            launcher.title = (busy ? '总结任务处理中' : enabled ? '打开总结与记忆面板' : '插件已关闭 · 可查看历史') + ' · 拖动移动，点击打开；方向键微调，Home 键复位';
            launcher.querySelector('.als-launcher-count').textContent = Number.isFinite(tokens)
                ? (tokens >= 1000 ? (tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1) + 'k' : String(tokens)) : '';
        },
        destroy() {
            stopDrag();
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
