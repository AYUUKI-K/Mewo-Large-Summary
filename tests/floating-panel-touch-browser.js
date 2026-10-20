async page => {
    const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    try {
        await phone.addInitScript(() => localStorage.setItem('meow-large-summary-panel-v1', JSON.stringify({
            visible: true, open: false, autoCompact: true, dockSide: 'right', dockY: .45,
        })));
        await phone.goto(new URL('/', page.url()).href);
        await phone.locator('.als-float-launcher').waitFor({ state: 'attached' });
        await phone.evaluate(() => {
            window.touchTrace = [];
            for (const name of ['pointerdown','pointermove','pointerup','click']) {
                document.addEventListener(name, event => window.touchTrace.push({ name, target:event.target.className, x:event.clientX, y:event.clientY, rect:document.querySelector('.als-floating-shell').getBoundingClientRect().toJSON() }), true);
            }
        });
        await phone.evaluate(() => {
            const chat = document.createElement('div');
            chat.style.height = '1800px';
            document.body.append(chat);
            window.scrollTo(0, document.body.scrollHeight);
        });
        const launcher = phone.getByRole('button', { name: /^打开总结悬浮窗口/ });
        await launcher.waitFor({ timeout: 3000 }).catch(async error => {
            throw new Error(error.message + JSON.stringify(await phone.evaluate(() => ({
                scrollY, height: innerHeight, rect: document.querySelector('.inline-drawer-content').getBoundingClientRect().toJSON(),
                shellHidden: document.querySelector('.als-floating-shell').hidden,
            }))));
        });
        await launcher.tap();
        await phone.getByRole('button', { name: '收起悬浮窗口', exact: true }).waitFor({ timeout: 3000 });
        await phone.getByRole('button', { name: '收起悬浮窗口', exact: true }).tap();
        await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await launcher.waitFor();
        const cdp = await context.newCDPSession(phone);
        const box = await launcher.boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 20, y: box.y + 20 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y: 350 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        if (await phone.locator('.als-floating-shell').getAttribute('data-dock') !== 'left') throw new Error('touch did not snap left');
        await launcher.tap();
        await phone.getByRole('button', { name: '收起悬浮窗口', exact: true }).waitFor({ timeout: 3000 });
        await phone.getByRole('button', { name: '收起悬浮窗口', exact: true }).tap();
        await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await launcher.waitFor();
        const cancel = await launcher.boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancel.x + 20, y: cancel.y + 20 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 450 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        if (!await launcher.isVisible() || await phone.locator('.als-floating-shell').getAttribute('data-dock') !== 'left') throw new Error('cancel lost docking');
        await cdp.detach();
        return { passed: true, hasTouch: true, checks: ['tap open/minimize', 'drag snap', 'tap after drag', 'cancel'] };
    } catch (error) {
        throw new Error(error.message + JSON.stringify(await phone.evaluate(() => ({ trace:window.touchTrace, saved:localStorage.getItem('meow-large-summary-panel-v1') }))));
    } finally {
        await context.close();
    }
}
