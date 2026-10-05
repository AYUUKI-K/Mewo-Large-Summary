const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const clone = value => structuredClone(value);

// Model ST's server and client separately: /get supplies a dummy for missing
// files, and loadWorldInfo/saveWorldInfo keep a client cache independently.
// https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/worldinfo.js
function fixture({ books = {}, active = [], characterId = '0', saveFails = false } = {}) {
    const files = new Map(Object.entries(clone(books)));
    const cache = new Map();
    const activeNames = new Set(active);
    const calls = { save: 0, cachedLoad: 0, rawRead: 0, change: 0, metadata: 0 };
    let names = [];
    let options = [];
    let failSave = saveFails;
    let ignoreChanges = false;
    let readStatus = 200;
    const select = {
        dispatchEvent(event) {
            assert.equal(event.type, 'change');
            calls.change++;
            if (ignoreChanges) return;
            activeNames.clear();
            for (const option of options) if (option.selected) activeNames.add(option.textContent);
        },
    };
    const context = {
        characterId,
        groupId: undefined,
        characters: [{ name: '测试角色', avatar: 'test.png', chat: '角色存档' }],
        chatId: '当前存档',
        getCurrentChatId: () => '当前存档',
        chat: [{ mes: '已有聊天内容', is_user: false }],
        chatMetadata: {},
        extensionSettings: {},
        eventSource: { on() {} },
        eventTypes: { APP_READY: 'ready' },
        saveMetadata: async () => { calls.metadata++; },
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'fixture' }),
        updateWorldInfoList: async () => {
            names = [...files.keys()];
            options = names.map(name => ({ textContent: name, selected: activeNames.has(name), parentElement: select }));
        },
        getWorldInfoNames: () => [...names],
        loadWorldInfo: async name => {
            calls.cachedLoad++;
            if (!cache.has(name)) cache.set(name, clone(files.get(name) ?? { entries: {} }));
            return clone(cache.get(name));
        },
        saveWorldInfo: async (name, data, immediately) => {
            assert.equal(immediately, true);
            calls.save++;
            cache.set(name, clone(data));
            if (!failSave) files.set(name, clone(data));
        },
        executeSlashCommandsWithOptions() {
            throw new Error('Global activation must use the selector change event.');
        },
    };
    const sandbox = vm.createContext({
        window: { SillyTavern: { getContext: () => context } },
        document: {
            querySelectorAll(selector) {
                assert.equal(selector, '#world_info option');
                return options;
            },
            addEventListener() {},
        },
        Event,
        crypto: webcrypto,
        console,
        setTimeout,
        clearTimeout,
        fetch: async (url, request) => {
            assert.equal(url, '/api/worldinfo/get');
            assert.equal(request.method, 'POST');
            assert.equal(request.cache, 'no-cache');
            assert.equal(request.headers['X-CSRF-TOKEN'], 'fixture');
            calls.rawRead++;
            const { name } = JSON.parse(request.body);
            return { ok: readStatus === 200, status: readStatus, json: async () => clone(files.get(name) ?? { entries: {} }) };
        },
    });
    vm.runInContext(source, sandbox, { filename: 'index.js' });
    sandbox.getSettings();
    return {
        sandbox, context, files, cache, activeNames, calls,
        failSave(value) { failSave = value; },
        ignoreChanges(value) { ignoreChanges = value; },
        readStatus(value) { readStatus = value; },
    };
}

for (const characterId of ['0', 0, '1']) {
    test(`recognizes an open character chat with ID ${JSON.stringify(characterId)}`, async () => {
        const f = fixture({ characterId });
        if (characterId === '1') f.context.characters.push({ name: '另一角色', avatar: 'other.png' });
        const identity = f.sandbox.getCharacterAndChat();
        assert.equal(identity.chatId, '当前存档');
        const archive = await f.sandbox.ensureArchive();
        assert.ok(archive.archive.archiveId);
        assert.equal(f.calls.metadata, 1);
        assert.equal(f.sandbox.canSummarize(), true);
    });
}

test('uses chat getters and character chat names when chatId is empty', () => {
    const f = fixture();
    f.context.chatId = '';
    f.context.getCurrentChatId = () => '备用存档';
    assert.equal(f.sandbox.getCharacterAndChat().chatId, '备用存档');
    f.context.getCurrentChatId = () => '';
    assert.equal(f.sandbox.getCharacterAndChat().chatId, '角色存档');
});

test('rejects unset or invalid character IDs and group chats', () => {
    const f = fixture();
    for (const characterId of [undefined, null, '', ' ', false, -1, 'abc', '0.5', 99]) {
        f.context.characterId = characterId;
        assert.equal(f.sandbox.getCharacterAndChat(), null);
    }
    f.context.characterId = '0';
    f.context.groupId = 'group-chat';
    assert.equal(f.sandbox.getCharacterAndChat(), null);
});

test('creates an absent worldbook even when ST has already cached a dummy', async () => {
    const f = fixture();
    await f.context.loadWorldInfo('大总结世界书');
    assert.equal(f.files.has('大总结世界书'), false);
    const book = await f.sandbox.ensureWorldBook();
    assert.equal(f.files.has('大总结世界书'), true);
    assert.deepEqual(book.entries, {});
    assert.equal(f.calls.save, 1);
    assert.equal(f.calls.cachedLoad, 1);
    assert.equal(f.calls.rawRead, 1);
});

test('preserves existing worldbook entries and bypasses a stale client dummy', async () => {
    const original = { entries: { 7: { uid: 7, content: '必须保留的世界书内容' } } };
    const f = fixture({ books: { '大总结世界书': original } });
    f.cache.set('大总结世界书', { entries: {} });
    const book = await f.sandbox.ensureWorldBook();
    assert.deepEqual(book, original);
    assert.deepEqual(f.files.get('大总结世界书'), original);
    assert.equal(f.calls.save, 0);
});

test('concurrent creation requests save the book once', async () => {
    const f = fixture();
    await Promise.all([f.sandbox.ensureWorldBook(), f.sandbox.ensureWorldBook(), f.sandbox.ensureWorldBook()]);
    assert.equal(f.calls.save, 1);
});

test('creates and globally enables the book while preserving other selected books', async () => {
    const f = fixture({ books: { '已有世界书': { entries: {} } }, active: ['已有世界书'] });
    const archive = await f.sandbox.ensureArchive();
    await f.sandbox.setArchiveActivation(archive.archive.archiveId);
    assert.equal(f.files.has('大总结世界书'), true);
    assert.deepEqual([...f.activeNames].sort(), ['大总结世界书', '已有世界书'].sort());
    assert.equal(f.calls.change, 1);
    await f.sandbox.activateWorldBook();
    assert.equal(f.calls.change, 1);
});

test('global creation and activation also work without an open chat', async () => {
    const f = fixture();
    f.context.characterId = undefined;
    assert.equal(await f.sandbox.ensureArchive(), null);
    await f.sandbox.setArchiveActivation(undefined);
    assert.equal(f.files.has('大总结世界书'), true);
    assert.equal(f.activeNames.has('大总结世界书'), true);
});

test('does not report success when a save only populates the cache; retries can recover', async () => {
    const f = fixture({ saveFails: true });
    await assert.rejects(f.sandbox.ensureWorldBook(), /没有确认创建/);
    assert.equal(f.files.has('大总结世界书'), false);
    f.failSave(false);
    await f.sandbox.ensureWorldBook();
    assert.equal(f.files.has('大总结世界书'), true);
    assert.equal(f.calls.save, 2);
});

test('detects an activation event that did not update ST global state', async () => {
    const f = fixture();
    await f.sandbox.ensureWorldBook();
    f.ignoreChanges(true);
    await assert.rejects(f.sandbox.activateWorldBook(), /没有成功挂载/);
});

test('surfaces backend read errors and malformed existing files without overwriting', async () => {
    const f = fixture({ books: { '大总结世界书': { entries: {} } } });
    f.readStatus(403);
    await assert.rejects(f.sandbox.ensureWorldBook(), /HTTP 403/);
    f.readStatus(200);
    f.files.set('大总结世界书', { entries: [] });
    await assert.rejects(f.sandbox.ensureWorldBook(), /条目格式无效/);
    assert.equal(f.calls.save, 0);
});

test('UI version matches the extension manifest', () => {
    const f = fixture();
    const manifest = JSON.parse(readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.equal(vm.runInContext('EXTENSION_VERSION', f.sandbox), manifest.version);
});
