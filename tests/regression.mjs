// Isolated regression checks. No live ST server, credentials, or model calls.
// Run: node --experimental-vm-modules --test tests/regression.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const source = await readFile(process.env.MEOW_TEST_SOURCE || new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const markupSource = await readFile(new URL('../modules/settings-ui.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../style.css', import.meta.url), 'utf8');

const bookEntry = f => Object.values(f.writes.at(-1)?.data.entries ?? {}).find(entry =>
    entry.extensions?.auto_large_summary?.archiveId === f.api.evaluate('getContext().chatMetadata.auto_large_summary?.archiveId'));

async function fixture(savedSettings = {}) {
    const notices = [];
    const writes = [];
    const executed = [];
    const savedPreferences = [];
    const controls = new Map();
    const control = () => ({ disabled: false, getAttribute: () => null, setAttribute() {}, removeAttribute() {} });
    for (const selector of ['.als-status', '.als-settings-state', '.als-instruction-depth-field', '.als-instruction-role-field', '.als-delete-round', '.als-history-select', '.als-prompt', '.als-prompt-mode', '.als-settings-mode', '.als-mode-description', '.als-prompt-state', '.als-model-status', '.als-model-fetch']) controls.set(selector, control());
    for (const selector of ['.als-enabled', '.als-auto-enabled', '.als-threshold', '.als-keep', '.als-book', '.als-depth', '.als-instruction-position', '.als-instruction-depth', '.als-instruction-role', '.als-api-mode', '.als-secondary-url', '.als-secondary-key', '.als-secondary-model', '.als-secondary-settings', '.als-preview-box', '.als-action-context', '.als-last-operation', '.als-task-state', '.als-cancel', '.als-compact', '.als-rebuild', '.als-retry-hide', '.als-restore', '.als-undo']) controls.set(selector, control());
    const handlers = new Map();
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
        eventTypes: { APP_READY: 'app-ready', SETTINGS_UPDATED: 'settings-updated', WORLDINFO_SCAN_DONE: 'worldinfo-scan-done' },
        eventSource: {
            on(event, handler) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(handler); },
            removeListener(event, handler) { handlers.get(event)?.delete(handler); },
            async emit(event, ...args) { for (const handler of handlers.get(event) ?? []) await handler(...args); },
            makeLast() {},
        },
        saveSettingsDebounced() {}, saveMetadataDebounced() {}, async saveMetadata() {},
        getRequestHeaders: () => ({}),
        powerUserSettings: { reasoning: { prefix: '<star_cot>', suffix: '</star_cot>' } },
        stopGeneration() {},
        async updateWorldInfoList() {}, reloadWorldInfoEditor() {},
        getWorldInfoNames: () => Object.keys(storedBook.entries).length ? [context.extensionSettings.auto_large_summary.worldBookName] : [],
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
        async saveSettings() {
            if (context.suppressSaveConfirmation) return;
            savedPreferences.push(structuredClone(context.extensionSettings));
            await context.eventSource.emit('settings-updated');
        },
    };
    const tokenRenders = [];
    const openai = { promptManager: { render: value => tokenRenders.push(value) } };
    const regex = { getRegexedString: text => context.stripSummaryForTest ? '' : text, regex_placement: { WORLD_INFO: 5 } };
    const sandbox = createContext({
        console: { ...console, error() {}, warn() {} }, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval, URL, Response, AbortController, AbortSignal,
        location: { origin: 'http://st.local' },
        crypto: { randomUUID: () => 'archive-a' },
        window: {
            confirm: () => true,
            SillyTavern: { getContext: () => context },
            toastr: Object.fromEntries(['info', 'success', 'warning', 'error', 'clear'].map(kind => [kind, (...args) => {
                const notice = { kind, args };
                notices.push(notice);
                return notice;
            }])),
        },
        document: {
            body, addEventListener() {},
            createElement: () => ({ value: '' }),
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
    const importHostModule = async specifier => {
            assert.ok(['/script.js', '/scripts/openai.js', '/scripts/extensions/regex/engine.js'].includes(specifier), specifier);
            const exports = specifier === '/script.js' ? native : specifier.includes('regex/') ? regex : openai;
            const imported = new SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
            }, { context: sandbox });
            await imported.link(() => {});
            await imported.evaluate();
            return imported;
        };
    const module = new SourceTextModule(`${source}\nexport const api = {
        blockSendInput, lockSending, unlockSending, getSettings, applyEnabledState,
        onGenerationAfterCommands, onMainApiRequest, onFinalPromptData, onTemplatePreviewContext,
        assemblePrompt, countAssembledPrompt, runLargeSummary, checkAfterReply, stripReasoning, isSameArchive,
        installVisibilityCommandHooks, refreshVisibilityTokens, getSecondaryConfig, buildSecondaryRequest, fetchSecondaryModels,
        savePromptDraft, syncPromptEditor, changeMode, persistSettingsNow, saveSettingsDraft, onExtensionUpdate,
        evaluate: code => eval(code),
        state: () => ({ sendLockDepth, runInProgress, thresholdCheckInProgress, pendingGeneration, settings })
    };`, {
        context: sandbox, identifier: new URL('../index.js', import.meta.url).href,
        initializeImportMeta(meta) { meta.url = 'http://st.local/scripts/extensions/third-party/Mewo-Large-Summary/index.js'; },
        importModuleDynamically: importHostModule,
    });
    const localModules = new Map();
    await module.link(async (specifier, parent) => {
        const url = new URL(specifier, parent.identifier);
        if (!localModules.has(url.href)) localModules.set(url.href, new SourceTextModule(await readFile(url, 'utf8'), {
            context: sandbox, identifier: url.href, importModuleDynamically: importHostModule,
        }));
        return localModules.get(url.href);
    });
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
        api, sandbox, event, input, send, guarded, body, notices, writes, executed, savedPreferences, tokenRenders, controls, handlers,
        context: initialContext, setContext: next => { context = next; },
        interceptor: sandbox[manifest.generate_interceptor],
        prepareSummary({ nativeRequest = false } = {}) {
            api.evaluate(`ensureWorldBook = async () => __fixtures.book();
                setArchiveActivation = async () => true;
                verifySummaryInjection = async () => {};
                renderDirectory = async () => {};
                waitForCurrentGeneration = async () => true;`);
            if (!nativeRequest) api.evaluate(`requestMainApiSummary = async () => '<details><summary>大总结</summary>事件记录</details>';`);
        },
    };
}

function ownedSummaryEntry(uid, archiveId, cardKey = 'a.png') {
    return {
        uid, content: `总结正文 ${archiveId}`, constant: true, disable: false, preventRecursion: true,
        extensions: { auto_large_summary: {
            owner: 'auto_large_summary', storageVersion: 2, archiveId, cardKey, round: 1,
            records: [{ round: 1, content: `总结正文 ${archiveId}`, coveredFrom: 0, coveredTo: 5 }], coveredTo: 5,
        } },
    };
}

test('manual mode refreshes overview message counts on a reply without starting a task', async () => {
    const f = await fixture({ autoEnabled: false });
    const detail = { textContent: '' };
    f.controls.set('.als-chat-detail', detail);
    f.context.chat.push({ mes: '新回复', name: '角色 A', is_user: false, is_system: false });
    f.api.evaluate('onMessageReceived(30, "normal")');
    assert.match(detail.textContent, /31 条消息/);
    assert.equal(f.api.state().runInProgress, false);
    assert.equal(f.api.state().pendingGeneration, null);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
});

test('turning off disables every owned entry while retaining content, history, other entries and floor visibility', async () => {
    const f = await fixture();
    const initial = { entries: {
        0: ownedSummaryEntry(0, 'archive-a'), 1: ownedSummaryEntry(1, 'archive-b', 'b.png'),
        2: { uid: 2, content: '手写内容', disable: false, constant: true },
    } };
    await f.context.saveWorldInfo('喵喵大总结世界书', initial);
    f.writes.length = 0;
    const messages = structuredClone(f.context.chat);
    f.api.applyEnabledState(false);
    await f.api.evaluate('chatSyncChain');
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.writes.length, 1);
    const saved = f.writes[0].data;
    for (const uid of [0, 1]) assert.deepEqual(saved.entries[uid], { ...initial.entries[uid], disable: true, constant: false });
    assert.deepEqual(saved.entries[2], initial.entries[2]);
    assert.deepEqual(f.context.chat, messages);
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.evaluate('disabledCleanupPending'), 0);
    assert.match(f.controls.get('.als-status').textContent, /条目已停用/);
});

test('disabled startup with unsummarized card B repairs enabled card A entries once and stays idle on later chat switches', async () => {
    const f = await fixture({ enabled: false });
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: { 0: ownedSummaryEntry(0, 'archive-a') } });
    f.writes.length = 0;
    f.context.characters.push({ name: '角色 B', avatar: 'b.png', chat: 'chat-b' });
    f.context.characterId = 1;
    f.context.chatId = 'chat-b';
    Object.assign(f.context.eventTypes, { CHAT_CHANGED: 'changed', CHAT_CREATED: 'created' });
    f.api.evaluate('renderSettings = async () => {}; restoreUpdateDraft = () => {}; initialize()');
    await f.api.evaluate('chatSyncChain');
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].data.entries[0].disable, true);
    assert.deepEqual(f.context.chatMetadata, {});
    let reads = 0;
    f.context.updateWorldInfoList = async () => { reads++; };
    await f.context.eventSource.emit('changed');
    await f.context.eventSource.emit('created');
    await f.api.evaluate('chatSyncChain');
    assert.equal(reads, 0);
    assert.equal(f.writes.length, 1);
    assert.equal(f.executed.length, 0);
});

test('cleanup never creates a missing book and never rewrites already disabled or unrelated entries', async () => {
    const f = await fixture({ enabled: false });
    await f.api.evaluate('scheduleDisabledCleanup()');
    assert.equal(f.writes.length, 0);
    const entry = { ...ownedSummaryEntry(0, 'archive-a'), constant: false, disable: true };
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: {
        0: entry, 1: { uid: 1, content: '别人写的世界书', constant: true, disable: false },
    } });
    f.writes.length = 0;
    await f.api.evaluate('scheduleDisabledCleanup()');
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
});

test('cleanup failure is reported without pretending the entry was disabled and releases controls', async () => {
    const f = await fixture({ enabled: false });
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: { 0: ownedSummaryEntry(0, 'archive-a') } });
    f.writes.length = 0;
    f.context.saveWorldInfo = async () => {}; // ST can swallow a failed server save.
    await f.api.evaluate('scheduleDisabledCleanup()');
    assert.match(f.controls.get('.als-status').textContent, /停用失败/);
    assert.ok(f.notices.some(notice => notice.kind === 'error' && notice.args[0].includes('读回确认')));
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.evaluate('disabledCleanupPending'), 0);
    assert.equal(f.executed.length, 0);
});

test('an old cleanup cannot deactivate a newly enabled archive after a delayed save', async () => {
    const f = await fixture();
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: {
        0: ownedSummaryEntry(0, 'archive-a'), 1: ownedSummaryEntry(1, 'archive-b', 'b.png'),
    } });
    f.writes.length = 0;
    f.api.evaluate(`activateWorldBook = async () => {}; updateWorldBookStatus = async () => {};
        assemblePrompt = async () => ({}); countAssembledPrompt = async () => 1000;`);
    const save = f.context.saveWorldInfo.bind(f.context);
    let release;
    let started;
    const saving = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.context.saveWorldInfo = async (...args) => {
        if (!f.api.state().settings.enabled) { started(); await gate; }
        return await save(...args);
    };
    f.api.applyEnabledState(false);
    await saving;
    f.api.applyEnabledState(true);
    assert.ok(f.api.state().sendLockDepth > 0, 'activation stays locked behind the cleanup save');
    release();
    await f.api.evaluate('enabledSaveChain');
    await new Promise(resolve => setTimeout(resolve, 0));
    await f.api.evaluate('chatSyncChain');
    const current = f.writes.at(-1).data.entries;
    assert.equal(current[0].disable, false);
    assert.equal(current[0].constant, true);
    assert.equal(current[1].disable, true);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.evaluate('disabledCleanupPending'), 0);
});

test('re-enabling on unsummarized card B leaves every other archive disabled', async () => {
    const f = await fixture({ enabled: false });
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: { 0: ownedSummaryEntry(0, 'archive-a') } });
    await f.api.evaluate('scheduleDisabledCleanup()');
    f.context.characters.push({ name: '角色 B', avatar: 'b.png', chat: 'chat-b' });
    f.context.characterId = 1;
    f.context.chatId = 'chat-b';
    f.api.evaluate(`activateWorldBook = async () => {}; updateWorldBookStatus = async () => {};
        assemblePrompt = async () => ({}); countAssembledPrompt = async () => 1000;`);
    f.api.applyEnabledState(true);
    await f.api.evaluate('enabledSaveChain');
    await new Promise(resolve => setTimeout(resolve, 0));
    await f.api.evaluate('chatSyncChain');
    assert.equal(f.sandbox.__fixtures.book().entries[0].disable, true);
    assert.equal(f.sandbox.__fixtures.book().entries[0].constant, false);
    assert.equal(f.executed.length, 0);
});

test('pending cleanup blocks model sends until complete but native local slash commands still pass', async () => {
    const f = await fixture({ enabled: false });
    let release;
    let started;
    const reading = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.context.updateWorldInfoList = async () => { started(); await gate; };
    const cleanup = f.api.evaluate('scheduleDisabledCleanup()');
    await reading;
    const normal = f.event('click', '继续对话');
    f.api.blockSendInput(normal);
    assert.equal(normal.prevented, true);
    for (const command of ['/hide 0-9', '/unhide 0-9', '/echo test']) {
        const event = f.event('click', command);
        f.api.blockSendInput(event);
        assert.equal(event.prevented, false);
    }
    let aborts = 0;
    f.interceptor([], 1000, () => aborts++, 'normal');
    assert.equal(aborts, 1);
    release();
    await cleanup;
    const next = f.event('click', '继续对话');
    f.api.blockSendInput(next);
    assert.equal(next.prevented, false);
    f.interceptor([], 1000, () => aborts++, 'normal');
    assert.equal(aborts, 1);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('both custom prompt templates survive confirmed save, mode changes and a fresh page reload verbatim', async () => {
    const f = await fixture();
    const incremental = '自定义新增\n{{user}} {{getvar::测试}}\n<details><summary>大总结</summary>\n保留所有标点 `$` 和 \\ 路径\n</details>';
    const merged = '自定义合并\n<details><summary>角色表</summary>\n{{char}} 与中文🙂\n</details>';
    f.controls.get('.als-prompt').value = incremental;
    await f.api.savePromptDraft();
    f.api.changeMode('merged');
    f.controls.get('.als-prompt').value = merged;
    await f.api.savePromptDraft();
    assert.equal(f.savedPreferences.length, 2);
    assert.equal(f.api.state().settings.prompt, incremental, 'editing another mode must not change the active prompt');
    const saved = f.savedPreferences.at(-1).auto_large_summary;
    const reloaded = await fixture({ ...saved, mode: 'merged' });
    reloaded.api.getSettings();
    reloaded.api.getSettings();
    assert.equal(reloaded.api.state().settings.prompts.incremental, incremental);
    assert.equal(reloaded.api.state().settings.prompts.merged, merged);
    assert.equal(reloaded.api.state().settings.prompt, merged);
    reloaded.api.changeMode('incremental');
    assert.equal(reloaded.controls.get('.als-prompt').value, incremental);
    assert.equal(f.handlers.get('settings-updated').size, 0, 'confirmation listeners must be removed');
});

test('unconfirmed ST settings saves cannot show prompt-save success and keep the unsaved draft', async () => {
    const f = await fixture();
    const previous = f.api.state().settings.prompts.incremental;
    f.context.suppressSaveConfirmation = true;
    f.controls.get('.als-prompt').value = '需要重试的自定义提示词';
    await f.api.savePromptDraft();
    assert.equal(f.savedPreferences.length, 0);
    assert.equal(f.api.state().settings.prompts.incremental, previous);
    assert.equal(f.controls.get('.als-prompt').value, '需要重试的自定义提示词');
    assert.equal(f.notices.some(notice => notice.kind === 'success'), false);
    assert.ok(f.notices.some(notice => notice.kind === 'error' && notice.args[0].includes('保存失败')));
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.handlers.get('settings-updated').size, 0);
    f.context.suppressSaveConfirmation = false;
    await f.api.savePromptDraft();
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.prompts.incremental, '需要重试的自定义提示词');
});

test('empty prompt drafts cannot replace saved templates', async () => {
    const f = await fixture();
    const previous = f.api.state().settings.prompt;
    f.controls.get('.als-prompt').value = '   \n';
    await f.api.savePromptDraft();
    assert.equal(f.api.state().settings.prompt, previous);
    assert.equal(f.savedPreferences.length, 0);
});

test('upgrading legacy settings preserves custom prompts and repairs missing templates only', async () => {
    const legacy = await fixture({ prompt: '用户原来的旧模板\n{{char}}' });
    assert.equal(legacy.api.state().settings.prompts.incremental, '用户原来的旧模板\n{{char}}');
    const partial = await fixture({ prompts: { incremental: '新模板', merged: 123 }, apiMode: 'invalid' });
    assert.equal(partial.api.state().settings.prompts.incremental, '新模板');
    assert.match(partial.api.state().settings.prompts.merged, /全文大总结/);
    assert.equal(partial.api.state().settings.apiMode, 'main');
    const defaults = await fixture();
    assert.match(defaults.api.state().settings.prompts.incremental, /开始执行\*\*新增大总结\*\*/);
    assert.match(defaults.api.state().settings.prompts.merged, /严禁输出<moew_FM>摘要/);
});

test('both default templates use the native user macro instead of a fixed persona name', async () => {
    const f = await fixture();
    for (const template of Object.values(f.api.state().settings.prompts)) {
        assert.equal((template.match(/关键角色和\{\{user\}\}之间的情感变化/g) ?? []).length, 2);
        assert.ok(!template.includes('结城爱'));
        assert.ok(!template.includes('<user>'));
    }
});

test('previously saved named defaults migrate once, preserve whitespace, and survive persistence and reload', async () => {
    const f = await fixture();
    const defaults = structuredClone(f.api.state().settings.prompts);
    const old = Object.fromEntries(Object.entries(defaults).map(([mode, template]) => [mode, ` \r\n${template.replaceAll('{{user}}', '结城爱').replaceAll('\n', '\r\n')}\r\n `]));
    const expected = Object.fromEntries(Object.entries(old).map(([mode, template]) => [mode, template.replaceAll('结城爱', '{{user}}')]));
    f.api.state().settings.prompts = old;
    f.api.state().settings.mode = 'merged';
    let saves = 0;
    f.context.saveSettingsDebounced = () => { saves++; };
    f.api.getSettings();
    assert.equal(saves, 1);
    for (const mode of ['incremental', 'merged']) assert.equal(f.api.state().settings.prompts[mode], expected[mode]);
    assert.equal(f.api.state().settings.prompt, f.api.state().settings.prompts.merged);
    f.api.getSettings();
    assert.equal(saves, 1, 'migrated defaults must not be rewritten on every settings read');
    await f.api.persistSettingsNow();
    const reloaded = await fixture(f.savedPreferences.at(-1).auto_large_summary);
    assert.deepEqual(structuredClone(reloaded.api.state().settings.prompts), structuredClone(f.api.state().settings.prompts));
    const legacy = await fixture({ prompt: defaults.incremental.replaceAll('{{user}}', '结城爱') });
    assert.equal(legacy.api.state().settings.prompts.incremental, defaults.incremental);
});

test('default-name migration keeps customized templates unchanged even if they mention the same name', async () => {
    const defaults = await fixture();
    const incremental = defaults.api.state().settings.prompts.incremental.replaceAll('{{user}}', '结城爱') + '\n这是我修改后的自定义要求';
    const merged = '自定义角色关系：结城爱 / {{user}}\n保持原文';
    const f = await fixture({ prompts: { incremental, merged } });
    assert.equal(f.api.state().settings.prompts.incremental, incremental);
    assert.equal(f.api.state().settings.prompts.merged, merged);
});

test('both summary modes expand the user macro through ST before sending while preserving the saved template', async () => {
    for (const mode of ['incremental', 'merged']) {
        const f = await fixture({ mode });
        f.prepareSummary();
        const template = f.api.state().settings.prompt;
        let calls = 0;
        f.context.substituteParamsExtended = async text => {
            calls++;
            assert.equal(text, template);
            return text.replaceAll('{{user}}', '当前用户角色');
        };
        f.sandbox.__fixtures.capture = prompt => {
            assert.equal((prompt.match(/关键角色和当前用户角色之间/g) ?? []).length, 2);
            assert.ok(!prompt.includes('{{user}}'));
            assert.ok(!prompt.includes('结城爱'));
            return '<details><summary>大总结</summary>事件记录</details>';
        };
        f.api.evaluate('requestMainApiSummary = async (_context, prompt) => __fixtures.capture(prompt)');
        assert.equal(await f.api.runLargeSummary(), true);
        assert.equal(calls, 1);
        assert.equal(f.api.state().settings.prompt, template);
        assert.ok(f.api.state().settings.prompt.includes('{{user}}'));
    }
});

test('saving or resetting ordinary settings does not replace either saved custom prompt', async () => {
    const f = await fixture({ prompts: { incremental: '增量自定义', merged: '合并自定义' } });
    f.api.evaluate(`scheduleChatSync = async () => {}; settingsDraft.keepRecent = 15; settingsDraft.mode = 'merged'`);
    await f.api.saveSettingsDraft();
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.prompt, '合并自定义');
    f.api.evaluate(`settingsDraft = Object.fromEntries(SETTING_FIELDS.map(key => [key, structuredClone(DEFAULT_SETTINGS[key])]));`);
    await f.api.saveSettingsDraft();
    const saved = f.savedPreferences.at(-1).auto_large_summary;
    assert.equal(saved.prompts.incremental, '增量自定义');
    assert.equal(saved.prompts.merged, '合并自定义');
});

test('secondary URL normalization accepts base and completion URLs without duplicated paths', async () => {
    const f = await fixture();
    for (const [input, expected] of [
        ['https://example.test', 'https://example.test/v1'],
        ['https://example.test/v1/', 'https://example.test/v1'],
        ['https://example.test/v1/chat/completions', 'https://example.test/v1'],
        ['http://localhost:5000/custom/models', 'http://localhost:5000/custom'],
    ]) {
        const config = f.api.getSecondaryConfig({ secondaryUrl: input, secondaryKey: 'Bearer mock-key', secondaryModel: 'model-a' });
        assert.equal(config.url, expected);
        assert.equal(config.key, 'mock-key');
    }
    for (const url of ['', 'file:///tmp', 'javascript:alert(1)', 'https://user:pass@example.test/v1', 'https://example.test/v1?key=secret']) {
        assert.throws(() => f.api.getSecondaryConfig({ secondaryUrl: url, secondaryModel: 'model-a' }), /喵/);
    }
    assert.throws(() => f.api.getSecondaryConfig({ secondaryUrl: 'https://example.test/v1', secondaryModel: '' }), /选择副 API 模型/);
    assert.throws(() => f.api.getSecondaryConfig({ secondaryUrl: 'https://example.test/v1', secondaryKey: 'bad\nkey', secondaryModel: 'a' }), /不能换行/);
});

test('secondary payload keeps processed messages and standard sampling but excludes main credentials and tools', async () => {
    const f = await fixture();
    const original = { messages: [{ role: 'system', content: '经过 EJS 处理的环境' }, { role: 'user', content: '尾部指令' }],
        max_tokens: 4096, temperature: 0.7, top_p: 0.9, stream: true, model: 'main-model',
        reverse_proxy: 'https://main.test', proxy_password: 'main-key', custom_include_headers: 'main-secret',
        tools: [{ type: 'function' }], tool_choice: 'auto', secret_id: 'main-secret-id', custom_include_body: 'model: wrong',
        custom_prompt_post_processing: 'strict', stop: ['stop'] };
    const payload = f.api.buildSecondaryRequest(f.context, original, { url: 'https://secondary.test/v1', key: 'secondary-key', model: 'selected-model' });
    assert.deepEqual(JSON.parse(JSON.stringify(payload.messages)), original.messages);
    assert.equal(payload.chat_completion_source, 'custom');
    assert.equal(payload.model, 'selected-model');
    assert.equal(payload.stream, false);
    assert.equal(payload.max_tokens, 4096);
    assert.equal(payload.temperature, 0.7);
    assert.equal(payload.custom_prompt_post_processing, 'strict');
    assert.equal(JSON.parse(payload.custom_include_headers).Authorization, 'Bearer secondary-key');
    assert.equal(JSON.stringify(payload).includes('main-secret'), false);
    assert.equal(JSON.stringify(payload).includes('main-key'), false);
    assert.equal(payload.tools, undefined);
    assert.equal(payload.custom_include_body, undefined);
    assert.notEqual(payload.messages, original.messages);
    const keyless = f.api.buildSecondaryRequest(f.context, original, { url: 'http://local.test/v1', key: '', model: 'local' });
    assert.equal(JSON.parse(keyless.custom_include_headers).Authorization, '', 'keyless requests cannot borrow the main key');
});

test('model pulling uses ST custom backend, deduplicates IDs and leaves model selection to the user', async () => {
    const f = await fixture();
    f.api.evaluate(`Object.assign(settingsDraft, { apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1', secondaryKey: 'mock-key' })`);
    let payload;
    f.sandbox.fetch = async (url, init) => {
        assert.equal(url, '/api/backends/chat-completions/status');
        payload = JSON.parse(init.body);
        assert.ok(init.signal);
        return { ok: true, json: async () => ({ data: [{ id: 'model-z' }, { id: 'model-a' }, { id: 'model-z' }, {}] }) };
    };
    await f.api.fetchSecondaryModels();
    assert.equal(payload.custom_url, 'https://secondary.test/v1');
    assert.equal(JSON.parse(payload.custom_include_headers).Authorization, 'Bearer mock-key');
    assert.deepEqual(Array.from(f.api.evaluate('settingsDraft.secondaryModels')), ['model-a', 'model-z']);
    assert.equal(f.api.evaluate('settingsDraft.secondaryModel'), '');
    assert.equal(f.savedPreferences.length, 0);
    assert.equal(f.controls.get('.als-model-fetch').disabled, false);
});

test('stale model lists cannot overwrite a changed endpoint or key', async () => {
    const f = await fixture();
    f.api.evaluate(`settingsDraft.secondaryUrl = 'https://old.test/v1'`);
    f.sandbox.fetch = async () => {
        f.api.evaluate(`settingsDraft.secondaryUrl = 'https://new.test/v1'`);
        return { ok: true, json: async () => ({ data: [{ id: 'old-model' }] }) };
    };
    await f.api.fetchSecondaryModels();
    assert.deepEqual(Array.from(f.api.evaluate('settingsDraft.secondaryModels')), []);
    assert.equal(f.controls.get('.als-model-fetch').disabled, false);
});

for (const response of [{ ok: false, status: 401 }, { ok: true, json: async () => ({ error: true }) }, { ok: true, json: async () => ({ data: [] }) }]) {
    test(`model list failure or empty response remains usable for manually entered models (${response.status ?? '200'})`, async () => {
        const f = await fixture();
        f.api.evaluate(`settingsDraft.secondaryUrl = 'https://secondary.test/v1'; settingsDraft.secondaryModel = 'manual-model'`);
        f.sandbox.fetch = async () => response;
        await f.api.fetchSecondaryModels();
        assert.equal(f.api.evaluate('settingsDraft.secondaryModel'), 'manual-model');
        assert.equal(f.controls.get('.als-model-fetch').disabled, false);
        assert.equal(f.writes.length, 0);
    });
}

test('secondary connection and chosen model persist without modifying the main API configuration', async () => {
    const f = await fixture();
    f.context.chatCompletionSettings = { custom_url: 'https://main.test/v1', model: 'main-model' };
    const original = structuredClone(f.context.chatCompletionSettings);
    f.api.evaluate(`scheduleChatSync = async () => {}; Object.assign(settingsDraft, {
        apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1/chat/completions', secondaryKey: 'mock-key',
        secondaryModel: 'chosen-model', secondaryModels: ['chosen-model'] });`);
    await f.api.saveSettingsDraft();
    const saved = f.savedPreferences.at(-1).auto_large_summary;
    const reloaded = await fixture(saved);
    assert.equal(reloaded.api.state().settings.secondaryUrl, 'https://secondary.test/v1');
    assert.equal(reloaded.api.state().settings.secondaryKey, 'mock-key');
    assert.equal(reloaded.api.state().settings.secondaryModel, 'chosen-model');
    assert.equal(reloaded.api.state().settings.apiMode, 'secondary');
    assert.deepEqual(f.context.chatCompletionSettings, original);
});

test('invalid or unconfirmed secondary settings do not replace the saved API selection', async () => {
    const f = await fixture();
    f.api.evaluate(`scheduleChatSync = async () => {}; settingsDraft.apiMode = 'secondary'`);
    await f.api.saveSettingsDraft();
    assert.equal(f.savedPreferences.length, 0);
    assert.equal(f.api.state().settings.apiMode, 'main');
    f.api.evaluate(`settingsDraft.secondaryUrl = 'https://secondary.test/v1'; settingsDraft.secondaryModel = 'manual-model'`);
    f.context.suppressSaveConfirmation = true;
    await f.api.saveSettingsDraft();
    assert.equal(f.api.state().settings.apiMode, 'main');
    assert.equal(f.api.evaluate('settingsDraft.apiMode'), 'secondary');
    assert.equal(f.api.state().sendLockDepth, 0);
});

for (const mainApi of ['openai', 'kobold']) {
    test(`secondary summary routes only the exact native quiet request; ${mainApi} environment and cleanup are preserved`, async () => {
        const f = await fixture({ apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1', secondaryKey: 'mock-key', secondaryModel: 'selected-model' });
        f.prepareSummary({ nativeRequest: true });
        f.context.mainApi = mainApi;
        const realFetch = f.sandbox.fetch;
        let calls = 0;
        let untouched = 0;
        const body = '<details><summary>大总结</summary>副 API 正文</details>\n<details><summary>角色表</summary>角色</details>';
        const raw = `<star_cot>不保存推理</star_cot>\n${body}`;
        const controller = new AbortController();
        f.sandbox.fetch = async (url, init) => {
            if (url === '/api/backends/chat-completions/generate') {
                calls++;
                const payload = JSON.parse(init.body);
                assert.equal(payload.model, 'selected-model');
                assert.equal(payload.custom_url, 'https://secondary.test/v1');
                assert.equal(payload.stream, false);
                assert.equal(init.signal, controller.signal);
                const prompt = payload.messages.map(message => message.content).join('\n');
                assert.ok(prompt.includes(f.api.state().settings.prompt));
                assert.equal(payload.tools, undefined);
                return new Response(JSON.stringify({ choices: [{ message: { content: raw, reasoning_content: '不抓取此字段' } }] }));
            }
            if (url === '/api/unrelated') { untouched++; return { ok: true }; }
            return realFetch(url, init);
        };
        const originalFetch = f.sandbox.fetch;
        f.context.generate = async (type, _options, dryRun) => {
            assert.equal(type, 'quiet');
            assert.equal(dryRun, false);
            f.api.onGenerationAfterCommands(type, {}, false);
            let aborted = false;
            f.interceptor([], 60000, () => { aborted = true; }, type);
            assert.equal(aborted, false);
            const payload = mainApi === 'openai'
                ? { type, messages: [{ role: 'system', content: '酒馆处理后的预设' }, { role: 'user', content: '酒馆处理后的历史' }], tools: [{}] }
                : { prompt: '酒馆处理后的文本环境', max_length: 4096 };
            if (mainApi === 'openai') f.api.onMainApiRequest(payload);
            else f.api.onFinalPromptData(payload, false);
            await f.sandbox.fetch('/api/unrelated', { body: 'unrelated' });
            const response = await f.sandbox.fetch(`/api/backends/${mainApi === 'openai' ? 'chat-completions' : 'kobold'}/generate`, { body: JSON.stringify(payload), signal: controller.signal });
            const data = await response.json();
            return mainApi === 'openai' ? data.choices[0].message.content : data.results[0].text;
        };
        assert.equal(await f.api.runLargeSummary(), true);
        assert.equal(calls, 1);
        assert.equal(untouched, 1);
        assert.equal(Object.values(f.writes[0].data.entries)[0].content, body);
        assert.equal(f.sandbox.fetch, originalFetch);
        assert.deepEqual(f.executed, ['/hide 0-9']);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

for (const failure of ['http', 'provider', 'empty', 'cancel']) {
    test(`secondary ${failure} failures never save or hide and restore the native request flow`, async () => {
        const f = await fixture({ apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1', secondaryModel: 'chosen' });
        f.prepareSummary({ nativeRequest: true });
        const realFetch = f.sandbox.fetch;
        f.sandbox.fetch = async (url, init) => {
            if (url !== '/api/backends/chat-completions/generate') return realFetch(url, init);
            if (failure === 'http') return new Response('{}', { status: 401 });
            if (failure === 'provider') return new Response(JSON.stringify({ error: true }));
            if (failure === 'cancel') f.api.blockSendInput(f.event('click', '/unhide 0-9999'));
            const content = failure === 'empty' ? '<star_cot>只有推理</star_cot>' : '旧档总结';
            return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
        };
        const originalFetch = f.sandbox.fetch;
        f.context.generate = async () => {
            const payload = { type: 'quiet', messages: [{ role: 'user', content: '环境' }] };
            f.api.onMainApiRequest(payload);
            return await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
        };
        await f.api.runLargeSummary();
        assert.equal(f.writes.length, 0);
        assert.equal(f.executed.length, 0);
        assert.equal(f.sandbox.fetch, originalFetch);
        assert.equal(f.api.evaluate('summaryRequest'), null);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

test('after-summary over-threshold warning stops automatic repeats across replies and archive reopening', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    f.api.evaluate(`__fixtures.calls = 0; __fixtures.counts = [61000, 65000]; waitForCurrentGeneration = async () => true;
        assemblePrompt = async () => ({}); countAssembledPrompt = async () => __fixtures.counts.shift() ?? 65000;
        runLargeSummary = async () => { __fixtures.calls++; return true; };`);
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: false });
    assert.equal(f.api.evaluate('__fixtures.calls'), 1);
    assert.equal(f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold, true);
    assert.equal(f.context.chatMetadata.auto_large_summary.autoTriggerArmed, false);
    assert.ok(f.notices.some(notice => notice.kind === 'warning' && notice.args[0].includes('65,000 / 60,000')));
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: false });
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: true });
    assert.equal(f.api.evaluate('__fixtures.calls'), 1);
    assert.equal(f.executed.length, 0);
    f.api.evaluate('__fixtures.counts = [10000]');
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: false });
    assert.equal(f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold, false);
    assert.equal(f.context.chatMetadata.auto_large_summary.autoTriggerArmed, true);
});

test('manual summary recount reports an over-threshold result without changing saved history or issuing commands', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    const writesBeforeRecount = f.writes.length;
    f.api.evaluate('assemblePrompt = async () => ({}); countAssembledPrompt = async () => 70000');
    await f.api.refreshVisibilityTokens(f.context, undefined, { afterSummary: true });
    assert.equal(f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold, true);
    assert.equal(f.writes.length, writesBeforeRecount);
    assert.deepEqual(f.executed, ['/hide 0-9']);
    assert.ok(f.notices.some(notice => notice.kind === 'warning' && notice.args[0].includes('70,000')));
});

test('a manual hide below threshold clears the pause but only recounts without generating or hiding again', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold = true;
    f.context.chatMetadata.auto_large_summary.autoTriggerArmed = false;
    await f.context.executeSlashCommandsWithOptions('/hide 0-9');
    f.api.evaluate('assemblePrompt = async () => ({}); countAssembledPrompt = async () => 10000');
    await f.api.refreshVisibilityTokens(f.context);
    assert.equal(f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold, false);
    assert.equal(f.context.chatMetadata.auto_large_summary.autoTriggerArmed, true);
    assert.deepEqual(f.executed, ['/hide 0-9']);
    assert.equal(f.writes.length, 0);
});

test('a copied archive cannot inherit another character over-threshold pause', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold = true;
    f.context.characters.push({ name: '角色 B', avatar: 'b.png', chat: 'chat-b' });
    f.setContext({ ...f.context, characterId: 1, chatId: 'chat-b' });
    await f.api.evaluate('ensureArchive()');
    assert.equal(f.context.chatMetadata.auto_large_summary.summaryStillOverThreshold, false);
    assert.equal(f.context.chatMetadata.auto_large_summary.autoTriggerArmed, true);
});

test('finishing a model pull while sending is locked does not leave the model button disabled', async () => {
    const f = await fixture();
    f.api.evaluate(`settingsDraft.secondaryUrl = 'https://secondary.test/v1'`);
    let finish;
    f.sandbox.fetch = async () => await new Promise(resolve => { finish = resolve; });
    const pending = f.api.fetchSecondaryModels();
    assert.equal(f.controls.get('.als-model-fetch').disabled, true);
    f.api.lockSending();
    finish({ ok: true, json: async () => ({ data: [{ id: 'model-a' }] }) });
    await pending;
    assert.equal(f.controls.get('.als-model-fetch').disabled, true);
    f.api.unlockSending();
    assert.equal(f.controls.get('.als-model-fetch').disabled, false);
});

for (const failure of [false, true]) {
    test(`secondary depth injection restores the previous extension prompt after ${failure ? 'failure' : 'success'}`, async () => {
        const f = await fixture({ apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1', secondaryModel: 'chosen', instructionPosition: 'depth', instructionDepth: 0, instructionRole: 0 });
        f.prepareSummary({ nativeRequest: true });
        const id = 'meow_large_summary_instruction';
        const previous = { value: '原来的注入' };
        f.context.extensionPrompts = { [id]: previous };
        f.context.setExtensionPrompt = (key, value, position, depth, scan, role) => {
            assert.equal(position, 1);
            assert.equal(depth, 0);
            assert.equal(role, 0);
            f.context.extensionPrompts[key] = { value };
        };
        const realFetch = f.sandbox.fetch;
        f.sandbox.fetch = async (url, init) => {
            if (url !== '/api/backends/chat-completions/generate') return realFetch(url, init);
            const payload = JSON.parse(init.body);
            assert.equal(payload.messages[0].role, 'system');
            assert.equal(payload.messages[0].content, f.api.state().settings.prompt);
            assert.equal(payload.messages.length, 2, 'depth mode must not also add a tail instruction');
            return failure ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ choices: [{ message: { content: '正确正文' } }] }));
        };
        f.context.generate = async () => {
            const payload = { type: 'quiet', messages: [{ role: 'system', content: f.context.extensionPrompts[id].value }, { role: 'user', content: '剧情' }] };
            f.api.onMainApiRequest(payload);
            const response = await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
            return (await response.json()).text;
        };
        await f.api.runLargeSummary();
        assert.equal(f.context.extensionPrompts[id], previous);
        assert.equal(f.writes.length, failure ? 0 : 2); // Summary commit, then confirmed hide completion.
        assert.equal(f.executed.length, failure ? 0 : 1);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

test('invalid post-summary token counts cannot rearm automatic generation', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    f.api.evaluate(`__fixtures.counts = [61000, NaN]; waitForCurrentGeneration = async () => true;
        assemblePrompt = async () => ({}); countAssembledPrompt = async () => __fixtures.counts.shift();
        runLargeSummary = async () => true;`);
    await f.api.checkAfterReply({ chatId: 'chat-a', characterId: 0, onOpen: false });
    assert.equal(f.context.chatMetadata.auto_large_summary.autoTriggerArmed, false);
    assert.ok(f.notices.some(notice => notice.kind === 'error' && notice.args[0].includes('无效')));
});

test('a late hook rewriting the owned summary request cannot silently send it to the main API', async () => {
    const f = await fixture({ apiMode: 'secondary', secondaryUrl: 'https://secondary.test/v1', secondaryModel: 'chosen' });
    f.prepareSummary({ nativeRequest: true });
    const realFetch = f.sandbox.fetch;
    let calls = 0;
    f.sandbox.fetch = async (url, init) => {
        if (url === '/api/backends/chat-completions/generate') { calls++; return new Response('{}'); }
        return realFetch(url, init);
    };
    f.context.generate = async () => {
        const payload = { type: 'quiet', chat_completion_source: 'openai', model: 'main-model', messages: [{ role: 'user', content: '正文' }] };
        f.api.onMainApiRequest(payload);
        assert.equal(payload.chat_completion_source, 'custom');
        assert.equal(payload.model, 'chosen');
        payload.chat_completion_source = 'openai'; // Simulate a later conflicting extension hook.
        await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
    };
    await f.api.runLargeSummary();
    assert.equal(calls, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('updating waits for confirmed settings persistence, preserves the input draft, and then refreshes', async () => {
    const f = await fixture();
    const drafts = new Map();
    f.sandbox.sessionStorage = { setItem: (key, value) => drafts.set(key, value) };
    let reloads = 0;
    f.sandbox.location.reload = () => {
        assert.equal(f.savedPreferences.at(-1).auto_large_summary.enabled, false);
        reloads++;
    };
    f.input.value = '还没发送的草稿';
    f.api.applyEnabledState(false);
    await f.api.onExtensionUpdate();
    assert.equal(reloads, 1);
    assert.equal(JSON.parse([...drafts.values()][0]).text, '还没发送的草稿');
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('product notifications use meow voice while user-supplied prompts remain unchanged', async () => {
    const f = await fixture({ prompts: { incremental: '原封不动的用户提示词', merged: '用户的另一份模板' } });
    f.prepareSummary();
    await f.api.runLargeSummary();
    for (const notice of f.notices.filter(notice => notice.kind !== 'clear')) assert.match(notice.args[0], /喵/);
    assert.equal(f.api.state().settings.prompt, '原封不动的用户提示词');
    assert.match(markupSource, />mewo!!<\/span>/);
    assert.equal(source.includes('>New!</span>'), false);
});

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

test('disabled plugin leaves native unhide alone without scheduling a recount', async () => {
    const f = await fixture({ enabled: false });
    const nativeExecute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    f.context.SlashCommandParser = { commands: { unhide: { callback: async (_args, range) => nativeExecute(`/unhide ${range}`) } } };
    f.context.mainApi = 'openai';
    f.context.getTokenCountAsync = async prompt => Number(prompt);
    f.context.generate = async () => f.api.onFinalPromptData({ prompt: String(f.context.chat.filter(message => !message.is_system).length * 2500) }, true);
    await nativeExecute('/hide 0-9');
    f.api.installVisibilityCommandHooks();
    await f.context.SlashCommandParser.commands.unhide.callback({}, '0-9999');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(f.tokenRenders, []);
    assert.equal(f.api.evaluate('visibilityRefreshTimer'), null);
    assert.deepEqual(f.executed, ['/hide 0-9', '/unhide 0-9999']);
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.equal(f.writes.length, 0);
});

test('disabled startup and chat sync do not read books, create metadata, lock sends or run summaries', async () => {
    const f = await fixture({ enabled: false });
    f.context.updateWorldInfoList = async () => assert.fail('disabled world book read');
    f.context.generate = async () => assert.fail('disabled generation');
    await f.api.evaluate('scheduleChatSync()');
    await f.api.evaluate('syncCurrentArchive()');
    await f.api.evaluate('updateWorldBookStatus()');
    await f.api.refreshVisibilityTokens(f.context);
    assert.equal(await f.api.runLargeSummary({ manual: true }), false);
    f.api.onGenerationAfterCommands('normal', {}, false);
    assert.equal(f.api.state().pendingGeneration, null);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.writes.length, 0);
    assert.equal(f.notices.length, 0);
});

test('turning off invalidates an already queued chat sync and releases its lock', async () => {
    const f = await fixture();
    f.api.evaluate('syncCurrentArchive = async () => { throw new Error("should not sync"); }');
    const queued = f.api.evaluate('scheduleChatSync()');
    f.api.applyEnabledState(false);
    await queued;
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.deepEqual(f.context.chatMetadata, {});
    assert.match(f.controls.get('.als-status').textContent, /插件已关闭/);
    assert.ok(!f.notices.some(notice => notice.kind === 'error'));
});

test('turning off during a book read prevents archive activation and further counting', async () => {
    const f = await fixture();
    f.api.evaluate(`prepareWorldBook = async () => { applyEnabledState(false); return { entries: {} }; };
        setArchiveActivation = async () => { throw new Error('disabled activation'); };
        assemblePrompt = async () => { throw new Error('disabled count'); };`);
    await f.api.evaluate('scheduleChatSync()');
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.writes.length, 0);
    assert.ok(!f.notices.some(notice => notice.kind === 'error'));
});

test('hooks installed while enabled bypass all plugin observation after it is disabled', async () => {
    const f = await fixture();
    let calls = 0;
    f.context.SlashCommandParser = { commands: { hide: { callback: async () => { calls++; return 'native'; } } } };
    f.api.installVisibilityCommandHooks();
    f.api.applyEnabledState(false);
    await f.api.evaluate('enabledSaveChain');
    const revision = f.api.evaluate('manualVisibilityRevision');
    assert.equal(await f.context.SlashCommandParser.commands.hide.callback(), 'native');
    f.api.blockSendInput(f.event());
    assert.equal(calls, 1);
    assert.equal(f.api.evaluate('manualVisibilityRevision'), revision);
    assert.equal(f.api.evaluate('visibilityRefreshTimer'), null);
    f.api.lockSending();
    let aborts = 0;
    f.interceptor([], 60000, () => aborts++, 'normal');
    assert.equal(aborts, 0);
    f.api.unlockSending();
});

test('turning off cancels a pending visibility preview before it counts or writes', async () => {
    const f = await fixture();
    f.api.evaluate(`assemblePrompt = async () => { applyEnabledState(false); return {}; };
        countAssembledPrompt = async () => { throw new Error('disabled token count'); };`);
    await f.api.refreshVisibilityTokens(f.context);
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.tokenRenders.length, 0);
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('disabled initialization and chat/reply events leave chat and world books untouched', async () => {
    const f = await fixture({ enabled: false });
    Object.assign(f.context.eventTypes, {
        GENERATION_STARTED: 'start', GENERATION_AFTER_COMMANDS: 'commands', GENERATE_AFTER_DATA: 'data',
        CHAT_COMPLETION_SETTINGS_READY: 'ready', MESSAGE_RECEIVED: 'received', GENERATION_ENDED: 'end',
        CHAT_CHANGED: 'changed', CHAT_CREATED: 'created',
    });
    let reads = 0;
    f.context.updateWorldInfoList = async () => { reads++; };
    f.api.evaluate('renderSettings = async () => {}; restoreUpdateDraft = () => {}; initialize()');
    await f.api.evaluate('chatSyncChain');
    assert.equal(reads, 1, 'startup only checks for leftover entries once');
    f.context.updateWorldInfoList = async () => assert.fail('disabled automatic read');
    for (const event of ['changed', 'created', 'start', 'commands', 'received', 'end']) await f.context.eventSource.emit(event, 'normal');
    await f.api.evaluate('chatSyncChain');
    assert.equal(f.api.state().pendingGeneration, null);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.notices.length, 0);
});

test('disabled configuration saves prompts and cleans old book state only when the name changes', async () => {
    const f = await fixture({ enabled: false });
    f.api.evaluate('settingsDraft.worldBookName = "新的世界书名字"');
    await f.api.saveSettingsDraft();
    await f.api.evaluate('chatSyncChain');
    f.controls.get('.als-prompt').value = '长期保存的自定义模板';
    await f.api.savePromptDraft();
    const reloaded = await fixture(f.savedPreferences.at(-1).auto_large_summary);
    assert.equal(reloaded.api.state().settings.enabled, false);
    assert.equal(reloaded.api.state().settings.worldBookName, '新的世界书名字');
    assert.equal(reloaded.api.state().settings.prompt, '长期保存的自定义模板');
    assert.equal(f.writes.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('disabled plugin makes no automatic model fetch and cancels an older model request', async () => {
    const f = await fixture();
    f.api.evaluate('settingsDraft.secondaryUrl = "https://example.com/v1"');
    let requests = 0;
    let resolveRequest;
    f.sandbox.fetch = () => { requests++; return new Promise(resolve => { resolveRequest = resolve; }); };
    const request = f.api.fetchSecondaryModels({ silent: true });
    f.api.applyEnabledState(false);
    resolveRequest({ ok: true, json: async () => ({ data: [{ id: 'stale-model' }] }) });
    await request;
    await f.api.fetchSecondaryModels({ silent: true });
    await f.api.evaluate('enabledSaveChain');
    assert.equal(requests, 1);
    assert.deepEqual(Array.from(f.api.evaluate('settingsDraft.secondaryModels')), []);
    assert.equal(f.controls.get('.als-model-fetch').disabled, false);
});

test('automatic update checks stay idle when disabled while explicit update checks remain available', async () => {
    const f = await fixture({ enabled: false });
    f.controls.set('.als-update-status', { textContent: '' });
    f.controls.set('.als-update-check', { disabled: false });
    let checks = 0;
    f.sandbox.__fixtures.updateCheck = () => { checks++; return { isUpToDate: true }; };
    f.api.evaluate(`getInstalledExtension = async () => ({});
        extensionApi = async () => __fixtures.updateCheck(); renderUpdateNotice = () => {};`);
    await f.api.evaluate('checkForUpdate({ silent: true })');
    assert.equal(checks, 0);
    await f.api.evaluate('checkForUpdate()');
    assert.equal(checks, 1);
    assert.match(f.controls.get('.als-update-status').textContent, /最新版本/);
    f.api.evaluate('settings.enabled = true; getInstalledExtension = async () => { applyEnabledState(false); return {}; }');
    await f.api.evaluate('checkForUpdate({ silent: true })');
    await f.api.evaluate('enabledSaveChain');
    assert.equal(checks, 1);
    assert.match(f.controls.get('.als-update-status').textContent, /插件已关闭/);
    assert.equal(f.controls.get('.als-update-check').disabled, false);
});

test('turning off also cancels manual summaries without saving or hiding', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate(`requestMainApiSummary = async () => { applyEnabledState(false); return '正文'; };`);
    await f.api.runLargeSummary({ manual: true });
    await f.api.evaluate('enabledSaveChain');
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('enabling immediately resumes archive sync and persists the enabled setting', async () => {
    const f = await fixture({ enabled: false });
    let synced = 0;
    f.sandbox.__fixtures.sync = () => { synced++; };
    f.api.evaluate('scheduleChatSync = async () => __fixtures.sync()');
    f.api.applyEnabledState(true);
    await f.api.evaluate('enabledSaveChain');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(synced, 1);
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.enabled, true);
});

test('model dropdown keeps the saved selection, supports custom IDs and never selects the first model automatically', async () => {
    const f = await fixture();
    const select = { value: '', replaceChildren(...options) { this.options = options; } };
    const manualField = { hidden: true };
    f.controls.set('.als-model-select', select);
    f.controls.set('.als-model-manual-field', manualField);
    f.api.evaluate('settingsDraft.secondaryModels = ["org/long-model-a", "org/model-b"]; settingsDraft.secondaryModel = ""; renderModelOptions()');
    assert.equal(select.value, '');
    assert.equal(select.options[1].textContent, 'org/long-model-a');
    assert.equal(manualField.hidden, true);
    f.api.evaluate('selectSecondaryModel("1")');
    assert.equal(f.api.evaluate('settingsDraft.secondaryModel'), 'org/model-b');
    assert.equal(f.controls.get('.als-secondary-model').value, 'org/model-b');
    f.api.evaluate('renderModelOptions()');
    assert.equal(select.value, '1');
    f.api.evaluate('selectSecondaryModel("manual")');
    assert.equal(manualField.hidden, false);
    f.api.evaluate('settingsDraft.secondaryModel = "custom/model-not-listed"; renderModelOptions()');
    assert.equal(select.value, 'manual');
    assert.equal(manualField.hidden, false);
    assert.equal(f.api.evaluate('settingsDraft.secondaryModel'), 'custom/model-not-listed');
});

test('mobile model markup uses a select with separate manual input and directory refresh has a fixed horizontal column', () => {
    assert.ok(!source.includes('<datalist'));
    assert.match(markupSource, /<select class="text_pole als-model-select"/);
    assert.match(markupSource, /als-model-manual-field/);
    assert.ok(!source.includes('喵喵设置'));
    assert.ok(!source.includes('总结小窝'));
    assert.match(stylesheet, /\.als-directory-heading\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s);
    assert.match(stylesheet, /\.als-settings \.als-directory-refresh\s*\{[^}]*white-space: nowrap !important/s);
    assert.match(stylesheet, /@media \(max-width: 600px\)/);
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
    f.api.evaluate(`let generated = false;
        requestMainApiSummary = async () => { generated = true; return '已生成总结'; };
        ensureWorldBook = async () => {
        if (generated) __fixtures.context.chat[0].is_system = true;
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

test('native quiet flow isolates the summary task, sends once, and filters raw reasoning', async () => {
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
        assert.equal(payload.messages.length, 2);
        assert.equal(payload.messages[0].role, 'system');
        assert.ok(payload.messages[0].content.includes(f.api.state().settings.prompt));
        assert.ok(!payload.messages[0].content.includes('roleplay-preset'));
        assert.equal(payload.messages[1].role, 'user');
        assert.ok(payload.messages[1].content.includes('roleplay-preset'));
        assert.ok(payload.messages[1].content.includes('history'));
        assert.equal(payload.tools, undefined);
        return { ok: true, clone: () => ({ json: async () => ({ message: rawText }) }) };
    };
    const originalFetch = f.sandbox.fetch;
    f.context.generate = async (type, options, dryRun) => {
        assert.equal(type, 'quiet');
        assert.match(options.quiet_prompt, /不续写、重演或推进剧情/);
        assert.equal(options.quietToLoud, false);
        assert.equal(dryRun, false);
        f.api.onGenerationAfterCommands(type, {}, dryRun);
        let aborted = false;
        f.interceptor([], 60000, () => { aborted = true; }, type);
        assert.equal(aborted, false);
        const payload = { type, messages: [{ role: 'system', content: 'roleplay-preset' }, { role: 'user', content: 'history' }], tools: [{}], assistant_prefill: 'continue the story' };
        f.api.onMainApiRequest(payload);
        assert.equal(payload.assistant_prefill, undefined);
        await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
        return ''; // Native output regex can filter a custom details format.
    };
    assert.equal(await f.api.runLargeSummary(), true);
    assert.equal(modelCalls, 1);
    assert.equal(Object.values(f.writes[0].data.entries)[0].content, body);
    assert.equal(f.sandbox.fetch, originalFetch);
    assert.equal(f.api.state().sendLockDepth, 0);
});

for (const mixedOutput of [
    '<!-- style note --><novel_header>新的一章</novel_header><content>旅行者又动身去了渡口。</content><details><summary>大总结</summary>两人约好明早见。</details>',
    '<details><summary>大总结</summary>两人约好明早见。</details><UpdateVariable><JSONPatch>[{"op":"replace","path":"/time","value":"tomorrow"}]</JSONPatch></UpdateVariable>',
]) {
    test('mixed story or variable-update output is retained for review without saving or hiding', async () => {
        const f = await fixture();
        f.prepareSummary({ nativeRequest: true });
        f.context.generate = async () => {
            f.api.onMainApiRequest({ type: 'quiet', messages: [] });
            return mixedOutput;
        };
        assert.notEqual(await f.api.runLargeSummary(), true);
        assert.equal(f.writes.length, 0);
        assert.equal(f.executed.length, 0);
        assert.ok(f.notices.some(n => n.kind === 'error' && n.args[0].includes('剧情续写或变量更新')));
        assert.equal(f.api.evaluate('incompleteResults.get("archive-a").content'), mixedOutput);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

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

test('automatic trigger can be off while manual summaries still save and hide below the threshold', async () => {
    const f = await fixture({ autoEnabled: false, threshold: 999999 });
    f.prepareSummary();
    f.api.onGenerationAfterCommands('normal', {}, false);
    assert.equal(f.api.state().pendingGeneration, null);
    assert.equal(await f.api.runLargeSummary(), false);
    assert.equal(await f.api.runLargeSummary({ manual: true }), true);
    assert.deepEqual(f.executed, ['/hide 0-9']);
    assert.equal(bookEntry(f).extensions.auto_large_summary.sourceEnd, 29);
    assert.equal(bookEntry(f).extensions.auto_large_summary.coveredTo, 9);
});

test('auto preference is persisted independently and legacy settings keep automatic behavior', async () => {
    const f = await fixture();
    assert.equal(f.api.state().settings.autoEnabled, true);
    f.api.evaluate('settingsDraft.autoEnabled = false; scheduleChatSync = async () => {};');
    await f.api.saveSettingsDraft();
    assert.equal(f.savedPreferences.at(-1).auto_large_summary.autoEnabled, false);
    assert.equal(f.api.state().settings.enabled, true);
    const reloaded = await fixture(f.savedPreferences.at(-1).auto_large_summary);
    assert.equal(reloaded.api.state().settings.autoEnabled, false);
});

test('manual compaction works immediately after summarizing without new messages or visibility changes', async () => {
    const f = await fixture({ autoEnabled: false });
    f.prepareSummary();
    await f.api.runLargeSummary({ manual: true });
    const flags = structuredClone(f.context.chat);
    const count = f.executed.length;
    f.api.evaluate(`requestMainApiSummary = async (_context, prompt, options) => {
        if (!options.sourceOnly || !prompt.includes('事件记录')) throw new Error('missing explicit source');
        return '合并后的短总结';
    };`);
    assert.equal(await f.api.runLargeSummary({ operation: 'compact' }), true);
    const entry = bookEntry(f);
    assert.equal(entry.content, '合并后的短总结');
    assert.equal(entry.extensions.auto_large_summary.records.length, 2);
    assert.equal(entry.extensions.auto_large_summary.records.at(-1).sourceEnd, 29);
    assert.equal(entry.extensions.auto_large_summary.records.at(-1).operation, 'compact');
    assert.equal(f.executed.length, count);
    assert.deepEqual(f.context.chat, flags);
});

test('compaction of an empty archive does not call the model or hide anything', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate('requestMainApiSummary = async () => { throw new Error("must not call"); };');
    assert.equal(await f.api.runLargeSummary({ operation: 'compact' }), false);
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('source-only generation sends only the supplied task despite unrelated current chat and depth settings', async () => {
    const f = await fixture({ instructionPosition: 'depth', instructionDepth: 0 });
    f.prepareSummary({ nativeRequest: true });
    f.context.generate = async () => {
        f.api.onGenerationAfterCommands('quiet', {}, false);
        f.interceptor([], 100000, () => assert.fail('unexpected abort'), 'quiet');
        const payload = { type: 'quiet', messages: [{ role: 'user', content: '不应进入合并的当前剧情' }] };
        f.api.onMainApiRequest(payload);
        assert.equal(payload.messages.length, 1);
        assert.equal(payload.messages[0].content, '仅整理：旧总结正文');
        return '已合并';
    };
    const result = await f.api.evaluate('requestMainApiSummary(getContext(), "仅整理：旧总结正文", { sourceOnly: true })');
    assert.equal(result, '已合并');
});

test('a fresh branch receives its own identity and never inherits summaries extending past its endpoint', async () => {
    const f = await fixture();
    f.context.chatMetadata.integrity = 'parent-integrity';
    f.prepareSummary();
    await f.api.runLargeSummary();
    const parent = structuredClone(bookEntry(f));
    const branch = { ...f.context, chatId: 'branch-b', chat: structuredClone(f.context.chat.slice(0, 15)),
        chatMetadata: { ...structuredClone(f.context.chatMetadata), integrity: 'branch-integrity' } };
    f.setContext(branch);
    const info = await f.api.evaluate('ensureArchive()');
    assert.notEqual(info.archive.archiveId, parent.extensions.auto_large_summary.archiveId);
    await f.api.evaluate('(async () => initializeBranchArchive(getContext(), await ensureArchive(), __fixtures.book()))()');
    assert.equal(info.archive.branch.needsRebuild, true);
    assert.equal(info.archive.lastSummarizedThrough, -1);
    assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false);
    f.api.evaluate(`requestMainApiSummary = async (_context, prompt, options) => {
        if (!options.sourceOnly || !prompt.includes('楼层 0') || prompt.includes('楼层 29')) throw new Error('wrong branch source');
        return '分支独立剧情';
    };`);
    await f.api.runLargeSummary({ operation: 'rebuild' });
    assert.equal(bookEntry(f).content, '分支独立剧情');
    assert.equal(info.archive.branch.needsRebuild, false);
    assert.equal(bookEntry(f).extensions.auto_large_summary.coveredTo, -1);
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.changes.length, 0);
    const parentAfter = f.writes.at(-1).data.entries[parent.uid];
    assert.equal(parentAfter.content, parent.content);
    assert.deepEqual(parentAfter.extensions, parent.extensions);
    assert.equal(Object.keys(f.writes.at(-1).data.entries).length, 2);
});

test('branch inheritance uses actual source endpoint, not the earlier hide boundary', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    const parentId = f.context.chatMetadata.auto_large_summary.archiveId;
    const branch = { ...f.context, chatId: 'branch-c', chat: structuredClone(f.context.chat), chatMetadata: structuredClone(f.context.chatMetadata) };
    f.setContext(branch);
    const info = await f.api.evaluate('ensureArchive()');
    await f.api.evaluate('(async () => initializeBranchArchive(getContext(), await ensureArchive(), __fixtures.book()))()');
    const entry = bookEntry(f);
    assert.notEqual(entry.extensions.auto_large_summary.archiveId, parentId);
    assert.equal(entry.extensions.auto_large_summary.records.length, 1);
    assert.equal(info.archive.lastSummarizedThrough, 9);
    assert.equal(info.archive.sourceEnd, 29);
    assert.equal(info.archive.branch.needsRebuild, false);
});

test('renaming a chat with the same host integrity preserves identity and history', async () => {
    const f = await fixture();
    f.context.chatMetadata.integrity = 'stable-chat-identity';
    const before = await f.api.evaluate('ensureArchive()');
    const id = before.archive.archiveId;
    f.context.chatId = 'renamed-chat';
    const after = await f.api.evaluate('ensureArchive()');
    assert.equal(after.archive.archiveId, id);
    assert.equal(after.archive.chatId, 'renamed-chat');
    assert.equal(after.archive.branch, undefined);
});

test('legacy copied metadata is isolated and requires explicit reconstruction when source endpoints are unknown', async () => {
    const f = await fixture();
    await f.api.evaluate('ensureArchive()');
    const entry = ownedSummaryEntry(0, 'archive-a');
    await f.context.saveWorldInfo('喵喵大总结世界书', { entries: { 0: entry } });
    f.context.chatId = 'legacy-copy';
    const info = await f.api.evaluate('ensureArchive()');
    await f.api.evaluate('(async () => initializeBranchArchive(getContext(), await ensureArchive(), __fixtures.book()))()');
    assert.notEqual(info.archive.archiveId, 'archive-a');
    assert.equal(info.archive.branch.needsRebuild, true);
    assert.equal(Object.keys(f.writes.at(-1).data.entries).length, 1);
});

test('hide failure has a persistent retry that performs no additional generation', async () => {
    const f = await fixture();
    f.prepareSummary();
    const nativeExecute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    f.context.executeSlashCommandsWithOptions = async () => { throw new Error('temporary hide failure'); };
    await f.api.runLargeSummary();
    const saved = bookEntry(f);
    assert.equal(saved.extensions.auto_large_summary.lastOperation.phase, 'saved');
    assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false, 'pending hiding is not replaced by another automatic model call');
    f.context.executeSlashCommandsWithOptions = nativeExecute;
    f.api.evaluate('requestMainApiSummary = async () => { throw new Error("must not regenerate"); };');
    await f.api.evaluate('recoverLatestSummary("retry")');
    assert.deepEqual(f.executed, ['/hide 0-9']);
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.phase, 'complete');
    assert.equal(bookEntry(f).extensions.auto_large_summary.records.length, 1);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('recovery survives page reload and restores only messages hidden by the operation', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.context.chat[4].is_system = true;
    await f.api.runLargeSummary();
    const g = await fixture(f.api.state().settings);
    g.context.chat = structuredClone(f.context.chat);
    g.context.chatMetadata = structuredClone(f.context.chatMetadata);
    await g.context.saveWorldInfo('喵喵大总结世界书', structuredClone(f.writes.at(-1).data));
    g.prepareSummary();
    await g.api.evaluate('recoverLatestSummary("restore")');
    assert.equal(g.context.chat[4].is_system, true, 'preexisting hidden message stays hidden');
    assert.equal(g.context.chat.filter(message => message.is_system).length, 1);
    assert.equal(bookEntry(g).extensions.auto_large_summary.lastOperation.messagesRestored, true);
});

for (const change of ['edit', 'manual-visibility', 'swipe']) {
    test(`recovery refuses to overwrite a later ${change} change`, async () => {
        const f = await fixture();
        f.prepareSummary();
        await f.api.runLargeSummary();
        const commands = f.executed.length;
        if (change === 'edit') f.context.chat[1].mes = '用户修改了原文';
        if (change === 'swipe') f.context.chat[1].swipe_id = 1;
        if (change === 'manual-visibility') {
            f.context.SlashCommandParser = { commands: { hide: { callback: async () => '' } } };
            f.api.installVisibilityCommandHooks();
            await f.context.SlashCommandParser.commands.hide.callback({}, '0-9');
        }
        await f.api.evaluate('recoverLatestSummary("restore")');
        assert.equal(f.executed.length, commands);
        assert.ok(f.notices.some(notice => String(notice.args?.[0]).includes('未覆盖你的操作')));
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

test('undo restores the previous injected text but preserves the undone output in history', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    const original = bookEntry(f).content;
    const flags = structuredClone(f.context.chat);
    f.api.evaluate('requestMainApiSummary = async () => "新合并正文";');
    await f.api.runLargeSummary({ operation: 'compact' });
    await f.api.evaluate('recoverLatestSummary("undo")');
    const entry = bookEntry(f);
    assert.equal(entry.content, original);
    assert.equal(entry.extensions.auto_large_summary.records.length, 2);
    assert.equal(entry.extensions.auto_large_summary.records[1].content, '新合并正文');
    assert.equal(entry.extensions.auto_large_summary.records[1].undone, true);
    assert.deepEqual(f.context.chat, flags);
    assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false);
    assert.equal(f.api.evaluate('canSummarize(getContext(), false)'), true);
});

test('undo of the first summary can be followed by restoring its original messages', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    await f.api.evaluate('recoverLatestSummary("undo")');
    assert.equal(bookEntry(f).content, '');
    assert.equal(bookEntry(f).disable, true);
    await f.api.evaluate('recoverLatestSummary("restore")');
    assert.ok(f.context.chat.every(message => !message.is_system));
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.messagesRestored, true);
});

test('undo will not overwrite a manually edited world book entry', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    const data = structuredClone(f.writes.at(-1).data);
    data.entries[0].content = '用户在世界书中修正了总结';
    await f.context.saveWorldInfo('喵喵大总结世界书', data);
    const writes = f.writes.length;
    await f.api.evaluate('recoverLatestSummary("undo")');
    assert.equal(f.writes.length, writes);
    assert.equal(bookEntry(f).content, '用户在世界书中修正了总结');
});

test('edits to the retained recent messages during generation also discard the stale summary', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate(`requestMainApiSummary = async () => {
        __fixtures.context.chat.at(-1).mes = '最近原文发生变化';
        return '已经过时的总结';
    };`);
    await f.api.runLargeSummary();
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
});

test('explicit cancellation discards the result and clears task controls without disabling the plugin', async () => {
    const f = await fixture();
    f.prepareSummary();
    f.api.evaluate('requestMainApiSummary = async () => { cancelCurrentTask(); return "取消后的结果"; };');
    await f.api.runLargeSummary();
    assert.equal(f.writes.length, 0);
    assert.equal(f.executed.length, 0);
    assert.equal(f.api.state().settings.enabled, true);
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.controls.get('.als-cancel').hidden, true);
});

test('disabled mode permits an explicit read-only book request without creating or activating anything', async () => {
    const f = await fixture({ enabled: false });
    const data = { entries: { 0: ownedSummaryEntry(0, 'archive-a') } };
    await f.context.saveWorldInfo('喵喵大总结世界书', data);
    f.writes.length = 0;
    const read = await f.api.evaluate('prepareWorldBook(getContext(), settings.worldBookName, { readOnly: true })');
    assert.equal(read.entries[0].content, data.entries[0].content);
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.context.chatMetadata, {});
});

test('text-completion source-only generation excludes the current chat', async () => {
    const f = await fixture();
    f.prepareSummary({ nativeRequest: true });
    f.context.mainApi = 'kobold';
    f.context.generate = async () => {
        f.api.onGenerationAfterCommands('quiet', {}, false);
        f.interceptor([], 100000, () => assert.fail('unexpected abort'), 'quiet');
        const payload = { prompt: '当前聊天与预设', max_length: 4096 };
        f.api.onFinalPromptData(payload, false);
        assert.equal(payload.prompt, '仅整理：旧总结正文');
        assert.equal(payload.max_length, 4096);
        return '已合并';
    };
    assert.equal(await f.api.evaluate('requestMainApiSummary(getContext(), "仅整理：旧总结正文", { sourceOnly: true })'), '已合并');
});

test('renaming updates the existing directory entry without copying its history', async () => {
    const f = await fixture();
    f.context.chatMetadata.integrity = 'stable';
    f.api.evaluate('__fixtures.realActivation = setArchiveActivation;');
    f.prepareSummary();
    await f.api.runLargeSummary();
    const before = structuredClone(bookEntry(f));
    f.context.chatId = 'renamed-chat';
    await f.api.evaluate('ensureArchive()');
    f.api.evaluate('activateWorldBook = async () => {}; updateWorldBookStatus = async () => {};');
    await f.api.evaluate('__fixtures.realActivation(getContext().chatMetadata.auto_large_summary.archiveId, { reconcileCursor: true })');
    const after = bookEntry(f);
    assert.equal(after.extensions.auto_large_summary.chatName, 'renamed-chat');
    assert.ok(after.comment.includes('renamed-chat'));
    assert.deepEqual(after.extensions.auto_large_summary.records, before.extensions.auto_large_summary.records);
    assert.equal(Object.keys(f.writes.at(-1).data.entries).length, 1);
});

test('branch initialization retries a failed metadata save without duplicating the persisted child', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    f.context.chatId = 'branch-retry';
    const info = await f.api.evaluate('ensureArchive()');
    f.context.saveMetadata = async () => { throw new Error('metadata failure'); };
    await assert.rejects(f.api.evaluate('(async () => initializeBranchArchive(getContext(), await ensureArchive(), __fixtures.book()))()'), /metadata failure/);
    assert.equal(info.archive.branch.pending, true);
    assert.equal(Object.keys(f.writes.at(-1).data.entries).length, 2);
    const writes = f.writes.length;
    f.context.saveMetadata = async () => {};
    await f.api.evaluate('(async () => initializeBranchArchive(getContext(), await ensureArchive(), __fixtures.book()))()');
    assert.equal(info.archive.branch.pending, false);
    assert.equal(info.archive.sourceEnd, 29);
    assert.equal(f.writes.length, writes);
});

test('hide retry reconciles metadata lost after the summary was saved', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.evaluate('ensureArchive()');
    f.context.saveMetadata = async () => { throw new Error('metadata failure'); };
    await f.api.runLargeSummary();
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.phase, 'saved');
    Object.assign(f.context.chatMetadata.auto_large_summary, { round: 0, sourceEnd: null, lastSummarizedThrough: -1 });
    f.context.saveMetadata = async () => {};
    await f.api.evaluate('recoverLatestSummary("retry")');
    assert.equal(f.context.chatMetadata.auto_large_summary.round, 1);
    assert.equal(f.context.chatMetadata.auto_large_summary.sourceEnd, 29);
    assert.equal(f.context.chatMetadata.auto_large_summary.lastSummarizedThrough, 9);
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.phase, 'complete');
});

test('reloading after undo keeps the empty entry inactive and its message recovery available', async () => {
    const f = await fixture();
    f.prepareSummary();
    await f.api.runLargeSummary();
    await f.api.evaluate('recoverLatestSummary("undo")');
    const g = await fixture();
    g.context.chat = structuredClone(f.context.chat);
    g.context.chatMetadata = structuredClone(f.context.chatMetadata);
    delete g.context.chatMetadata.auto_large_summary.undoAtLength;
    await g.context.saveWorldInfo('喵喵大总结世界书', structuredClone(f.writes.at(-1).data));
    g.api.evaluate('ensureWorldBook = async () => __fixtures.book(); activateWorldBook = async () => {}; updateWorldBookStatus = async () => {};');
    await g.api.evaluate('setArchiveActivation(getContext().chatMetadata.auto_large_summary.archiveId, { reconcileCursor: true })');
    assert.equal(bookEntry(g).disable, true);
    assert.equal(g.api.evaluate('currentSummaryEntry.extensions.auto_large_summary.lastOperation.phase'), 'undone');
    assert.equal(g.controls.get('.als-restore').disabled, false);
    assert.equal(g.context.chatMetadata.auto_large_summary.undoAtLength, 30);
    g.prepareSummary();
    await g.api.evaluate('recoverLatestSummary("restore")');
    assert.ok(g.context.chat.every(message => !message.is_system));
});

test('retrying a partially hidden operation after restoration allows the newly hidden messages to be restored again', async () => {
    const f = await fixture();
    f.prepareSummary();
    const execute = f.context.executeSlashCommandsWithOptions.bind(f.context);
    f.context.executeSlashCommandsWithOptions = async () => {
        await execute('/hide 0-4');
        throw new Error('partially hidden');
    };
    await f.api.runLargeSummary();
    f.context.executeSlashCommandsWithOptions = execute;
    await f.api.evaluate('recoverLatestSummary("restore")');
    assert.ok(f.context.chat.every(message => !message.is_system));
    await f.api.evaluate('recoverLatestSummary("retry")');
    assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.messagesRestored, undefined);
    assert.equal(f.context.chat.filter(message => message.is_system).length, 10);
    await f.api.evaluate('recoverLatestSummary("restore")');
    assert.ok(f.context.chat.every(message => !message.is_system));
});

for (const apiMode of ['main', 'secondary']) {
    test(`${apiMode} truncated response never replaces memory or hides messages and remains available for copying`, async () => {
        const f = await fixture({ apiMode, secondaryUrl: 'https://secondary.test/v1', secondaryModel: 'chosen' });
        f.prepareSummary({ nativeRequest: true });
        const originalFetch = f.sandbox.fetch;
        f.sandbox.fetch = async (url, init) => url.includes('/generate')
            ? new Response(JSON.stringify({ choices: [{ message: { content: '未完成的总结正文' }, finish_reason: 'length' }] }))
            : originalFetch(url, init);
        const observerFetch = f.sandbox.fetch;
        f.context.generate = async () => {
            const payload = { type: 'quiet', messages: [{ role: 'user', content: '剧情' }] };
            f.api.onMainApiRequest(payload);
            const response = await f.sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify(payload) });
            return (await response.json()).choices[0].message.content;
        };
        await f.api.runLargeSummary();
        assert.equal(f.writes.length, 0);
        assert.equal(f.executed.length, 0);
        assert.ok(f.context.chat.every(message => !message.is_system));
        assert.equal(f.api.evaluate('incompleteResults.get(getContext().chatMetadata.auto_large_summary.archiveId).content'), '未完成的总结正文');
        assert.match(f.notices.find(n => n.kind === 'error').args[0], /长度上限/);
        assert.equal(f.sandbox.fetch, observerFetch);
        assert.equal(f.api.state().sendLockDepth, 0);
    });
}

test('provider stop metadata distinguishes incomplete, filtered and completed output', async () => {
    const f = await fixture();
    for (const response of [
        { stop_reason: 'max_tokens' }, { candidates: [{ finishReason: 'MAX_TOKENS' }] },
        { choices: [{ finish_reason: 'content_filter' }] }, { status: 'incomplete' },
        { choices: [{ message: { refusal: 'refused' } }] }, { promptFeedback: { blockReason: 'SAFETY' } },
    ]) {
        f.sandbox.__fixtures.response = response;
        assert.ok(f.api.evaluate('completionFailure(__fixtures.response)'));
    }
    assert.equal(f.api.evaluate('completionFailure({choices:[{finish_reason:"stop"}]})'), null);
    assert.equal(f.api.evaluate('completionFailure({text:"legacy provider"})'), null);
});

for (const failure of ['budget', 'other-book', 'regex', 'final-prompt', 'unsupported']) {
    test(`injection ${failure} failure keeps original messages visible and permits a verified hide retry`, async () => {
        const f = await fixture();
        f.api.evaluate('__fixtures.verifyInjection = verifySummaryInjection;');
        f.prepareSummary();
        f.api.evaluate('verifySummaryInjection = __fixtures.verifyInjection;');
        let healthy = false;
        f.context.generate = async (_type, _options, dryRun) => {
            assert.equal(dryRun, true);
            const entry = structuredClone(bookEntry(f));
            const candidate = { ...entry, world: !healthy && failure === 'other-book' ? '其他书' : f.api.state().settings.worldBookName };
            const entries = new Map(!healthy && failure === 'budget' ? [] : [['entry', candidate]]);
            await f.context.eventSource.emit(f.context.eventTypes.WORLDINFO_SCAN_DONE, { activated: { entries } });
            f.api.onFinalPromptData({ prompt: !healthy && failure === 'final-prompt' ? '没有总结的提示词' : `预设\n${entry.content}\n聊天` }, true);
        };
        f.context.stripSummaryForTest = failure === 'regex';
        if (failure === 'unsupported') delete f.context.eventTypes.WORLDINFO_SCAN_DONE;
        await f.api.runLargeSummary();
        assert.equal(f.executed.length, 0);
        assert.ok(f.context.chat.every(message => !message.is_system));
        assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.phase, 'saved');
        assert.equal(f.api.state().sendLockDepth, 0);
        assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false);
        healthy = true;
        f.context.stripSummaryForTest = false;
        f.context.eventTypes.WORLDINFO_SCAN_DONE = 'worldinfo-scan-done';
        f.api.evaluate('requestMainApiSummary = async () => { throw new Error("retry must not generate"); };');
        await f.api.evaluate('recoverLatestSummary("retry")');
        assert.deepEqual(f.executed, ['/hide 0-9']);
        assert.equal(bookEntry(f).extensions.auto_large_summary.lastOperation.phase, 'complete');
        assert.equal(f.handlers.get('worldinfo-scan-done')?.size ?? 0, 0);
    });
}

test('successful injection confirmation precedes native hiding without mutating chat for the preview', async () => {
    const f = await fixture();
    f.api.evaluate('__fixtures.verifyInjection = verifySummaryInjection;');
    f.prepareSummary();
    f.api.evaluate('verifySummaryInjection = __fixtures.verifyInjection;');
    let previews = 0;
    f.context.generate = async (_type, _options, dryRun) => {
        assert.equal(dryRun, true);
        assert.ok(f.context.chat.every(message => !message.is_system));
        assert.equal(f.executed.length, 0);
        const entry = { ...bookEntry(f), world: f.api.state().settings.worldBookName };
        await f.context.eventSource.emit('worldinfo-scan-done', { activated: { entries: new Map([['entry', entry]]) } });
        f.api.onFinalPromptData({ prompt: entry.content }, true);
        previews++;
    };
    assert.equal(await f.api.runLargeSummary(), true);
    assert.equal(previews, 1);
    assert.deepEqual(f.executed, ['/hide 0-9']);
});

test('failed settings persistence restores activation in the original book and preserves unrelated content', async () => {
    const f = await fixture();
    const original = { entries: { 0: ownedSummaryEntry(0, 'archive-a'), 1: { uid: 1, content: '手写条目', disable: false } } };
    await f.context.saveWorldInfo('喵喵大总结世界书', original);
    await f.api.evaluate('ensureArchive()');
    f.api.evaluate('activateWorldBook = async () => {}; updateWorldBookStatus = async () => {}; settingsDraft.worldBookName = "replacement-book";');
    f.context.suppressSaveConfirmation = true;
    await f.api.saveSettingsDraft();
    assert.equal(f.api.state().settings.worldBookName, '喵喵大总结世界书');
    assert.equal(f.api.evaluate('settingsDraft.worldBookName'), 'replacement-book');
    const restored = f.writes.at(-1).data;
    assert.equal(restored.entries[0].disable, false);
    assert.equal(restored.entries[0].constant, true);
    assert.equal(restored.entries[0].content, original.entries[0].content);
    assert.deepEqual(restored.entries[1], original.entries[1]);
    assert.equal(f.api.state().sendLockDepth, 0);
});

test('cancelling a stalled save verification aborts its fetch, unlocks sending, and waits for reconciliation before automatic retries', { timeout: 1500 }, async () => {
    const f = await fixture();
    f.prepareSummary();
    let entered;
    const reachedRead = new Promise(resolve => { entered = resolve; });
    const normalFetch = f.sandbox.fetch;
    f.sandbox.fetch = async (_url, init) => {
        assert.ok(init.signal);
        entered();
        return await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    };
    const running = f.api.runLargeSummary();
    await reachedRead;
    f.api.evaluate('cancelCurrentTask()');
    await running;
    assert.equal(f.api.state().sendLockDepth, 0);
    assert.equal(f.api.state().runInProgress, false);
    assert.equal(f.executed.length, 0);
    assert.ok(f.writes.length > 0, 'a completed write is preserved');
    assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false);
    f.sandbox.fetch = normalFetch;
    const saved = bookEntry(f);
    f.sandbox.__fixtures.saved = saved;
    await f.api.evaluate('reconcileArchiveMetadata(getContext().chatMetadata.auto_large_summary, __fixtures.saved); currentSummaryEntry = __fixtures.saved;');
    assert.equal(f.context.chatMetadata.auto_large_summary.pendingSummarySave, undefined);
    assert.equal(f.api.evaluate('canSummarize(getContext(), true)'), false, 'saved-but-unhidden operation still blocks automatic retries');
});

test('read timeout covers response-body consumption as well as response headers', { timeout: 1000 }, async () => {
    const f = await fixture();
    f.sandbox.fetch = async (_url, init) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }) });
    await assert.rejects(f.api.evaluate('fetchJson("/read-test", {}, { timeoutMs: 15 })'), error => error.name === 'TimeoutError');
});

test('one summary reuses its initial book while retaining fresh conflict reads and both save confirmations', async () => {
    const f = await fixture();
    let reads = 0;
    let lists = 0;
    const fetch = f.sandbox.fetch;
    f.sandbox.fetch = async (url, init) => { if (url === '/api/worldinfo/get') reads++; return await fetch(url, init); };
    f.context.getWorldInfoNames = () => [f.api.state().settings.worldBookName];
    f.context.updateWorldInfoList = async () => { lists++; };
    f.api.evaluate('requestMainApiSummary = async () => "总结"; waitForCurrentGeneration = async () => true; activateWorldBook = async () => {}; updateWorldBookStatus = async () => {}; renderDirectory = async () => {}; verifySummaryInjection = async () => {};');
    assert.equal(await f.api.runLargeSummary(), true);
    assert.equal(reads, 5);
    assert.equal(lists, 2);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.executed, ['/hide 0-9']);
});
