// Isolated regression checks. No live ST server, credentials, or model calls.
// Run: node --experimental-vm-modules --test tests/regression.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const source = await readFile(process.env.MEOW_TEST_SOURCE || new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

async function fixture(savedSettings = {}) {
    const notices = [];
    const writes = [];
    const executed = [];
    const savedPreferences = [];
    const controls = new Map();
    const control = () => ({ disabled: false, getAttribute: () => null, setAttribute() {}, removeAttribute() {} });
    for (const selector of ['.als-status', '.als-settings-state', '.als-instruction-depth-field', '.als-instruction-role-field', '.als-delete-round', '.als-history-select']) controls.set(selector, control());
    controls.get('.als-history-select').value = 'all';
    const input = { id: 'send_textarea', value: '', dispatchEvent() {} };
    const send = { ...control(), id: 'send_but', closest: () => send };
    const guarded = { ...control(), id: 'option_continue' };
    const body = { dataset: {}, classList: { add() {}, remove() {} } };
    let storedBook = { entries: {} };
    let context;
    const initialContext = {
        chatId: 'chat-a', characterId: 0, groupId: null,
        characters: [{ name: '角色 A', avatar: 'a.png', chat: 'chat-a' }],
        chat: Array.from({ length: 30 }, (_, i) => ({ mes: `楼层 ${i}`, name: i % 2 ? '角色 A' : '用户', is_user: !(i % 2), is_system: false })),
        chatMetadata: {}, extensionSettings: { auto_large_summary: structuredClone(savedSettings) },
        eventTypes: { APP_READY: 'app-ready' },
        eventSource: { on() {}, makeLast() {} },
        saveSettingsDebounced() {}, saveMetadataDebounced() {}, async saveMetadata() {},
        getRequestHeaders: () => ({}),
        powerUserSettings: { reasoning: { prefix: '<star_cot>', suffix: '</star_cot>' } },
        stopGeneration() {},
        async updateWorldInfoList() {}, reloadWorldInfoEditor() {},
        async saveWorldInfo(name, data) {
            writes.push({ name, data: structuredClone(data) });
            storedBook = structuredClone(data);
        },
        async executeSlashCommandsWithOptions(command) {
            executed.push(command);
            const visibility = /^\/(hide|unhide) (\d+)-(\d+)$/.exec(command);
            if (visibility) for (let i = Number(visibility[2]); i <= Math.min(Number(visibility[3]), this.chat.length - 1); i++) this.chat[i].is_system = visibility[1] === 'hide';
            return {};
        },
    };
    context = initialContext;
    const native = {
        is_send_press: false,
        isGenerating: () => false,
        async saveSettings() { savedPreferences.push(structuredClone(context.extensionSettings)); },
    };
    const tokenRenders = [];
    const openai = { promptManager: { render: value => tokenRenders.push(value) } };
    const sandbox = createContext({
        console: { ...console, error() {}, warn() {} }, structuredClone, setTimeout, clearTimeout, URL,
        location: { origin: 'http://st.local' },
        crypto: { randomUUID: () => 'archive-a' },
        window: {
            SillyTavern: { getContext: () => context },
            toastr: Object.fromEntries(['info', 'success', 'warning', 'error', 'clear'].map(kind => [kind, (...args) => {
                const notice = { kind, args };
                notices.push(notice);
                return notice;
            }])),
        },
        document: {
            body, addEventListener() {},
            querySelector: selector => selector === '#send_textarea' ? input : controls.get(selector),
            querySelectorAll: () => [send, guarded],
        },
        fetch: async () => ({ ok: true, json: async () => structuredClone(storedBook) }),
        __fixtures: {
            context: initialContext,
            book: () => structuredClone(storedBook),
            native,
        },
    });
    const module = new SourceTextModule(`${source}\nexport const api = {
        blockSendInput, lockSending, unlockSending, getSettings, applyEnabledState,
        onGenerationAfterCommands, onMainApiRequest, onFinalPromptData, onTemplatePreviewContext,
        assemblePrompt, countAssembledPrompt, runLargeSummary, checkAfterReply, stripReasoning, isSameArchive,
        installVisibilityCommandHooks, refreshVisibilityTokens,
        evaluate: code => eval(code),
        state: () => ({ sendLockDepth, runInProgress, thresholdCheckInProgress, pendingGeneration, settings })
    };`, {
        context: sandbox,
        initializeImportMeta(meta) { meta.url = 'http://st.local/scripts/extensions/third-party/Mewo-Large-Summary/index.js'; },
        async importModuleDynamically(specifier) {
            assert.ok(['/script.js', '/scripts/openai.js'].includes(specifier), specifier);
            const exports = specifier === '/script.js' ? native : openai;
            const imported = new SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
            }, { context: sandbox });
            await imported.link(() => {});
            await imported.evaluate();
            return imported;
        },
    });
    await module.link(() => {});
    await module.evaluate();
    const api = module.namespace.api;
    api.getSettings();
    api.evaluate(`ui = { querySelector: selector => document.querySelector(selector), querySelectorAll: () => [] };
        settingsDraft = Object.fromEntries(SETTING_FIELDS.map(key => [key, settings[key]]));`);
    const event = (type = 'click', value = '/hide 0-3') => {
        input.value = value;
        const state = { prevented: false, stopped: false };
        return Object.assign(state, {
            type, key: 'Enter', shiftKey: false, isComposing: false,
            target: type === 'click' ? send : type === 'submit' ? { querySelector: () => input } : input,
            preventDefault() { state.prevented = true; },
            stopImmediatePropagation() { state.stopped = true; },
        });
    };
    return {
        api, sandbox, event, input, send, guarded, body, notices, writes, executed, savedPreferences, tokenRenders,
        context: initialContext, setContext: next => { context = next; },
        interceptor: sandbox[manifest.generate_interceptor],
        prepareSummary({ nativeRequest = false } = {}) {
            api.evaluate(`ensureWorldBook = async () => __fixtures.book();
                setArchiveActivation = async () => true;
                renderDirectory = async () => {};
                waitForCurrentGeneration = async () => true;`);
            if (!nativeRequest) api.evaluate(`requestMainApiSummary = async () => '<details><summary>大总结</summary>事件记录</details>';`);
        },
    };
}

test('each newly saved summary runs one native hide from zero; manual unhide persists between rounds', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    assert.equal(f.executed.at(-1), '/hide 0-9');
    await f.context.executeSlashCommandsWithOptions('/unhide 0-9');
    assert.ok(f.context.chat.every(message => !message.is_system));
    f.context.chat.push({ mes: '新剧情', is_user: false, is_system: false, name: '角色 A' });
    await f.api.runLargeSummary();
    assert.equal(f.executed.at(-1), '/hide 0-10');
    assert.equal(f.executed.filter(command => command.startsWith('/hide ')).length, 2);
    assert.ok(f.context.chat.slice(0, 10).every(message => message.is_system));
    assert.equal(f.context.chat[10].is_system, true);
    assert.ok(f.context.chat.slice(11).every(message => !message.is_system));
});

test('manual unhide refreshes native cached tokens without triggering another summary above threshold', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    f.context.mainApi = 'openai';
    f.context.getTokenCountAsync = async prompt => Number(prompt);
    let assembled = 0;
    f.context.generate = async (_type, _options, dryRun) => {
        assert.equal(dryRun, true);
        assembled++;
        f.api.onFinalPromptData({ prompt: String(f.context.chat.filter(message => !message.is_system).length * 2500) }, true);
    };
    await f.api.refreshVisibilityTokens(f.context);
    assert.match(f.api.evaluate("ui.querySelector('.als-status').textContent"), /50,000/);
    await f.context.executeSlashCommandsWithOptions('/unhide 0-9999');
    const commands = f.executed.length;
    const writes = f.writes.length;
    await f.api.refreshVisibilityTokens(f.context);
    assert.match(f.api.evaluate("ui.querySelector('.als-status').textContent"), /75,000/);
    assert.equal(f.context.chatMetadata.auto_large_summary.lastPromptTokens, 75000);
    assert.deepEqual(f.tokenRenders, [false, false]);
    assert.equal(assembled, 2);
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.equal(f.executed.length, commands);
    assert.equal(f.writes.length, writes);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('visibility hooks preserve the native parser, arguments, receiver, result, errors and completion order', async () => {
    const f = await fixture();
    const events = [];
    const result = { pipe: 'native result' };
    const named = { name: '角色 A', _scope: {} };
    const failure = new Error('native command failed');
    const hide = { helpString: 'native help', aliases: [], async callback(...args) {
        assert.equal(this, hide);
        assert.equal(args[0], named);
        assert.equal(args[1], '0-9999');
        events.push('native saved');
        return result;
    } };
    f.context.SlashCommandParser = { commands: { hide, unhide: { callback: async () => { throw failure; } } } };
    f.context.onVisibilitySaved = context => {
        assert.equal(context, f.context);
        events.push('refresh scheduled');
    };
    f.api.evaluate('scheduleVisibilityRefresh = context => __fixtures.context.onVisibilitySaved(context)');
    f.api.installVisibilityCommandHooks();
    const callback = hide.callback;
    f.api.installVisibilityCommandHooks();
    assert.equal(hide.callback, callback, 'must not double wrap');
    assert.equal(hide.helpString, 'native help');
    assert.equal(await hide.callback(named, '0-9999'), result);
    assert.deepEqual(events, ['native saved', 'refresh scheduled']);
    await assert.rejects(f.context.SlashCommandParser.commands.unhide.callback({}, '0-9999'), error => error === failure);
});

test('plugin native hide is not treated as a manual edit and hides exactly once after saving', async () => {
    const f = await fixture();
    f.prepareSummary();
    const nativeExecute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    const hide = { callback: async (_args, range) => {
        assert.equal(f.writes.length, 1, 'must save before hiding');
        return nativeExecute(`/hide ${range}`);
    } };
    f.context.SlashCommandParser = { commands: { hide } };
    f.context.executeSlashCommandsWithOptions = command => hide.callback({}, command.slice(6));
    f.api.installVisibilityCommandHooks();
    const revision = f.api.evaluate('manualVisibilityRevision');
    assert.equal(await f.api.runLargeSummary(), true);
    assert.equal(f.api.evaluate('manualVisibilityRevision'), revision);
    assert.equal(f.api.evaluate('summaryHideInProgress'), false);
    assert.deepEqual(f.executed, ['/hide 0-9']);
});

test('a native unhide completion automatically schedules the recount even when automatic summaries are disabled', async () => {
    const f = await fixture({ enabled: false });
    const nativeExecute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    f.context.SlashCommandParser = { commands: { unhide: { callback: async (_args, range) => nativeExecute(`/unhide ${range}`) } } };
    f.context.mainApi = 'openai';
    f.context.getTokenCountAsync = async prompt => Number(prompt);
    f.context.generate = async () => f.api.onFinalPromptData({ prompt: String(f.context.chat.filter(message => !message.is_system).length * 2500) }, true);
    await nativeExecute('/hide 0-9');
    f.api.installVisibilityCommandHooks();
    await f.context.SlashCommandParser.commands.unhide.callback({}, '0-9999');
    const deadline = Date.now() + 2000;
    while (!f.tokenRenders.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(f.tokenRenders, [false]);
    assert.match(f.api.evaluate("ui.querySelector('.als-status').textContent"), /75,000/);
    assert.deepEqual(f.executed, ['/hide 0-9', '/unhide 0-9999']);
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.equal(f.writes.length, 0);
});

test('manual commands still execute during a token preview and invalidate that preview', async () => {
    const f = await fixture();
    const nativeExecute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    f.context.SlashCommandParser = { commands: { unhide: { callback: async (_args, range) => nativeExecute(`/unhide ${range}`) } } };
    f.api.evaluate('scheduleVisibilityRefresh = () => { visibilityRefreshRevision++; }');
    f.api.installVisibilityCommandHooks();
    await nativeExecute('/hide 0-9999');
    f.context.mainApi = 'openai';
    f.context.getTokenCountAsync = async () => 1000;
    f.context.generate = async () => {
        assert.equal(f.api.evaluate('requestPreview'), true);
        await f.context.SlashCommandParser.commands.unhide.callback({}, '0-9999');
        f.api.onFinalPromptData({ prompt: 'outdated prompt' }, true);
    };
    await f.api.refreshVisibilityTokens(f.context);
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.deepEqual(f.tokenRenders, []);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('visibility refresh failures release the lock and never change floors or repeat commands', async () => {
    const f = await fixture();
    await f.context.executeSlashCommandsWithOptions('/hide 0-9999');
    f.context.generate = async () => { throw new Error('preview unavailable'); };
    await f.api.refreshVisibilityTokens(f.context);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.evaluate('requestPreview'), false);
    assert.ok(f.context.chat.every(message => message.is_system));
    assert.deepEqual(f.executed, ['/hide 0-9999']);
    assert.match(f.api.evaluate("ui.querySelector('.als-status').textContent"), /token 刷新失败/);
});

test('switching archives or receiving a newer command during recount discards outdated counts', async () => {
    for (const action of ['switch', 'new-command']) {
        const f = await fixture();
        f.context.mainApi = 'openai';
        f.context.getTokenCountAsync = async () => 75000;
        f.context.generate = async () => {
            f.api.onFinalPromptData({ prompt: 'preview' }, true);
            if (action === 'switch') f.setContext({ ...f.context, chatId: 'chat-b', chat: [] });
            else f.api.evaluate('visibilityRefreshRevision++');
        };
        await f.api.refreshVisibilityTokens(f.context);
        assert.deepEqual(f.tokenRenders, []);
        assert.equal(f.api.state().sendLockDepth, 0);
        assert.equal(f.executed.length, 0);
    }
});

test('floor 666 example runs hide 0-646 once and manual unhide restores every floor', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.context.chat = Array.from({ length: 667 }, (_, i) => ({ mes: `楼层 ${i}`, is_user: false, is_system: false }));
    await f.api.runLargeSummary();
    assert.deepEqual(f.executed, ['/hide 0-646']);
    await f.context.executeSlashCommandsWithOptions('/unhide 0-9999');
    assert.ok(f.context.chat.every(message => !message.is_system));
    await f.api.runLargeSummary();
    assert.deepEqual(f.executed, ['/hide 0-646', '/unhide 0-9999']);
});

test('hide 0-9999 stays hidden through idle sync and another attempted summary', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    await f.context.executeSlashCommandsWithOptions('/hide 0-9999');
    const commands = f.executed.length;
    f.api.evaluate(`prepareWorldBook = async () => __fixtures.book(); updateWorldBookStatus = async () => {};`);
    await f.api.evaluate('syncCurrentArchive()');
    await f.api.runLargeSummary();
    assert.equal(f.executed.length, commands);
    assert.ok(f.context.chat.every(message => message.is_system));
    // Even with newer visible replies, the old covered range stays hidden;
    // an entirely hidden candidate range is never re-summarized.
    f.context.chat.push({ mes: '新回复', is_user: false, is_system: false, name: '角色 A' });
    await f.api.runLargeSummary();
    assert.equal(f.executed.length, commands);
    assert.ok(f.context.chat.slice(0, 30).every(message => message.is_system));
});

test('unhide 0-9999 persists through syncing, a keepRecent change, and token checking', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    await f.context.executeSlashCommandsWithOptions('/unhide 0-9999');
    const flags = f.context.chat.map(message => message.is_system);
    const commands = f.executed.length;
    f.api.state().settings.keepRecent = 10;
    f.api.evaluate(`prepareWorldBook = async () => __fixtures.book(); updateWorldBookStatus = async () => {};
        assemblePrompt = async () => ({}); countAssembledPrompt = async () => 1000;`);
    await f.api.evaluate('syncCurrentArchive()');
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: true, locked: false });
    assert.deepEqual(f.context.chat.map(message => message.is_system), flags);
    assert.equal(f.executed.length, commands);
});

test('manual visibility command intent cancels an in-flight summary without consuming the command', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.context.manualCommandForTest = () => {
        const event = f.event('click', '/unhide 0-9999');
        f.api.blockSendInput(event);
        assert.equal(event.prevented, false);
    };
    f.api.evaluate(`requestMainApiSummary = async () => {
        __fixtures.context.manualCommandForTest(); return '正文';
    };`);
    await f.api.runLargeSummary();
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('token assembly cannot repeat template visibility commands, even when preview fails', async () => {
    for (const fail of [false, true]) {
        const f = await fixture();
        f.context.getTokenCountAsync = async () => 1000;
        let executions = 0;
        f.context.generate = async (_type, _options, dryRun) => {
            assert.equal(dryRun, true);
            const environment = { execute: () => {
                executions++;
                // A template that maintains "latest 20" must not run on a
                // read-only token preview after the user's /hide 0-9999.
                for (const message of f.context.chat.slice(-20)) message.is_system = false;
            } };
            f.api.onTemplatePreviewContext(environment);
            await environment.execute('/unhide');
            if (fail) throw new Error('preview failed');
            f.api.onFinalPromptData({ prompt: 'processed prompt' }, true);
        };
        await f.context.executeSlashCommandsWithOptions('/hide 0-9999');
        if (fail) await assert.rejects(f.api.assemblePrompt(f.context), /preview failed/);
        else {
            const data = await f.api.assemblePrompt(f.context);
            assert.equal(await f.api.countAssembledPrompt(f.context, data), 1000);
        }
        assert.equal(executions, 0);
        assert.ok(f.context.chat.every(message => message.is_system));
        assert.equal(f.api.evaluate('requestPreview'), false);
        // Actual native generation processing still has its normal execute.
        const realEnvironment = { execute: () => executions++ };
        f.api.onTemplatePreviewContext(realEnvironment);
        realEnvironment.execute('/echo actual');
        assert.equal(executions, 1);
    }
});

test('all slash commands reach native parsing with the plugin enabled, disabled, or locked', async () => {
    const f = await fixture();
    for (const enabled of [true, false]) {
        f.api.state().settings.enabled = enabled;
        for (const locked of [false, true]) {
            if (locked) f.api.lockSending();
            for (const command of ['/hide 0-3', '/unhide 0-3', '/echo hello', '/setvar key=x value', '/hide name="角色 A" 0-5 | /echo done', '/hide {{getvar::range}}', '/run {: /echo ok :}', '/echo one\n/echo two']) {
                for (const type of ['click', 'keydown', 'submit']) {
                    const event = f.event(type, command);
                    f.api.blockSendInput(event);
                    assert.equal(event.prevented, false, `${enabled}/${locked}/${type}: ${command}`);
                    assert.equal(event.stopped, false);
                    assert.equal(f.input.value, command);
                }
            }
            if (locked) f.api.unlockSending();
        }
    }
    assert.equal(f.executed.length, 0, 'plugin must not replace the native slash executor');
});

test('ordinary sends lock only during processing; composing and Shift+Enter remain usable', async () => {
    const f = await fixture();
    const idle = f.event('click', '继续对话');
    f.api.blockSendInput(idle);
    assert.equal(idle.prevented, false);
    f.api.lockSending();
    for (const type of ['click', 'keydown', 'submit']) {
        const event = f.event(type, '继续对话');
        f.api.blockSendInput(event);
        assert.equal(event.prevented, true);
    }
    for (const key of ['shiftKey', 'isComposing']) {
        const event = f.event('keydown', '正在编辑');
        event[key] = true;
        f.api.blockSendInput(event);
        assert.equal(event.prevented, false);
    }
    f.api.unlockSending();
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('nested locks restore controls without touching ST native send/busy state', async () => {
    const f = await fixture();
    f.send.disabled = true; // A native generation can own this state.
    f.body.dataset.generating = 'true';
    f.api.lockSending();
    f.api.lockSending();
    f.api.unlockSending();
    assert.equal(f.guarded.disabled, true);
    f.api.unlockSending();
    assert.equal(f.guarded.disabled, false);
    assert.equal(f.send.disabled, true);
    assert.equal(f.body.dataset.generating, 'true');
});

test('generation event returns synchronously even while locked; interceptor aborts model calls', async () => {
    const f = await fixture();
    assert.equal(typeof f.interceptor, 'function');
    f.api.lockSending();
    assert.equal(f.api.onGenerationAfterCommands('normal', {}, false), undefined);
    assert.equal(f.api.onGenerationAfterCommands('quiet', {}, false), undefined);
    let aborted = 0;
    f.interceptor([], 60000, immediate => { assert.equal(immediate, true); aborted++; }, 'normal');
    assert.equal(aborted, 1);
    f.api.unlockSending();
    f.interceptor([], 60000, () => aborted++, 'normal');
    assert.equal(aborted, 1);
});

test('only the summary quiet generation gets a single interceptor bypass; cancelled requests abort', async () => {
    const f = await fixture();
    f.api.lockSending();
    f.api.evaluate(`summaryRequest = { afterCommands: true };`);
    f.api.onGenerationAfterCommands('quiet', {}, false);
    let aborted = 0;
    f.interceptor([], 60000, () => aborted++, 'quiet');
    assert.equal(aborted, 0);
    f.interceptor([], 60000, () => aborted++, 'quiet');
    assert.equal(aborted, 1);
    f.api.evaluate(`summaryRequest.interceptorPending = true; activeRun = { cancelled: true };`);
    f.interceptor([], 60000, () => aborted++, 'quiet');
    assert.equal(aborted, 2);
});

test('enable changes save immediately; fast toggles persist false and reload preserves false', async () => {
    const f = await fixture();
    f.api.evaluate('scheduleChatSync = async () => {}; settingsDraft.threshold = 12345;');
    f.api.applyEnabledState(false);
    f.api.applyEnabledState(true);
    f.api.applyEnabledState(false);
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.enabled, false);
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.threshold, 60000, 'unrelated drafts must not be applied');
    const reloaded = await fixture(f.savedPreferences.at(-1).auto_large_summary);
    assert.equal(reloaded.api.state().settings.enabled, false);
});

test('configured reasoning wrappers are removed while both summary details are preserved', async () => {
    const f = await fixture();
    const body = '<details><summary>大总结</summary>事件</details>\n<details><summary>角色表</summary>角色</details>';
    assert.equal(f.api.stripReasoning(`<star_cot>推理文本</star_cot>\n${body}`), body);
    assert.equal(f.api.stripReasoning('<star_cot>只有推理</star_cot>'), '');
});

test('automatic summary displays progress/success, verifies save, then hides and releases lock', async () => {
    const f = await fixture();
    f.prepareSummary();
    assert.equal(await f.api.runLargeSummary(), true);
    const entry = Object.values(f.writes[0].data.entries)[0];
    assert.equal(entry.preventRecursion, true);
    assert.equal(entry.constant, true);
    assert.equal(entry.disable, false);
    assert.equal(f.executed[0], '/hide 0-9');
    assert.ok(f.notices.some(n => n.kind === 'info' && n.args[0].includes('正在大总结中') && n.args[2].timeOut === 0));
    assert.ok(f.notices.some(n => n.kind === 'success' && n.args[0].includes('保存成功')));
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.state().runInProgress, false);
});

test('second incremental summary appends to the first entry and keeps history', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    f.context.chat.push({ mes: '新增剧情', name: '角色 A', is_user: false, is_system: false });
    await f.api.runLargeSummary();
    const entries = Object.values(f.writes.at(-1).data.entries);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].extensions.auto_large_summary.records.length, 2);
    assert.equal(entries[0].content.split('事件记录').length - 1, 2);
});

test('merged summary replaces the injected body and retains both rounds', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    f.api.state().settings.mode = 'merged';
    f.context.chat.push({ mes: '新增剧情', name: '角色 A', is_user: false, is_system: false });
    f.api.evaluate(`requestMainApiSummary = async () => '合并后的正文';`);
    await f.api.runLargeSummary();
    const entry = Object.values(f.writes.at(-1).data.entries)[0];
    assert.equal(entry.content, '合并后的正文');
    assert.equal(entry.extensions.auto_large_summary.records.length, 2);
});

for (const failure of ['empty', 'api', 'save', 'readback', 'hide']) {
    test(`${failure} failure notifies, releases the lock, and respects save-before-hide`, async () => {
        const f = await fixture();
        f.prepareSummary();
        if (failure === 'empty') f.api.evaluate(`requestMainApiSummary = async () => '';`);
        if (failure === 'api') f.api.evaluate(`requestMainApiSummary = async () => { throw new Error('API failed'); };`);
        if (failure === 'save') f.context.saveWorldInfo = async () => { throw new Error('save failed'); };
        if (failure === 'readback') f.sandbox.fetch = async () => ({ ok: true, json: async () => ({ entries: {} }) });
        if (failure === 'hide') f.context.executeSlashCommandsWithOptions = async () => { throw new Error('hide failed'); };
        await f.api.runLargeSummary();
        assert.ok(f.notices.some(n => n.kind === 'error'));
        assert.equal(f.api.state().sendLockDepth, 0);
        assert.equal(f.api.state().runInProgress, false);
        if (failure !== 'hide') assert.equal(f.executed.length, 0);
        assert.equal(f.notices.some(n => n.kind === 'success'), false);
        if (failure !== 'hide') assert.equal(f.notices.some(n => n.kind === 'info' && n.args[0].includes('保存成功')), false);
        assert.ok(f.context.chat.every(m => !m.is_system));
    });
}

test('switching chats while generating discards the result without saving or hiding', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.context.switchForTest = () => f.setContext({ ...f.context, chatId: 'chat-b', characterId: 1 });
    f.api.evaluate(`requestMainApiSummary = async () => { __fixtures.context.switchForTest(); return '正文'; };`);
    await f.api.runLargeSummary();
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('visibility changes while loading the book discard the result before saving', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate(`let loads = 0; ensureWorldBook = async () => {
        if (++loads === 2) __fixtures.context.chat[0].is_system = true;
        return __fixtures.book();
    };`);
    await f.api.runLargeSummary();
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('disabling automatic summaries during the request discards the result', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate(`requestMainApiSummary = async () => { applyEnabledState(false); return '正文'; };`);
    await f.api.runLargeSummary();
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.ok(f.notices.some(n => n.kind === 'info' && n.args[0].includes('已取消')));
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('native quiet flow passes the interceptor, appends the prompt last, and filters raw reasoning', async () => {
    const f = await fixture();
    f.prepareSummary({ nativeRequest: true });
    const body = '<details><summary>大总结</summary>正文</details>';
    const rawText = `<star_cot>推理</star_cot>\n${body}`;
    f.context.extractMessageFromData = data => data.message;
    const realFetch = f.sandbox.fetch;
    let modelCalls = 0;
    f.sandbox.fetch = async (url, init) => {
        if (!url.includes('/chat-completions/generate')) return realFetch(url, init);
        modelCalls++;
        const payload = JSON.parse(init.body);
        assert.equal(payload.messages.at(-1).content, f.api.state().settings.prompt);
        assert.equal(payload.messages.at(-1).role, 'user');
        assert.equal(payload.tools, undefined);
        return { ok: true, clone: () => ({ json: async () => ({ message: rawText }) }) };
    };
    const originalFetch = f.sandbox.fetch;
    f.context.generate = async (type, _options, dryRun) => {
        assert.equal(type, 'quiet');
        assert.equal(dryRun, false);
        f.api.onGenerationAfterCommands(type, {}, dryRun);
        let aborted = false;
        f.interceptor([], 60000, () => { aborted = true; }, type);
        assert.equal(aborted, false);
        const payload = { type, messages: [{ role: 'system', content: 'preset' }, { role: 'user', content: 'history' }], tools: [{}] };
        f.api.onMainApiRequest(payload);
        await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
        return ''; // Native output regex can filter a custom details format.
    };
    assert.equal(await f.api.runLargeSummary(), true);
    assert.equal(modelCalls, 1);
    assert.equal(Object.values(f.writes[0].data.entries)[0].content, body);
    assert.equal(f.sandbox.fetch, originalFetch);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('chat activation disables other archives and keeps recursion prevention on every owned entry', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    const entry = (uid, archiveId, cardKey) => ({
        uid, content: '旧总结', constant: true, disable: false, preventRecursion: false,
        extensions: { auto_large_summary: {
            owner: 'auto_large_summary', storageVersion: 2, archiveId, cardKey, round: 1,
            records: [{ round: 1, content: '旧总结', coveredFrom: 0, coveredTo: 5 }], coveredTo: 5,
        } },
    });
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: {
        0: entry(0, 'archive-a', 'a.png'), 1: entry(1, 'archive-b', 'b.png'),
        2: { uid: 2, content: '手写条目', constant: true, disable: false },
    } });
    f.api.evaluate(`ensureWorldBook = async () => __fixtures.book();
        prepareWorldBook = async () => __fixtures.book();
        activateWorldBook = async () => {};
        updateWorldBookStatus = async () => {};`);
    await f.api.evaluate(`setArchiveActivation('archive-a', { reconcileCursor: true })`);
    const saved = f.writes.at(-1).data.entries;
    assert.equal(saved[0].constant, true);
    assert.equal(saved[0].disable, false);
    assert.equal(saved[1].constant, false);
    assert.equal(saved[1].disable, true);
    assert.equal(saved[0].preventRecursion, true);
    assert.equal(saved[1].preventRecursion, true);
    assert.equal(saved[2].constant, true);
    assert.equal(saved[2].disable, false);
    f.context.characters.push({ name: '角色 B', avatar: 'b.png', chat: 'chat-b' });
    f.setContext({ ...f.context, characterId: 1, chatId: 'chat-b', chatMetadata: {
        auto_large_summary: { archiveId: 'archive-b', cardKey: 'b.png', chatId: 'chat-b' },
    } });
    await f.api.evaluate(`setArchiveActivation('archive-b', { reconcileCursor: true })`);
    const switched = f.writes.at(-1).data.entries;
    assert.equal(switched[0].constant, false);
    assert.equal(switched[0].disable, true);
    assert.equal(switched[1].constant, true);
    assert.equal(switched[1].disable, false);
});

for (const [count, onOpen, armed, expected] of [[59000, false, true, 0], [61000, false, true, 1], [80000, true, false, 1], [80000, false, false, 0]]) {
    test(`threshold ${count}, onOpen=${onOpen}, armed=${armed} schedules ${expected} summary`, async () => {
        const f = await fixture();
        await f.api.evaluate('ensureArchive()');
        f.context.chatMetadata.auto_large_summary.autoTriggerArmed = armed;
        f.api.evaluate(`__fixtures.calls = 0; waitForCurrentGeneration = async () => true;
            assemblePrompt = async () => ({}); countAssembledPrompt = async () => ${count};
            runLargeSummary = async () => { __fixtures.calls++; return false; };`);
        f.api.lockSending();
        await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen, locked: true });
        assert.equal(f.api.evaluate('__fixtures.calls'), expected);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}
