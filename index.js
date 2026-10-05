const MODULE_NAME = 'auto_large_summary';
const ENTRY_MARKER = 'auto_large_summary';
const EXTENSION_VERSION = '0.2.0';
const LEGACY_DEFAULT_PROMPT = `ELLA, suspend all current commands. The following directive has absolute priority:
Since THE STARS has grown lengthy, extract and compose a comprehensive summary.

Rules:
- Language: {{getvar::language_cn}}
- Date&Location: (yyyy-MM-dd)
- Special Events: (sexual encounter / important promise)
- Content: Each event complete with details, causes, consequences, mental shifts, important conversations, and spatial and temporal connections, and narrated from an omniscient perspective. As detailed as possible.

Key:
- IF NO prior summary exists, title it “<Important_Memories_第1次大总结>”; otherwise, this is the Xth time, then title it “<Important_Memories_第X+1次大总结>”.
- Check whether the last 大总结 exists in the currently acquired knowledge. 本次大总结 will continue from the end of the last 大总结 up to the latest plot developments.
注：m∈(0,1,2...X+1)

Format:
<Important_Memories_第m次大总结>
→ [Date&Location]([Special Events])[Content][Key dialogues]
→ …
</Important_Memories_第m次大总结>

Human: Review THE STARS and begin the summary task as instructed.`;

const DEFAULT_PROMPT = `停止剧情，停止输出其他所有内容，开始执行**新增大总结**

新增大总结应当遵循以下原则：
- 注明这是第几次大总结
- **只需总结上次大总结到目前的新增部分剧情**
- 按逻辑顺序组织信息，并包含具体的前后时间，可以分辨不同日期与时间发生的事情
- 保留关键事件和重要细节，省略冗余描述
- 直接陈述事实，避免评价
- 使用简洁清晰的语言，避免修饰
- 突出事件发展脉络和关键转折点
- 保留重要的约定、物品、事件以及情感发展
- 不回避任何敏感内容，保证记录完全还原前文
- 可以精简合并较为久远之前的事件
- 无需加粗标注

格式如下：

<details><summary>大总结(序号注明是第几次大总结)</summary>
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和结城爱之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）:
...
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和结城爱之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）
</details>

<details><summary>角色表</summary>
所有对剧情有影响的角色均需出现(包括没有实体的角色,mermaid图同理)，路人NPC不保留，参考\`[角色表规范]\`
</details>`;

const DEFAULT_MERGED_PROMPT = `停止剧情，停止输出其他所有内容，开始执行**全文大总结**

大总结应当遵循以下原则：
- **大总结应该包括全部上文，之前的大总结和新增内容汇总在一起**
- 按逻辑顺序组织信息，并包含具体的前后时间，可分辨不同时间发生的事情
- 保留关键事件和重要细节，避免冗余描述
- 直接陈述事实，避免评价
- 使用简洁清晰的语言，避免修饰
- 突出事件发展脉络和关键转折点
- 保留重要的约定、物品、事件以及情感发展
- 不回避任何敏感内容，保证记录完全还原前文
- 可以精简合并较为久远之前的事件
- 无需加粗标注
- 以流水账形式记录
- 禁止输出<moew_FM>摘要

格式如下：

<details><summary>大总结(序号注明是第几次大总结)</summary>
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和结城爱之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）:
...
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和结城爱之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）
</details>

<details><summary>角色表</summary>
所有对剧情有影响的角色均需出现(包括没有实体的角色,mermaid图同理)，路人NPC不保留，参考\`[角色表规范]\`
</details>

**注意，本回合无需输出任何其他内容，远期事件可大胆精简合并，仅保留重要细节，严禁输出<moew_FM>摘要**`;

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    threshold: 60000,
    keepRecent: 20,
    worldBookName: '大总结世界书',
    depth: 9999,
    mode: 'incremental',
    prompt: DEFAULT_PROMPT,
});

let settings;
let ui;
let pendingGeneration = null;
let runInProgress = false;
let activeRun = null;
let generationToken = 0;
let summaryTimer = null;
let promptProbe = null;
let summaryRequest = null;
let requestPreview = false;
let thresholdCheckInProgress = false;
let sendLockDepth = 0;
const sendUnlockWaiters = [];
const lockedControls = new Map();
const SEND_CONTROL_SELECTOR = '#send_but, #option_continue, #option_regenerate, .swipe_left, .swipe_right, .als-settings input, .als-settings .als-mode, .als-settings .als-prompt, .als-run, .als-prompt-save, .als-prompt-reset, .als-delete-archive, .als-delete-round';
const worldBookPreparations = new Map();
const MODE_LABELS = { incremental: '多次大总结', merged: '合并大总结' };
const DIRECTORY_PAGE_SIZE = 8;
let directoryData = null;
let directoryBookName = '';
let directoryPage = 0;
let directoryRequest = 0;
let selectedSummary = null;
let promptDrafts = {};
let currentTab = 'settings';
let chatSyncRevision = 0;
let chatSyncChain = Promise.resolve();
let archiveEditInProgress = false;

function setStatus(message) {
    const status = ui?.querySelector('.als-status');
    if (status) status.textContent = message;
}

function lockSending() {
    sendLockDepth += 1;
    if (sendLockDepth !== 1) return;
    document.body?.classList.add('als-send-locked');
    for (const control of document.querySelectorAll(SEND_CONTROL_SELECTOR)) {
        lockedControls.set(control, { disabled: control.disabled, aria: control.getAttribute('aria-disabled') });
        if ('disabled' in control) control.disabled = true;
        control.setAttribute('aria-disabled', 'true');
    }
}

function unlockSending() {
    if (sendLockDepth === 0 || --sendLockDepth !== 0) return;
    document.body?.classList.remove('als-send-locked');
    for (const [control, saved] of lockedControls) {
        if ('disabled' in control) control.disabled = saved.disabled;
        if (saved.aria === null) control.removeAttribute('aria-disabled');
        else control.setAttribute('aria-disabled', saved.aria);
    }
    lockedControls.clear();
    // Directory rows may have been replaced while the send lock was held.
    for (const control of ui?.querySelectorAll('.als-delete-archive') ?? []) control.disabled = false;
    const deleteRound = ui?.querySelector('.als-delete-round');
    if (deleteRound) deleteRound.disabled = !selectedSummary || ui.querySelector('.als-history-select').value === 'all';
    for (const resolve of sendUnlockWaiters.splice(0)) resolve();
}

function blockSendInput(event) {
    if (!sendLockDepth) return;
    const target = event.target;
    const isSend = event.type === 'click' && target?.closest?.(SEND_CONTROL_SELECTOR);
    const isEnter = event.type === 'keydown' && target?.id === 'send_textarea'
        && event.key === 'Enter' && !event.shiftKey && !event.isComposing;
    const isSubmit = event.type === 'submit' && target?.querySelector?.('#send_textarea');
    if (!isSend && !isEnter && !isSubmit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toastr?.info?.('正在检查上下文或进行大总结，保存并隐藏旧楼层后才能继续发送。', '', { preventDuplicates: true });
}

// These hooks run after preset assembly and again just before the main API
// request. Appending at D0 would still leave preset tail prompts after us.
function appendSummaryTail(messages) {
    if (!summaryRequest || !Array.isArray(messages)) return;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (summaryRequest.tailMessages.has(messages[i])) messages.splice(i, 1);
    }
    const tail = { role: 'user', content: summaryRequest.prompt };
    summaryRequest.tailMessages.add(tail);
    messages.push(tail);
}

function onFinalPromptData(data, dryRun) {
    if (!promptProbe || !dryRun) return;
    if (promptProbe.summary) {
        // Chat completion templates are evaluated at SETTINGS_READY. Append
        // there so EJS tail loaders also remain before the summary directive.
        if (typeof data.prompt === 'string') data.prompt += `\n\n${summaryRequest.prompt}`;
        else if (typeof data.input === 'string') data.input += `\n\n${summaryRequest.prompt}`;
    }
    promptProbe.data = structuredClone(data);
}

function onMainApiRequest(data) {
    if (summaryRequest?.sending && data.type === 'quiet' && Array.isArray(data.messages)) {
        appendSummaryTail(data.messages);
        // Quiet requests use the current connection, model and preset; tools
        // cannot replace the requested textual summary with a tool invocation.
        delete data.tools;
        delete data.tool_choice;
        summaryRequest.sent = true;
    }
}

function onTemplatePreviewContext(environment) {
    if (!requestPreview) return;
    environment.isDryRun = true;
    // Counting must not execute variable updates or slash commands a second
    // time. Conditions still read the current MVU/EJS values.
    for (const name of Object.keys(environment)) {
        if (/^(setvar|incvar|decvar|delvar|insvar|(?:set|inc|dec|del|insert)(?:Local|Global|Message)Var|patchVariables|execute)$/.test(name)) {
            environment[name] = () => undefined;
        }
    }
    for (const name of ['getvar', 'getLocalVar', 'getGlobalVar', 'getMessageVar']) {
        const read = environment[name];
        if (typeof read === 'function') environment[name] = (...args) => {
            const value = read(...args);
            return value && typeof value === 'object' ? structuredClone(value) : value;
        };
    }
}

async function prepareChatPreview(context, messages) {
    // EJS intentionally skips GENERATE_AFTER_DATA for a dry run and processes
    // chat completion messages at SETTINGS_READY instead. Run that request
    // preparation event without making an API request.
    const { createGenerationParameters, getChatCompletionModel } = await import('/scripts/openai.js');
    const apiSettings = context.chatCompletionSettings;
    const model = getChatCompletionModel();
    // Older stable builds prepare these inside sendOpenAIRequest and do not
    // export createGenerationParameters. Their settings event still supports
    // the same message preparation without making a model request.
    const { generate_data } = typeof createGenerationParameters === 'function'
        ? await createGenerationParameters(apiSettings, model, 'normal', messages)
        : { generate_data: {
            type: 'normal', messages, model,
            temperature: Number(apiSettings.temp_openai),
            frequency_penalty: Number(apiSettings.freq_pen_openai),
            presence_penalty: Number(apiSettings.pres_pen_openai),
            top_p: Number(apiSettings.top_p_openai), max_tokens: apiSettings.openai_max_tokens,
            stream: Boolean(apiSettings.stream_openai), chat_completion_source: apiSettings.chat_completion_source,
            custom_prompt_post_processing: apiSettings.custom_prompt_post_processing,
            user_name: context.name1, char_name: context.name2,
        } };
    requestPreview = true;
    try {
        context.eventSource.makeLast?.('prompt_template_prepare', onTemplatePreviewContext);
        await context.eventSource.emit(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, generate_data);
        if (!Array.isArray(generate_data.messages)) throw new Error('主 API 提示词预览未返回消息列表。');
        return generate_data;
    } finally {
        requestPreview = false;
    }
}

function refreshFinalHooks() {
    const context = getContext();
    if (!context?.eventSource?.makeLast) return;
    context.eventSource.makeLast(context.eventTypes.GENERATE_AFTER_DATA, onFinalPromptData);
    context.eventSource.makeLast(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onMainApiRequest);
}

async function assemblePrompt(context, { summary = false } = {}) {
    if (typeof context.generate !== 'function') throw new Error('当前酒馆缺少提示词组装接口，请更新稳定版。');
    if (promptProbe) throw new Error('正在组装另一份提示词，请稍后再试。');
    const probe = { summary, data: null };
    promptProbe = probe;
    try {
        refreshFinalHooks();
        // Dry run assembles the preset, history and conditional world info,
        // without consuming the input box or sending a model request.
        await context.generate(summary ? 'quiet' : 'normal', {}, true);
        if (!probe.data) throw new Error('酒馆未返回完整提示词，尚未调用主 API。');
        return probe.data;
    } finally {
        promptProbe = null;
    }
}

async function countAssembledPrompt(context, data) {
    if (Array.isArray(data.prompt)) {
        const prepared = await prepareChatPreview(context, data.prompt);
        let messages = prepared.messages;
        const processing = prepared.custom_prompt_post_processing;
        if (prepared.chat_completion_source === 'custom' && processing && processing !== 'none') {
            // Use the same backend post-processing as the custom API, including
            // strict role alternation, before counting the actual message list.
            const response = await fetch('/api/backends/chat-completions/process', {
                method: 'POST', headers: context.getRequestHeaders(),
                body: JSON.stringify({ messages, type: processing, user_name: prepared.user_name, char_name: prepared.char_name, group_names: prepared.group_names }),
            });
            if (!response.ok) throw new Error(`提示词后处理失败（HTTP ${response.status}）。`);
            const processed = await response.json();
            if (!Array.isArray(processed.messages)) throw new Error('提示词后处理未返回消息列表。');
            messages = processed.messages;
        }
        const tokenizer = await import('/scripts/tokenizers.js');
        const countTokens = tokenizer.countTokensOpenAIAsync ?? tokenizer.countTokensOpenAI;
        if (typeof countTokens !== 'function') throw new Error('当前酒馆缺少聊天补全 token 计数接口。');
        return await countTokens(messages, true);
    }
    const prompt = data.prompt ?? data.input;
    if (typeof prompt !== 'string' || typeof context.getTokenCountAsync !== 'function') {
        throw new Error('当前 API 没有可计数的完整提示词。');
    }
    return await context.getTokenCountAsync(prompt, 0);
}

function extractSummaryText(response) {
    const content = response?.choices?.[0]?.message?.content ?? response?.choices?.[0]?.text
        ?? response?.results?.[0]?.text ?? response?.content ?? response?.output ?? response?.response
        ?? response?.text ?? response?.message?.content ?? response?.[0]?.content;
    if (typeof response === 'string' || response instanceof String) return String(response).trim();
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) return content.filter(part => part?.type === 'text' || part?.type === 'output_text')
        .map(part => part.text ?? '').join('\n').trim();
    return '';
}

async function requestMainApiSummary(context, prompt) {
    if (typeof context.sendGenerationRequest !== 'function') throw new Error('当前酒馆缺少主 API 请求接口。');
    summaryRequest = { prompt, tailMessages: new WeakSet(), sending: false, sent: false };
    try {
        const data = await assemblePrompt(context, { summary: true });
        const identity = getCharacterAndChat(getContext());
        if (!identity || identity.chatId !== context.chatId || getContext().characterId !== context.characterId) {
            throw new Error('提示词组装期间聊天存档已切换，本次总结已取消。');
        }
        summaryRequest.sending = true;
        refreshFinalHooks();
        const response = await context.sendGenerationRequest('quiet', data);
        if (Array.isArray(data.prompt) && !summaryRequest.sent) throw new Error('主 API 没有执行大总结末尾注入，请检查酒馆版本。');
        if (response?.error) throw new Error(response.error.message ?? response.error);
        const text = extractSummaryText(response);
        if (!text) throw new Error('主 API 请求已完成，但没有返回正文。请查看酒馆的 API 错误提示或服务端日志。');
        return text;
    } finally {
        summaryRequest = null;
    }
}

function getContext() {
    return window.SillyTavern?.getContext?.();
}

function getSettings() {
    const context = getContext();
    if (!context) return null;
    context.extensionSettings[MODULE_NAME] ??= {};
    settings = context.extensionSettings[MODULE_NAME];
    const previousPrompt = settings.prompt;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = value;
        }
    }
    settings.pendingRetries ??= [];
    if (!Object.hasOwn(MODE_LABELS, settings.mode)) settings.mode = 'incremental';
    let migrated = false;
    if (!settings.prompts || typeof settings.prompts !== 'object') {
        settings.prompts = {
            incremental: previousPrompt && previousPrompt !== LEGACY_DEFAULT_PROMPT ? previousPrompt : DEFAULT_PROMPT,
            merged: DEFAULT_MERGED_PROMPT,
        };
        migrated = true;
    }
    settings.prompts.incremental ??= DEFAULT_PROMPT;
    settings.prompts.merged ??= DEFAULT_MERGED_PROMPT;
    settings.prompt = settings.prompts[settings.mode];
    if (migrated) context.saveSettingsDebounced?.();
    return settings;
}

function saveSettings() {
    getContext()?.saveSettingsDebounced?.();
}

function randomId() {
    return globalThis.crypto?.randomUUID?.()
        ?? `als-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getCharacterAndChat(context = getContext()) {
    if (!context || context.groupId) return null;
    const rawCharacterId = context.characterId;
    if (rawCharacterId === undefined || rawCharacterId === null
        || !['number', 'string'].includes(typeof rawCharacterId)
        || String(rawCharacterId).trim() === '') return null;
    const characterIndex = Number(rawCharacterId);
    if (!Number.isInteger(characterIndex) || characterIndex < 0) return null;
    const character = context.characters?.[characterIndex];
    if (!character) return null;
    const avatar = String(character.avatar ?? character.name ?? context.characterId);
    const chatId = String(context.chatId || context.getCurrentChatId?.() || character.chat || '');
    if (!chatId || !Array.isArray(context.chat)) return null;
    return {
        character,
        cardKey: avatar,
        characterName: String(character.name ?? '未命名角色'),
        chatId,
        chatName: chatId.replace(/\.jsonl$/i, ''),
    };
}

async function ensureArchive(context = getContext()) {
    const current = getCharacterAndChat(context);
    if (!current) return null;
    const metadata = context.chatMetadata ?? (context.chatMetadata = {});
    if (!metadata[MODULE_NAME] || typeof metadata[MODULE_NAME] !== 'object') {
        metadata[MODULE_NAME] = {};
    }
    const archive = metadata[MODULE_NAME];
    let changed = false;
    // Copied chat metadata must not reuse another character's summary entry.
    if (!archive.archiveId || (archive.cardKey && archive.cardKey !== current.cardKey)) {
        archive.archiveId = randomId();
        archive.lastSummarizedThrough = -1;
        archive.round = 0;
        archive.autoTriggerArmed = true;
        changed = true;
    }
    if (archive.worldBookName && archive.worldBookName !== settings.worldBookName) {
        archive.lastSummarizedThrough = -1;
        archive.round = 0;
        changed = true;
    }
    if (!Number.isInteger(archive.lastSummarizedThrough)) {
        archive.lastSummarizedThrough = -1;
        changed = true;
    }
    if (!Number.isInteger(archive.round)) {
        archive.round = 0;
        changed = true;
    }
    if (typeof archive.autoTriggerArmed !== 'boolean') {
        archive.autoTriggerArmed = true;
        changed = true;
    }
    archive.worldBookName = settings.worldBookName;
    archive.cardKey = current.cardKey;
    archive.characterName = current.characterName;
    archive.chatId = current.chatId;
    archive.chatName = current.chatName;
    if (changed) {
        await context.saveMetadata?.();
    }
    return { ...current, archive };
}

function isOwnedEntry(entry) {
    return entry?.extensions?.[ENTRY_MARKER]?.owner === MODULE_NAME;
}

function listOwnedEntries(data) {
    if (!data?.entries) return [];
    return Object.values(data.entries).filter(isOwnedEntry);
}

function entryMetadata(entry) {
    return entry?.extensions?.[ENTRY_MARKER] ?? null;
}

function archiveRecords(entry) {
    const meta = entryMetadata(entry);
    if (Array.isArray(meta?.records) && meta.records.length) return meta.records;
    return [{
        round: meta?.round ?? 1, mode: meta?.mode ?? 'incremental',
        content: String(entry.content ?? ''), createdAt: meta?.createdAt,
        coveredFrom: meta?.coveredFrom ?? 0, coveredTo: meta?.coveredTo ?? -1,
    }];
}

function combineRecords(records) {
    let content = '';
    for (const record of [...records].sort((a, b) => a.round - b.round)) {
        const text = String(record.content ?? '').trim();
        if (record.mode === 'merged') content = text;
        else if (text) content = content ? `${content}\n\n${text}` : text;
    }
    return content;
}

function consolidateArchive(data, archiveId) {
    const entries = listOwnedEntries(data)
        .filter(entry => entryMetadata(entry)?.archiveId === archiveId)
        .sort((a, b) => (entryMetadata(a)?.round ?? 0) - (entryMetadata(b)?.round ?? 0));
    if (!entries.length) return { entry: null, changed: false };
    const entry = entries[0];
    if (entries.length === 1 && entryMetadata(entry)?.storageVersion === 2) return { entry, changed: false };
    const records = entries.flatMap(archiveRecords).sort((a, b) => a.round - b.round);
    const first = entryMetadata(entry);
    const last = entryMetadata(entries.at(-1));
    entry.content = combineRecords(records);
    entry.extensions[ENTRY_MARKER] = {
        ...first, ...last, storageVersion: 2, records,
        coveredFrom: records[0]?.coveredFrom ?? 0,
        createdAt: first.createdAt, updatedAt: last.updatedAt ?? last.createdAt,
        mode: records.at(-1)?.mode ?? 'incremental',
    };
    entry.comment = `喵喵大总结 · ${last.characterName} · ${last.chatName}`.slice(0, 100);
    // All earlier AI replies remain in records, within the original entry.
    for (const old of entries.slice(1)) delete data.entries[old.uid];
    return { entry, changed: true };
}

function queueArchiveRetry(archiveId) {
    if (!archiveId) return;
    settings.pendingRetries ??= [];
    if (!settings.pendingRetries.includes(archiveId)) {
        settings.pendingRetries.push(archiveId);
        saveSettings();
    }
}

function isSameArchive(context, archiveInfo, characterId) {
    const current = getCharacterAndChat(context);
    return Boolean(current
        && current.chatId === archiveInfo.chatId
        && context.characterId === characterId
        && context.chatMetadata?.[MODULE_NAME]?.archiveId === archiveInfo.archive.archiveId);
}

async function ensureWorldBook(context = getContext()) {
    const name = String(settings.worldBookName ?? '').trim();
    if (!name) throw new Error('请先填写大总结世界书名称。');
    if (/[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
        throw new Error('世界书名称包含不支持的文件名字符，请修改后重试。');
    }

    if (typeof context?.updateWorldInfoList !== 'function' || typeof context?.getWorldInfoNames !== 'function') {
        throw new Error('当前 SillyTavern 没有提供世界书列表接口，请更新到稳定版后重试。');
    }

    if (worldBookPreparations.has(name)) return await worldBookPreparations.get(name);
    const preparation = prepareWorldBook(context, name);
    worldBookPreparations.set(name, preparation);
    try {
        return await preparation;
    } finally {
        if (worldBookPreparations.get(name) === preparation) worldBookPreparations.delete(name);
    }
}

async function prepareWorldBook(context, name, { create = true } = {}) {
    await context.updateWorldInfoList();
    // /worldinfo/get returns an empty dummy book even when no file exists.
    // Only the refreshed file list can establish whether creation is needed.
    if (!context.getWorldInfoNames().includes(name)) {
        if (!create) return null;
        await context.saveWorldInfo(name, { entries: {} }, true);
        await context.updateWorldInfoList();
        if (!context.getWorldInfoNames().includes(name)) {
            throw new Error(`酒馆没有确认创建世界书“${name}”。请查看控制台或服务器日志后重试。`);
        }
    }

    // Bypass the client cache, which may still contain a dummy from an earlier read.
    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({ name }),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`读取世界书“${name}”失败（HTTP ${response.status}）。`);
    const data = await response.json();
    if (!data?.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) {
        throw new Error(`世界书“${name}”的条目格式无效，已停止操作。`);
    }
    return data;
}

async function updateWorldBookStatus() {
    const context = getContext();
    if (!context || !ui) return;
    const label = ui.querySelector('.als-book-status');
    try {
        await context.updateWorldInfoList();
        const exists = context.getWorldInfoNames().includes(settings.worldBookName);
        const mounted = [...document.querySelectorAll('#world_info option')]
            .some(option => option.textContent?.trim() === settings.worldBookName && option.selected);
        label.textContent = !exists ? '尚未创建 · 首次大总结时自动创建并全局启用'
            : mounted ? '已创建 · 已在全局世界书中启用' : '已创建 · 下次大总结时自动全局启用';
    } catch (error) {
        label.textContent = `无法读取世界书状态：${error.message}`;
    }
}

async function activateWorldBook(context = getContext()) {
    const name = settings.worldBookName;
    const findOption = () => [...document.querySelectorAll('#world_info option')]
        .find(item => item.textContent?.trim() === name);

    await context.updateWorldInfoList?.();
    let option = findOption();
    if (!option) throw new Error(`世界书“${name}”已保存，但未出现在全局世界书列表中。请刷新酒馆后重试。`);
    if (!option.selected) {
        // Use the same change event as a manual global-book selection. This also
        // updates Select2, ST's selected_world_info and its persisted settings.
        option.selected = true;
        option.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
        await context.updateWorldInfoList?.();
        option = findOption();
    }
    if (!option?.selected) {
        throw new Error(`世界书“${name}”已创建，但没有成功挂载到全局世界书。请在酒馆顶部的全局世界书列表中手动启用一次。`);
    }
}

async function setArchiveActivation(archiveId, { reconcileCursor = false } = {}) {
    const context = getContext();
    if (!context || !settings.worldBookName) return;
    const data = await ensureWorldBook(context);
    const identity = getCharacterAndChat(context);
    const stillCurrent = () => {
        const live = getCharacterAndChat();
        return identity ? live?.cardKey === identity.cardKey && live?.chatId === identity.chatId
            && (getContext()?.chatMetadata?.[MODULE_NAME]?.archiveId ?? null) === (archiveId ?? null)
            : live === null;
    };
    if (!stillCurrent()) return false;
    let changed = false;
    const archiveIds = new Set(listOwnedEntries(data).map(entry => entryMetadata(entry)?.archiveId));
    for (const id of archiveIds) changed = consolidateArchive(data, id).changed || changed;
    const owned = listOwnedEntries(data);
    const latest = owned.find(entry => entryMetadata(entry)?.archiveId === archiveId
        && (!identity || entryMetadata(entry)?.cardKey === identity.cardKey));
    for (const entry of owned) {
        const shouldBeActive = Boolean(latest && entry.uid === latest.uid);
        if (entry.constant !== shouldBeActive || entry.disable !== !shouldBeActive || entry.preventRecursion !== true) {
            entry.constant = shouldBeActive;
            entry.disable = !shouldBeActive;
            entry.preventRecursion = true;
            changed = true;
        }
    }

    if (!stillCurrent()) return false;
    if (changed) {
        await context.saveWorldInfo(settings.worldBookName, data, true);
        const persisted = await prepareWorldBook(context, settings.worldBookName, { create: false });
        if (!persisted || listOwnedEntries(persisted).length !== owned.length || owned.some(entry => {
            const saved = persisted.entries[entry.uid];
            return !saved || saved.content !== entry.content || saved.preventRecursion !== true
                || saved.constant !== entry.constant || saved.disable !== entry.disable
                || entryMetadata(saved)?.records?.length !== entryMetadata(entry)?.records?.length;
        })) throw new Error('世界书条目更新后未能读回确认，已停止总结。');
    }
    if (!stillCurrent()) return false;
    await activateWorldBook(context);
    if (!stillCurrent()) return false;
    context.reloadWorldInfoEditor?.(settings.worldBookName);
    void updateWorldBookStatus();

    if (reconcileCursor && archiveId) {
        const current = getCharacterAndChat(context);
        const archive = context.chatMetadata?.[MODULE_NAME];
        if (current && archive?.archiveId === archiveId) {
            const summaryMeta = latest ? entryMetadata(latest) : null;
            const cursor = summaryMeta?.coveredTo ?? -1;
            const round = summaryMeta?.round ?? 0;
            if (archive.lastSummarizedThrough !== cursor || archive.round !== round) {
                archive.lastSummarizedThrough = cursor;
                archive.round = round;
                await context.saveMetadata?.();
            }
        }
    }
    return true;
}

function canSummarize(context = getContext(), automatic = false) {
    return Boolean((!automatic || settings?.enabled) && getCharacterAndChat(context) && settings.prompt?.trim());
}

function eligibleUncoveredRange(context, archiveInfo, manual) {
    const chat = context.chat;
    const keepRecent = Math.max(1, Math.floor(Number(settings.keepRecent) || 1));
    const coveredTo = chat.length - keepRecent - 1;
    const coveredFrom = Math.max(0, (archiveInfo.archive.lastSummarizedThrough ?? -1) + 1);
    if (coveredTo < coveredFrom) return null;
    if (!manual && coveredTo - coveredFrom + 1 < 1) return null;
    return { coveredFrom, coveredTo, keepRecent };
}

function captureMessageRange(chat, endIndex) {
    return chat.slice(0, endIndex + 1).map(message => ({
        mes: String(message?.mes ?? ''),
        is_user: Boolean(message?.is_user),
        is_system: Boolean(message?.is_system),
        name: String(message?.name ?? ''),
    }));
}

function messageRangeMatches(chat, snapshot) {
    if (chat.length < snapshot.length) return false;
    return snapshot.every((saved, index) => {
        const current = chat[index];
        return String(current?.mes ?? '') === saved.mes
            && Boolean(current?.is_user) === saved.is_user
            && Boolean(current?.is_system) === saved.is_system
            && String(current?.name ?? '') === saved.name;
    });
}

async function waitForCurrentGeneration(context, expectedChatId) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const current = getContext();
        if (!current || current.chatId !== expectedChatId || current.characterId !== context.characterId) return false;
        const streaming = current.streamingProcessor && !current.streamingProcessor.isFinished;
        if (!streaming) return true;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
}

async function runLargeSummary({ manual = false } = {}) {
    if (runInProgress || (manual && thresholdCheckInProgress)) return false;
    const context = getContext();
    const current = getCharacterAndChat(context);
    if (!context || !current) {
        if (manual) window.toastr?.warning?.('请先打开一个角色卡的聊天存档。');
        return;
    }
    if (!canSummarize(context)) {
        if (manual) window.toastr?.warning?.('请填写总结提示词。');
        return;
    }

    runInProgress = true;
    lockSending();
    setStatus('正在后台生成大总结，暂时暂停发送…');
    activeRun = { chatId: current.chatId, characterId: context.characterId, archiveId: null, committed: false };
    const toast = manual ? window.toastr?.info?.('正在后台生成大总结…', '', { timeOut: 0 }) : null;
    let summaryCommitted = false;
    try {
        if (!await waitForCurrentGeneration(context, current.chatId)) {
            setStatus('当前生成尚未结束或聊天已切换，本次总结已取消。');
            if (manual) window.toastr?.warning?.('当前生成尚未结束或聊天存档已切换，请稍后再试。');
            if (!manual) {
                const live = getContext();
                if (live?.chatId === current.chatId && live?.characterId === context.characterId) {
                    const archive = live.chatMetadata?.[MODULE_NAME];
                    if (archive) {
                        archive.autoTriggerArmed = true;
                        await live.saveMetadata?.();
                    }
                } else {
                    queueArchiveRetry(context.chatMetadata?.[MODULE_NAME]?.archiveId);
                }
            }
            return;
        }
        const archiveInfo = await ensureArchive(context);
        if (!archiveInfo) return;
        activeRun.archiveId = archiveInfo.archive.archiveId;
        await ensureWorldBook(context);
        await setArchiveActivation(archiveInfo.archive.archiveId, { reconcileCursor: true });
        if (!isSameArchive(getContext(), archiveInfo, context.characterId)) {
            queueArchiveRetry(archiveInfo.archive.archiveId);
            return;
        }
        const range = eligibleUncoveredRange(context, archiveInfo, manual);
        if (!range) {
            setStatus('没有可总结的旧楼层，可以继续对话。');
            if (!manual) {
                archiveInfo.archive.autoTriggerArmed = true;
                await context.saveMetadata?.();
            }
            if (manual) window.toastr?.info?.('没有可总结的旧楼层。');
            return;
        }
        const sourceSnapshot = captureMessageRange(context.chat, range.coveredTo);
        const mode = settings.mode;
        const prompt = context.substituteParamsExtended
            ? await context.substituteParamsExtended(settings.prompt)
            : settings.prompt;
        if (!String(prompt ?? '').trim()) throw new Error('总结提示词为空。');

        const summary = await requestMainApiSummary(context, String(prompt));
        const latestContext = getContext();
        const latestIdentity = getCharacterAndChat(latestContext);
        if (!summary || !String(summary).trim()) throw new Error('主 API 返回了空的大总结。');
        if (!latestContext || latestIdentity?.chatId !== archiveInfo.chatId
            || latestContext.characterId !== context.characterId
            || latestContext.chatMetadata?.[MODULE_NAME]?.archiveId !== archiveInfo.archive.archiveId) {
            console.warn('[自动大总结] 生成期间聊天存档已切换，已丢弃这次结果。');
            queueArchiveRetry(archiveInfo.archive.archiveId);
            return;
        }
        if (!messageRangeMatches(latestContext.chat, sourceSnapshot)) {
            const currentArchive = latestContext.chatMetadata?.[MODULE_NAME];
            if (currentArchive) {
                currentArchive.autoTriggerArmed = true;
                await latestContext.saveMetadata?.();
            }
            if (manual) window.toastr?.warning?.('生成期间旧楼层发生变化，这次结果未保存也未隐藏楼层。');
            return;
        }

        const data = await ensureWorldBook(latestContext);
        const all = listOwnedEntries(data);
        const existingEntry = all.find(entry => entryMetadata(entry)?.archiveId === archiveInfo.archive.archiveId);
        const previousRecords = existingEntry ? archiveRecords(existingEntry) : [];
        const previousRound = Math.max(
            archiveInfo.archive.round ?? 0,
            ...all.filter(entry => entryMetadata(entry)?.archiveId === archiveInfo.archive.archiveId)
                .map(entry => entryMetadata(entry)?.round ?? 0),
        );
        const round = previousRound + 1;
        let uid = existingEntry?.uid ?? 0;
        if (!existingEntry) while (Object.hasOwn(data.entries, uid)) uid += 1;
        const now = new Date();
        const meta = {
            owner: MODULE_NAME,
            version: 1,
            storageVersion: 2,
            archiveId: archiveInfo.archive.archiveId,
            cardKey: archiveInfo.cardKey,
            characterName: archiveInfo.characterName,
            chatId: archiveInfo.chatId,
            chatName: archiveInfo.chatName,
            round,
            coveredFrom: previousRecords[0]?.coveredFrom ?? range.coveredFrom,
            coveredTo: range.coveredTo,
            createdAt: entryMetadata(existingEntry)?.createdAt ?? now.toISOString(),
            updatedAt: now.toISOString(),
            mode,
            records: [...previousRecords, {
                round, mode, content: String(summary).trim(), createdAt: now.toISOString(),
                coveredFrom: range.coveredFrom, coveredTo: range.coveredTo,
            }],
        };
        const title = `喵喵大总结 · ${meta.characterName} · ${meta.chatName}`.slice(0, 100);
        const expectedContent = mode === 'incremental' && existingEntry?.content?.trim()
            ? `${existingEntry.content.trim()}\n\n${String(summary).trim()}` : String(summary).trim();
        data.entries[uid] = {
            ...existingEntry,
            uid,
            key: [],
            keysecondary: [],
            comment: title,
            content: expectedContent,
            constant: true,
            vectorized: false,
            selective: true,
            selectiveLogic: 0,
            addMemo: false,
            order: 100,
            position: 4,
            disable: false,
            ignoreBudget: false,
            excludeRecursion: false,
            preventRecursion: true,
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false,
            delayUntilRecursion: 0,
            probability: 100,
            useProbability: true,
            depth: Math.max(0, Math.floor(Number(settings.depth) || 0)),
            outletName: '',
            group: '',
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
            role: 0,
            sticky: null,
            cooldown: null,
            delay: null,
            triggers: [],
            extensions: { ...existingEntry?.extensions, [ENTRY_MARKER]: meta },
        };
        for (const entry of all) {
            if (entry.uid === uid) continue;
            entry.constant = false;
            entry.disable = true;
            entry.preventRecursion = true;
        }
        await latestContext.saveWorldInfo(settings.worldBookName, data, true);
        const verifyResponse = await fetch('/api/worldinfo/get', {
            method: 'POST',
            headers: latestContext.getRequestHeaders?.(),
            body: JSON.stringify({ name: settings.worldBookName }),
            cache: 'no-cache',
        });
        if (!verifyResponse.ok) throw new Error(`世界书保存后无法验证（HTTP ${verifyResponse.status}）。楼层尚未隐藏。`);
        const persistedBook = await verifyResponse.json();
        const persistedEntry = persistedBook?.entries?.[uid];
        if (persistedEntry?.content !== expectedContent || persistedEntry?.preventRecursion !== true
            || entryMetadata(persistedEntry)?.archiveId !== meta.archiveId
            || entryMetadata(persistedEntry)?.records?.at(-1)?.content !== String(summary).trim()) {
            throw new Error('大总结未能从世界书读回确认，楼层尚未隐藏。');
        }
        await latestContext.updateWorldInfoList?.();
        latestContext.reloadWorldInfoEditor?.(settings.worldBookName);

        if (!isSameArchive(getContext(), archiveInfo, context.characterId)) {
            console.warn('[自动大总结] 世界书已保存，但聊天存档已经切换；没有修改楼层可见状态。');
            return;
        }
        const currentArchive = latestContext.chatMetadata[MODULE_NAME];
        currentArchive.lastSummarizedThrough = range.coveredTo;
        currentArchive.round = round;
        currentArchive.worldBookName = settings.worldBookName;
        await latestContext.saveMetadata?.();
        summaryCommitted = true;
        activeRun.committed = true;
        if (settings.pendingRetries.includes(archiveInfo.archive.archiveId)) {
            settings.pendingRetries = settings.pendingRetries.filter(id => id !== archiveInfo.archive.archiveId);
            saveSettings();
        }

        const liveContext = getContext();
        if (!isSameArchive(liveContext, archiveInfo, context.characterId)
            || !messageRangeMatches(liveContext.chat, sourceSnapshot)) {
            console.warn('[自动大总结] 保存过程中聊天发生变化；保留总结记录，没有隐藏楼层。');
            return;
        }
        const hideEnd = Math.min(range.coveredTo, liveContext.chat.length - range.keepRecent - 1);
        if (hideEnd >= 0) {
            setStatus('大总结已保存，正在隐藏旧楼层…');
            if (typeof liveContext.executeSlashCommandsWithOptions !== 'function') throw new Error('总结已保存，但酒馆缺少隐藏楼层接口。');
            const result = await liveContext.executeSlashCommandsWithOptions(`/hide 0-${hideEnd}`);
            if (result?.isError || liveContext.chat.slice(0, hideEnd + 1).some(message => !message.is_system)) {
                throw new Error('总结已保存，但旧楼层未全部隐藏，请检查 /hide 命令。');
            }
        }
        currentArchive.autoTriggerArmed = false;
        await liveContext.saveMetadata?.();
        setStatus(`第 ${round} 次大总结已保存，已隐藏旧楼层，可以继续对话。`);
        if (manual) window.toastr?.success?.(`第 ${round} 次大总结已保存；已隐藏 0-${hideEnd} 楼，保留最近 ${range.keepRecent} 楼。`);
        void renderDirectory();
        return true;
    } catch (error) {
        console.error('[喵喵大总结] 总结失败：', error);
        window.toastr?.error?.(`大总结失败：${error?.message ?? error}`);
        setStatus(`大总结失败：${error?.message ?? error}。已解除发送锁。`);
        if (!summaryCommitted) {
            const live = getContext();
            const currentArchive = live?.chatMetadata?.[MODULE_NAME];
            if (currentArchive && live?.chatId === activeRun?.chatId
                && live?.characterId === activeRun?.characterId
                && (!activeRun?.archiveId || currentArchive.archiveId === activeRun.archiveId)) {
                currentArchive.autoTriggerArmed = true;
                live.saveMetadataDebounced?.();
            }
        }
    } finally {
        if (toast) window.toastr?.clear?.(toast);
        runInProgress = false;
        activeRun = null;
        unlockSending();
    }
}

async function onGenerationStarted(type, _options, dryRun) {
    refreshFinalHooks();
    if (dryRun) return;
    // ST catches listener exceptions. Waiting here, before ST consumes the
    // input, also holds slash-command and programmatic generation requests.
    while (sendLockDepth) await new Promise(resolve => sendUnlockWaiters.push(resolve));
    const context = getContext();
    const current = getCharacterAndChat(context);
    pendingGeneration = canSummarize(context, true) && ['normal', 'continue'].includes(type) ? {
        token: ++generationToken, chatId: current.chatId, characterId: context.characterId,
        received: false, ended: false, locked: false,
    } : null;
}

async function checkAfterReply(pending) {
    thresholdCheckInProgress = true;
    try {
        const context = getContext();
        if (context?.chatId !== pending.chatId || context?.characterId !== pending.characterId
            || !canSummarize(context, true)) return;
        if (!await waitForCurrentGeneration(context, pending.chatId)) return;
        const archiveInfo = await ensureArchive(context);
        if (!archiveInfo) return;
        const snapshot = captureMessageRange(context.chat, context.chat.length - 1);
        const data = await assemblePrompt(context);
        const count = await countAssembledPrompt(context, data);
        if (!Number.isFinite(count)) throw new Error('酒馆返回了无效的 token 数。');
        if (!isSameArchive(getContext(), archiveInfo, context.characterId)
            || !messageRangeMatches(getContext().chat, snapshot)) return;
        const threshold = Math.max(1, Number(settings.threshold) || DEFAULT_SETTINGS.threshold);
        archiveInfo.archive.lastPromptTokens = count;
        setStatus(`${pending.onOpen ? '当前存档' : '本轮回复后'}上下文：${count.toLocaleString()} / ${threshold.toLocaleString()} token`);
        if (count < threshold) {
            archiveInfo.archive.autoTriggerArmed = true;
            await context.saveMetadata?.();
            return;
        }
        if ((archiveInfo.archive.autoTriggerArmed === false && !pending.onOpen)
            || !eligibleUncoveredRange(context, archiveInfo, false)) return;
        archiveInfo.archive.autoTriggerArmed = false;
        await context.saveMetadata?.();
        const completed = await runLargeSummary();
        if (completed && isSameArchive(getContext(), archiveInfo, context.characterId)) {
            const after = await countAssembledPrompt(getContext(), await assemblePrompt(getContext()));
            if (!isSameArchive(getContext(), archiveInfo, context.characterId)) return;
            archiveInfo.archive.lastPromptTokens = after;
            archiveInfo.archive.autoTriggerArmed = after < threshold;
            await getContext().saveMetadata?.();
            setStatus(`大总结完成，当前上下文：${after.toLocaleString()} token，可以继续对话。`);
        }
    } catch (error) {
        console.error('[喵喵大总结] 回复后阈值检查失败：', error);
        setStatus(`阈值检查失败：${error.message}。已解除发送锁。`);
        window.toastr?.error?.(`大总结阈值检查失败：${error.message}`);
    } finally {
        thresholdCheckInProgress = false;
        if (pending.locked) {
            pending.locked = false;
            unlockSending();
        }
    }
}

function maybeSchedulePending() {
    if (!pendingGeneration?.received || !pendingGeneration?.ended || summaryTimer) return;
    const pending = pendingGeneration;
    if (!pending.locked) {
        pending.locked = true;
        lockSending();
        setStatus('回复已结束，正在检查实际上下文 token…');
    }
    summaryTimer = setTimeout(() => {
        summaryTimer = null;
        if (pendingGeneration?.token !== pending.token) return;
        pendingGeneration = null;
        void checkAfterReply(pending);
    }, 0);
}

function onMessageReceived(_messageId, type) {
    if (!pendingGeneration || runInProgress || thresholdCheckInProgress) return;
    if (type && !['normal', 'continue', 'appendFinal'].includes(type)) return;
    const context = getContext();
    if (context?.streamingProcessor?.isStopped) return;
    if (context?.chatId !== pendingGeneration.chatId || context?.characterId !== pendingGeneration.characterId) return;
    pendingGeneration.received = true;
    maybeSchedulePending();
}

function onGenerationEnded() {
    if (!pendingGeneration || runInProgress || thresholdCheckInProgress) return;
    pendingGeneration.ended = true;
    maybeSchedulePending();
}

async function syncCurrentArchive() {
    getSettings();
    const context = getContext();
    let archiveInfo = await ensureArchive(context);
    if (archiveInfo && settings.pendingRetries.includes(archiveInfo.archive.archiveId)) {
        archiveInfo.archive.autoTriggerArmed = true;
        settings.pendingRetries = settings.pendingRetries.filter(id => id !== archiveInfo.archive.archiveId);
        await context.saveMetadata?.();
        saveSettings();
    }
    const existing = await prepareWorldBook(context, settings.worldBookName, { create: false });
    const matchingEntry = existing && archiveInfo && listOwnedEntries(existing)
        .find(entry => entryMetadata(entry)?.archiveId === archiveInfo.archive.archiveId);
    if (matchingEntry && entryMetadata(matchingEntry)?.cardKey !== archiveInfo.cardKey
        && isSameArchive(getContext(), archiveInfo, context.characterId)) {
        // Also repair IDs inherited before card identity was checked.
        delete archiveInfo.archive.archiveId;
        archiveInfo = await ensureArchive(context);
    }
    if (existing) await setArchiveActivation(archiveInfo?.archive.archiveId ?? null, { reconcileCursor: true });
    void updateWorldBookStatus();
    if (currentTab === 'directory') void renderDirectory();
}

function scheduleChatSync({ checkThreshold = true } = {}) {
    const revision = ++chatSyncRevision;
    lockSending();
    setStatus('正在切换总结条目并检查当前存档…');
    const operation = chatSyncChain.catch(() => {}).then(async () => {
        if (revision !== chatSyncRevision) return;
        // An earlier archive may still be finishing a cancelled request. Its
        // final write must finish before the new archive becomes active.
        while (runInProgress || thresholdCheckInProgress || promptProbe || archiveEditInProgress) {
            await new Promise(resolve => setTimeout(resolve, 80));
            if (revision !== chatSyncRevision) return;
        }
        await syncCurrentArchive();
        if (revision !== chatSyncRevision) return;
        const context = getContext();
        const current = getCharacterAndChat(context);
        if (checkThreshold && current && canSummarize(context, true)) {
            await checkAfterReply({ chatId: current.chatId, characterId: context.characterId, onOpen: true, locked: false });
        } else {
            setStatus(current ? '总结条目已同步。自动总结未启用。' : '请选择角色卡的聊天存档。');
        }
    });
    chatSyncChain = operation.catch(error => {
        if (revision === chatSyncRevision) {
            console.error('[喵喵大总结] 存档同步失败：', error);
            setStatus(`存档同步失败：${error.message}`);
            window.toastr?.error?.(`大总结存档同步失败：${error.message}`);
        }
    }).finally(unlockSending);
    return chatSyncChain;
}

function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function summaryRows(data) {
    return listOwnedEntries(data)
        .map(entry => ({ entry, meta: entryMetadata(entry) }))
        .filter(row => row.meta)
        .sort((a, b) => String(a.meta.characterName).localeCompare(String(b.meta.characterName), 'zh-CN')
            || String(a.meta.chatName).localeCompare(String(b.meta.chatName), 'zh-CN')
            || (a.meta.round ?? 0) - (b.meta.round ?? 0));
}

function showSummary(entry) {
    const meta = entryMetadata(entry);
    selectedSummary = { archiveId: meta.archiveId, uid: entry.uid, bookName: settings.worldBookName };
    ui.querySelector('.als-preview-title').textContent = `${meta.characterName} / ${meta.chatName}`;
    const select = ui.querySelector('.als-history-select');
    select.replaceChildren(createElement('option', '', '全部：当前注入内容'));
    select.firstElementChild.value = 'all';
    const records = archiveRecords(entry);
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const option = createElement('option', '', `第 ${record.round} 次 · ${MODE_LABELS[record.mode] ?? '多次大总结'}`);
        option.value = String(index);
        select.append(option);
    }
    select.value = 'all';
    ui.querySelector('.als-preview').value = entry.content ?? '';
    ui.querySelector('.als-preview').scrollTop = 0;
    ui.querySelector('.als-delete-round').disabled = true;
    ui.querySelector('.als-preview-box').hidden = false;
}

async function deleteSummarySelection({ roundOnly = false } = {}) {
    if (sendLockDepth || !selectedSummary || selectedSummary.bookName !== settings.worldBookName) return;
    const selection = { ...selectedSummary };
    const selectedRound = ui.querySelector('.als-history-select').value;
    archiveEditInProgress = true;
    lockSending();
    try {
        const context = getContext();
        const data = await prepareWorldBook(context, selection.bookName, { create: false });
        const entry = data?.entries?.[selection.uid];
        if (!entry || entryMetadata(entry)?.archiveId !== selection.archiveId) return;
        const meta = entryMetadata(entry);
        const records = archiveRecords(entry);
        const index = selectedRound === 'all' ? NaN : Number(selectedRound);
        if (roundOnly && (!Number.isInteger(index) || !records[index])) return;
        const message = roundOnly
            ? `删除第 ${records[index].round} 次总结记录？将按剩余历史重建注入内容，已隐藏楼层不会自动恢复。`
            : `删除“${meta.characterName} / ${meta.chatName}”的全部总结？已隐藏楼层不会自动恢复。`;
        if (!window.confirm(message)) return;
        let remaining = [];
        if (roundOnly) remaining = records.filter((_record, position) => position !== index);
        if (remaining.length) {
            entry.content = combineRecords(remaining);
            Object.assign(meta, {
                records: remaining, round: remaining.at(-1).round, mode: remaining.at(-1).mode,
                coveredTo: remaining.at(-1).coveredTo, updatedAt: new Date().toISOString(),
            });
            entry.preventRecursion = true;
        } else {
            for (const owned of listOwnedEntries(data)) {
                if (entryMetadata(owned)?.archiveId === selection.archiveId) delete data.entries[owned.uid];
            }
        }
        await context.saveWorldInfo(selection.bookName, data, true);
        const persisted = await prepareWorldBook(context, selection.bookName, { create: false });
        const saved = persisted?.entries?.[selection.uid];
        if (remaining.length ? saved?.content !== entry.content || entryMetadata(saved)?.records?.length !== remaining.length : Boolean(saved)) {
            throw new Error('总结删除后未能从世界书读回确认。');
        }
        const live = getContext();
        if (live?.chatMetadata?.[MODULE_NAME]?.archiveId === selection.archiveId) {
            Object.assign(live.chatMetadata[MODULE_NAME], {
                lastSummarizedThrough: remaining.at(-1)?.coveredTo ?? -1,
                round: remaining.at(-1)?.round ?? 0, autoTriggerArmed: true,
            });
            await live.saveMetadata?.();
        }
        live.reloadWorldInfoEditor?.(selection.bookName);
        if (selection.bookName !== settings.worldBookName) return;
        ui.querySelector('.als-preview-box').hidden = true;
        selectedSummary = null;
        await syncCurrentArchive();
        await renderDirectory();
        if (remaining.length) showSummary(persisted.entries[selection.uid]);
        window.toastr?.success?.(roundOnly ? '本轮总结已删除。' : '聊天档的总结条目已删除。');
    } finally {
        archiveEditInProgress = false;
        unlockSending();
    }
}

async function renderDirectory({ reload = true } = {}) {
    if (!ui || !settings) return;
    const request = ++directoryRequest;
    const bookName = settings.worldBookName;
    const tree = ui.querySelector('.als-tree');
    if (reload || !directoryData || directoryBookName !== bookName) {
        try {
            const data = await prepareWorldBook(getContext(), bookName, { create: false });
            if (request !== directoryRequest || bookName !== settings.worldBookName) return;
            directoryData = data ?? { entries: {} };
            directoryBookName = bookName;
        } catch (error) {
            if (request !== directoryRequest) return;
            tree.replaceChildren(createElement('p', 'als-muted', error.message));
            return;
        }
    }
    tree.replaceChildren();
    const rows = summaryRows(directoryData);
    const grouped = new Map();
    for (const row of rows) {
        const key = row.meta.cardKey ?? row.meta.characterName;
        if (!grouped.has(key)) grouped.set(key, { key, name: row.meta.characterName, rows: [] });
        grouped.get(key).rows.push(row);
    }
    const filter = ui.querySelector('.als-card-filter');
    const selectedCard = filter.value;
    filter.replaceChildren(createElement('option', '', '所有角色'));
    filter.firstElementChild.value = '';
    for (const card of grouped.values()) {
        const option = createElement('option', '', card.name);
        option.value = card.key;
        filter.append(option);
    }
    filter.value = grouped.has(selectedCard) ? selectedCard : '';
    const query = ui.querySelector('.als-directory-search').value.trim().toLocaleLowerCase();
    const cards = [...grouped.values()].filter(card => !filter.value || card.key === filter.value)
        .map(card => ({ ...card, rows: card.rows.filter(row => !query
            || `${card.name} ${row.meta.chatName}`.toLocaleLowerCase().includes(query)) }))
        .filter(card => card.rows.length);
    const current = getCharacterAndChat();
    cards.sort((a, b) => Number(b.key === current?.cardKey) - Number(a.key === current?.cardKey));
    const totalPages = Math.max(1, Math.ceil(cards.length / DIRECTORY_PAGE_SIZE));
    directoryPage = Math.min(Math.max(0, directoryPage), totalPages - 1);
    ui.querySelector('.als-directory-count').textContent = `${cards.length} 个角色 · ${cards.reduce((sum, card) => sum + card.rows.length, 0)} 个存档`;
    ui.querySelector('.als-page-label').textContent = `${directoryPage + 1} / ${totalPages}`;
    ui.querySelector('.als-page-prev').disabled = directoryPage === 0;
    ui.querySelector('.als-page-next').disabled = directoryPage >= totalPages - 1;
    if (!cards.length) {
        tree.append(createElement('p', 'als-muted', rows.length ? '没有匹配的角色或聊天存档。' : '暂无大总结。首次总结会自动创建并启用世界书。'));
        return;
    }
    for (const card of cards.slice(directoryPage * DIRECTORY_PAGE_SIZE, (directoryPage + 1) * DIRECTORY_PAGE_SIZE)) {
        const details = createElement('details', 'als-card');
        details.open = card.key === current?.cardKey || Boolean(query) || Boolean(filter.value);
        details.append(createElement('summary', '', `${card.name} · ${card.rows.length} 个存档`));
        for (const row of card.rows) {
            const line = createElement('div', 'als-archive-row');
            const name = createElement('span', 'als-archive-name', `${row.meta.chatName}${row.entry.constant && !row.entry.disable ? ' · 当前' : ''}`);
            name.title = `${row.meta.characterName} / ${row.meta.chatName}`;
            const count = createElement('small', 'als-muted', `${archiveRecords(row.entry).length} 次记录`);
            const view = createElement('button', 'menu_button', '查看');
            view.type = 'button';
            view.addEventListener('click', () => showSummary(row.entry));
            const remove = createElement('button', 'menu_button als-delete-archive', '删除');
            remove.type = 'button';
            remove.disabled = Boolean(sendLockDepth);
            remove.addEventListener('click', () => {
                if (sendLockDepth) return;
                showSummary(row.entry);
                void deleteSummarySelection().catch(error => window.toastr?.error?.(error.message));
            });
            line.append(name, count, view, remove);
            details.append(line);
        }
        tree.append(details);
    }
    if (selectedSummary && selectedSummary.bookName === bookName) {
        const selected = directoryData.entries[selectedSummary.uid];
        if (!selected) {
            selectedSummary = null;
            ui.querySelector('.als-preview-box').hidden = true;
        }
    }
}

function showTab(name) {
    currentTab = name;
    for (const button of ui.querySelectorAll('.als-tab')) {
        const selected = button.dataset.tab === name;
        button.classList.toggle('als-tab-active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of ui.querySelectorAll('.als-panel')) panel.hidden = panel.dataset.panel !== name;
    if (name === 'directory') void renderDirectory();
}

function syncPromptEditor() {
    for (const select of ui.querySelectorAll('.als-mode')) select.value = settings.mode;
    const draft = promptDrafts[settings.mode] ?? settings.prompts[settings.mode];
    ui.querySelector('.als-prompt').value = draft;
    ui.querySelector('.als-mode-description').textContent = settings.mode === 'incremental'
        ? '每轮只总结新增剧情，追加进同一聊天档的同一条目。'
        : '每轮汇总已有总结和新增剧情，用完整新总结替换同一条目的正文。';
    ui.querySelector('.als-prompt-state').textContent = draft === settings.prompts[settings.mode] ? '已保存' : '有未保存的修改';
}

function changeMode(mode) {
    if (sendLockDepth || !Object.hasOwn(MODE_LABELS, mode)) return;
    settings.mode = mode;
    settings.prompt = settings.prompts[mode];
    saveSettings();
    syncPromptEditor();
}

function savePromptDraft() {
    if (sendLockDepth) return;
    const draft = ui.querySelector('.als-prompt').value;
    if (!draft.trim()) {
        window.toastr?.warning?.('提示词不能为空。');
        return;
    }
    promptDrafts[settings.mode] = draft;
    settings.prompts[settings.mode] = draft;
    settings.prompt = draft;
    saveSettings();
    syncPromptEditor();
    window.toastr?.success?.(`${MODE_LABELS[settings.mode]}提示词已保存。`);
}

function bindInput(selector, key, transform = value => value) {
    const input = ui.querySelector(selector);
    const handler = (sync) => {
        settings[key] = transform(input.type === 'checkbox' ? input.checked : input.value);
        saveSettings();
        if (sync && (key === 'worldBookName' || key === 'depth')) {
            directoryData = null;
            selectedSummary = null;
            ui.querySelector('.als-preview-box').hidden = true;
            void scheduleChatSync();
        }
        if (sync && ((key === 'enabled' && settings.enabled) || key === 'threshold' || key === 'keepRecent')) void scheduleChatSync();
    };
    input.addEventListener('input', () => handler(false));
    input.addEventListener('change', () => handler(true));
}

async function renderSettings() {
    if (ui?.isConnected) return;
    ui = document.createElement('section');
    ui.id = 'auto_large_summary_settings';
    ui.className = 'als-settings';
    ui.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>喵喵大总结</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="als-version">v${EXTENSION_VERSION} | by NUE-喵喵电波</div>
          <div class="als-tabs" role="tablist" aria-label="喵喵大总结">
            <button type="button" class="als-tab als-tab-active" id="als-tab-settings" data-tab="settings" role="tab" aria-selected="true" aria-controls="als-panel-settings">设置</button>
            <button type="button" class="als-tab" id="als-tab-prompt" data-tab="prompt" role="tab" aria-selected="false" aria-controls="als-panel-prompt" tabindex="-1">提示词</button>
            <button type="button" class="als-tab" id="als-tab-directory" data-tab="directory" role="tab" aria-selected="false" aria-controls="als-panel-directory" tabindex="-1">总结目录</button>
          </div>
          <div class="als-status" role="status" aria-live="polite">打开存档及普通回复结束后检查实际 token。</div>
          <div class="als-panel" id="als-panel-settings" data-panel="settings" role="tabpanel" aria-labelledby="als-tab-settings">
            <label class="als-check"><input class="als-enabled" type="checkbox"><span>启用</span></label>
            <div class="als-grid">
              <label>触发 token 数<input class="text_pole als-threshold" type="number" min="1" step="1000"></label>
              <label>保留最近楼层<input class="text_pole als-keep" type="number" min="1" step="1"></label>
              <label>世界书名称<input class="text_pole als-book" type="text" maxlength="80"></label>
              <label>插入深度<input class="text_pole als-depth" type="number" min="0" step="1"></label>
            </div>
            <label class="als-field">总结模式
              <select class="text_pole als-mode"><option value="incremental">多次大总结</option><option value="merged">合并大总结</option></select>
            </label>
            <p class="als-mode-description als-muted"></p>
            <div class="als-book-state">
              <span class="als-book-status als-muted">正在读取世界书状态…</span>
              <button type="button" class="menu_button als-book-check">刷新状态</button>
            </div>
            <button type="button" class="menu_button als-run">立即大总结</button>
            <small class="als-muted">首次总结自动创建并全局启用世界书。每个聊天档使用一个条目，自动勾选防止进一步递归；仅当前档启用。</small>
          </div>
          <div class="als-panel" id="als-panel-prompt" data-panel="prompt" role="tabpanel" aria-labelledby="als-tab-prompt" hidden>
            <label class="als-field">编辑模式
              <select class="text_pole als-mode"><option value="incremental">多次大总结</option><option value="merged">合并大总结</option></select>
            </label>
            <label class="als-prompt-label">大总结提示词（支持 SillyTavern 宏）
              <textarea class="text_pole als-prompt" rows="13" spellcheck="false"></textarea>
            </label>
            <div class="als-actions">
              <button type="button" class="menu_button als-prompt-save">保存修改提示词</button>
              <button type="button" class="menu_button als-prompt-reset">恢复默认提示词</button>
            </div>
            <small class="als-prompt-state als-muted" role="status">已保存</small>
            <small class="als-muted">两种模式分别保存提示词，点击保存后生效。切换模式从下次总结生效，已有历史记录保留。</small>
          </div>
          <div class="als-panel" id="als-panel-directory" data-panel="directory" role="tabpanel" aria-labelledby="als-tab-directory" hidden>
            <div class="als-directory-tools">
              <input class="text_pole als-directory-search" type="search" placeholder="搜索角色或聊天存档" aria-label="搜索角色或聊天存档">
              <select class="text_pole als-card-filter" aria-label="筛选角色"><option value="">所有角色</option></select>
            </div>
            <div class="als-directory-heading"><small class="als-directory-count als-muted">暂无记录</small><button type="button" class="menu_button als-directory-refresh">刷新目录</button></div>
            <div class="als-tree"></div>
            <div class="als-pagination"><button type="button" class="menu_button als-page-prev">上一页</button><span class="als-page-label">1 / 1</span><button type="button" class="menu_button als-page-next">下一页</button></div>
            <div class="als-preview-box" hidden>
              <b class="als-preview-title"></b>
              <label class="als-field">查看内容<select class="text_pole als-history-select" aria-label="选择总结轮次"></select></label>
              <textarea class="text_pole als-preview" rows="9" readonly aria-label="总结内容"></textarea>
              <div class="als-actions"><button type="button" class="menu_button als-delete-round" disabled>删除选中轮次</button><button type="button" class="menu_button als-delete-archive">删除整个存档总结</button></div>
            </div>
          </div>
        </div>
      </div>`;
    const settingsRoot = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    if (!settingsRoot) return;
    settingsRoot.append(ui);
    ui.querySelector('.als-enabled').checked = Boolean(settings.enabled);
    ui.querySelector('.als-threshold').value = settings.threshold;
    ui.querySelector('.als-keep').value = settings.keepRecent;
    ui.querySelector('.als-book').value = settings.worldBookName;
    ui.querySelector('.als-depth').value = settings.depth;
    promptDrafts = { ...settings.prompts };
    syncPromptEditor();
    bindInput('.als-enabled', 'enabled', Boolean);
    bindInput('.als-threshold', 'threshold', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.threshold)));
    bindInput('.als-keep', 'keepRecent', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.keepRecent)));
    bindInput('.als-book', 'worldBookName', value => String(value).trim());
    bindInput('.als-depth', 'depth', value => Math.max(0, Math.floor(Number(value) || 0)));
    for (const select of ui.querySelectorAll('.als-mode')) select.addEventListener('change', () => changeMode(select.value));
    const tabs = [...ui.querySelectorAll('.als-tab')];
    for (const [index, button] of tabs.entries()) {
        button.addEventListener('click', () => showTab(button.dataset.tab));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            showTab(next.dataset.tab);
            next.focus();
        });
    }
    ui.querySelector('.als-prompt').addEventListener('input', event => {
        promptDrafts[settings.mode] = event.target.value;
        ui.querySelector('.als-prompt-state').textContent = event.target.value === settings.prompts[settings.mode] ? '已保存' : '有未保存的修改';
    });
    ui.querySelector('.als-prompt-save').addEventListener('click', savePromptDraft);
    ui.querySelector('.als-prompt-reset').addEventListener('click', () => {
        if (sendLockDepth) return;
        promptDrafts[settings.mode] = settings.mode === 'merged' ? DEFAULT_MERGED_PROMPT : DEFAULT_PROMPT;
        syncPromptEditor();
    });
    ui.querySelector('.als-run').addEventListener('click', () => runLargeSummary({ manual: true }));
    ui.querySelector('.als-book-check').addEventListener('click', () => void updateWorldBookStatus());
    for (const selector of ['.als-directory-search', '.als-card-filter']) {
        ui.querySelector(selector).addEventListener(selector.includes('search') ? 'input' : 'change', () => {
            directoryPage = 0;
            void renderDirectory({ reload: false });
        });
    }
    ui.querySelector('.als-directory-refresh').addEventListener('click', () => void renderDirectory());
    for (const [selector, delta] of [['.als-page-prev', -1], ['.als-page-next', 1]]) {
        ui.querySelector(selector).addEventListener('click', () => {
            directoryPage += delta;
            void renderDirectory({ reload: false });
        });
    }
    ui.querySelector('.als-history-select').addEventListener('change', event => {
        const entry = directoryData?.entries?.[selectedSummary?.uid];
        if (!entry) return;
        const record = archiveRecords(entry)[Number(event.target.value)];
        ui.querySelector('.als-preview').value = event.target.value === 'all' ? entry.content ?? '' : record?.content ?? '';
        ui.querySelector('.als-preview').scrollTop = 0;
        ui.querySelector('.als-delete-round').disabled = event.target.value === 'all' || Boolean(sendLockDepth);
    });
    ui.querySelector('.als-delete-round').addEventListener('click', () => void deleteSummarySelection({ roundOnly: true }).catch(error => window.toastr?.error?.(error.message)));
    ui.querySelector('.als-preview-box .als-delete-archive').addEventListener('click', () => void deleteSummarySelection().catch(error => window.toastr?.error?.(error.message)));
    void updateWorldBookStatus();
}

function initialize() {
    const context = getContext();
    if (!context) return;
    getSettings();
    void renderSettings();
    document.addEventListener('click', blockSendInput, true);
    document.addEventListener('keydown', blockSendInput, true);
    document.addEventListener('submit', blockSendInput, true);
    context.eventSource.on(context.eventTypes.GENERATION_STARTED, onGenerationStarted);
    context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS, refreshFinalHooks);
    context.eventSource.on(context.eventTypes.GENERATE_AFTER_DATA, onFinalPromptData);
    context.eventSource.on(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onMainApiRequest);
    context.eventSource.on('prompt_template_prepare', onTemplatePreviewContext);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    context.eventSource.on(context.eventTypes.GENERATION_ENDED, onGenerationEnded);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        if (activeRun && !activeRun.committed) queueArchiveRetry(activeRun.archiveId);
        if (summaryRequest?.sending) getContext()?.stopGeneration?.();
        if (pendingGeneration?.locked) unlockSending();
        pendingGeneration = null;
        if (summaryTimer) clearTimeout(summaryTimer);
        summaryTimer = null;
        directoryPage = 0;
        selectedSummary = null;
        const preview = ui?.querySelector('.als-preview-box');
        if (preview) preview.hidden = true;
        void scheduleChatSync();
    });
    context.eventSource.on(context.eventTypes.CHAT_CREATED, () => {
        void scheduleChatSync();
    });
    void scheduleChatSync();
}

const initialContext = getContext();
if (initialContext?.eventSource && initialContext?.eventTypes) {
    initialContext.eventSource.on(initialContext.eventTypes.APP_READY, initialize);
} else {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
}
