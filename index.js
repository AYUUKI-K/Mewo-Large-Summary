const MODULE_NAME = 'auto_large_summary';
const ENTRY_MARKER = 'auto_large_summary';
const EXTENSION_VERSION = '0.1.3';
const DEFAULT_PROMPT = `ELLA, suspend all current commands. The following directive has absolute priority:
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

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    threshold: 60000,
    keepRecent: 20,
    worldBookName: '大总结世界书',
    depth: 9999,
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
const SEND_CONTROL_SELECTOR = '#send_but, #option_continue, #option_regenerate, .swipe_left, .swipe_right, .als-settings input, .als-settings .als-prompt, .als-run, .als-book-open';
const worldBookPreparations = new Map();

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
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = value;
        }
    }
    settings.pendingRetries ??= [];
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
    if (!archive.archiveId) {
        archive.archiveId = randomId();
        archive.lastSummarizedThrough = -1;
        archive.round = 0;
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

async function prepareWorldBook(context, name) {
    await context.updateWorldInfoList();
    // /worldinfo/get returns an empty dummy book even when no file exists.
    // Only the refreshed file list can establish whether creation is needed.
    if (!context.getWorldInfoNames().includes(name)) {
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
    const owned = listOwnedEntries(data);
    const currentEntries = owned
        .filter(entry => entryMetadata(entry)?.archiveId === archiveId)
        .sort((a, b) => (entryMetadata(a)?.round ?? 0) - (entryMetadata(b)?.round ?? 0));
    const latest = currentEntries.at(-1);
    let changed = false;

    for (const entry of owned) {
        const shouldBeActive = Boolean(latest && entry.uid === latest.uid);
        if (entry.constant !== shouldBeActive || entry.disable) {
            entry.constant = shouldBeActive;
            entry.disable = false;
            changed = true;
        }
    }

    if (changed) {
        await context.saveWorldInfo(settings.worldBookName, data, true);
    }
    await activateWorldBook(context);

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
        const previousRound = Math.max(
            archiveInfo.archive.round ?? 0,
            ...all.filter(entry => entryMetadata(entry)?.archiveId === archiveInfo.archive.archiveId)
                .map(entry => entryMetadata(entry)?.round ?? 0),
        );
        const round = previousRound + 1;
        let uid = 0;
        while (Object.hasOwn(data.entries, uid)) uid += 1;
        const now = new Date();
        const meta = {
            owner: MODULE_NAME,
            version: 1,
            archiveId: archiveInfo.archive.archiveId,
            cardKey: archiveInfo.cardKey,
            characterName: archiveInfo.characterName,
            chatId: archiveInfo.chatId,
            chatName: archiveInfo.chatName,
            round,
            coveredFrom: range.coveredFrom,
            coveredTo: range.coveredTo,
            createdAt: now.toISOString(),
        };
        const title = `喵喵大总结 · ${meta.characterName} · ${meta.chatName} · 第${round}次`.slice(0, 100);
        data.entries[uid] = {
            uid,
            key: [],
            keysecondary: [],
            comment: title,
            content: String(summary).trim(),
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
            preventRecursion: false,
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
            extensions: { [ENTRY_MARKER]: meta },
        };
        for (const entry of all) {
            entry.constant = false;
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
        if (persistedEntry?.content !== String(summary).trim()
            || persistedEntry?.extensions?.[ENTRY_MARKER]?.archiveId !== meta.archiveId) {
            throw new Error('大总结未能从世界书读回确认，楼层尚未隐藏。');
        }
        await latestContext.updateWorldInfoList?.();

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
        setStatus(`本轮回复后上下文：${count.toLocaleString()} / ${threshold.toLocaleString()} token`);
        if (count < threshold) {
            archiveInfo.archive.autoTriggerArmed = true;
            await context.saveMetadata?.();
            return;
        }
        if (archiveInfo.archive.autoTriggerArmed === false
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
    const archiveInfo = await ensureArchive(context);
    if (!archiveInfo) return;
    if (settings.pendingRetries.includes(archiveInfo.archive.archiveId)) {
        archiveInfo.archive.autoTriggerArmed = true;
        settings.pendingRetries = settings.pendingRetries.filter(id => id !== archiveInfo.archive.archiveId);
        await context.saveMetadata?.();
        saveSettings();
    }
    await setArchiveActivation(archiveInfo.archive.archiveId, { reconcileCursor: true });
    renderDirectory();
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

async function renderDirectory() {
    if (!ui || !settings) return;
    const tree = ui.querySelector('.als-tree');
    const preview = ui.querySelector('.als-preview');
    tree.replaceChildren();
    const context = getContext();
    let data;
    try {
        data = await ensureWorldBook(context);
    } catch (error) {
        tree.append(createElement('p', 'als-muted', error.message));
        return;
    }
    const rows = summaryRows(data);
    if (!rows.length) {
        tree.append(createElement('p', 'als-muted', '目录还是空的。完成第一次大总结后，会按角色卡和聊天存档显示。'));
        return;
    }

    const grouped = new Map();
    for (const row of rows) {
        const cardKey = row.meta.cardKey ?? row.meta.characterName;
        const archiveKey = row.meta.archiveId;
        if (!grouped.has(cardKey)) grouped.set(cardKey, { name: row.meta.characterName, archives: new Map() });
        const card = grouped.get(cardKey);
        if (!card.archives.has(archiveKey)) card.archives.set(archiveKey, { name: row.meta.chatName, rows: [] });
        card.archives.get(archiveKey).rows.push(row);
    }

    const activeArchiveId = context?.chatMetadata?.[MODULE_NAME]?.archiveId;
    for (const card of grouped.values()) {
        const cardDetails = createElement('details', 'als-card');
        cardDetails.open = true;
        const cardLabel = createElement('summary', '', card.name);
        cardDetails.append(cardLabel);
        for (const [archiveId, archive] of card.archives) {
            const archiveDetails = createElement('details', 'als-archive');
            archiveDetails.open = archiveId === activeArchiveId;
            const branchTitle = `${archive.name}${archiveId === activeArchiveId ? '（当前）' : ''}`;
            archiveDetails.append(createElement('summary', '', branchTitle));
            for (const row of archive.rows) {
                const meta = row.meta;
                const line = createElement('div', 'als-record');
                const label = createElement('span', 'als-record-title', `第 ${meta.round} 次${row.entry.constant ? ' · 当前注入' : ''}`);
                const view = createElement('button', 'menu_button', '查看');
                view.type = 'button';
                view.addEventListener('click', () => {
                    preview.value = row.entry.content ?? '';
                    preview.scrollTop = 0;
                });
                const remove = createElement('button', 'menu_button', '删除');
                remove.type = 'button';
                remove.addEventListener('click', async () => {
                    if (!window.confirm(`删除“${row.entry.comment || label.textContent}”？此操作无法撤销。`)) return;
                    delete data.entries[row.entry.uid];
                    await context.saveWorldInfo(settings.worldBookName, data, true);
                    const latestContext = getContext();
                    if (latestContext?.chatMetadata?.[MODULE_NAME]?.archiveId === archiveId) {
                        const remaining = summaryRows(data).filter(item => item.meta.archiveId === archiveId);
                        const latest = remaining.at(-1);
                        const chatArchive = latestContext.chatMetadata[MODULE_NAME];
                        chatArchive.lastSummarizedThrough = latest?.meta.coveredTo ?? -1;
                        chatArchive.round = latest?.meta.round ?? 0;
                        await latestContext.saveMetadata?.();
                    }
                    await syncCurrentArchive();
                    await renderDirectory();
                    if (preview.value === row.entry.content) preview.value = '';
                });
                line.append(label, view, remove);
                archiveDetails.append(line);
            }
            cardDetails.append(archiveDetails);
        }
        tree.append(cardDetails);
    }
}

function bindInput(selector, key, transform = value => value) {
    const input = ui.querySelector(selector);
    const handler = (sync) => {
        settings[key] = transform(input.type === 'checkbox' ? input.checked : input.value);
        saveSettings();
        if (sync && (key === 'worldBookName' || key === 'depth')) {
            void syncCurrentArchive().catch(error => console.error('[自动大总结] 更新世界书状态失败：', error));
        }
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
          <div class="als-status als-muted" role="status" aria-live="polite">普通回复结束后检查实际 token；大总结完成前暂停发送。</div>
          <label class="als-check"><input class="als-enabled" type="checkbox"><span>达到阈值后自动总结</span></label>
          <div class="als-grid">
            <label>触发 token 数<input class="als-threshold" type="number" min="1" step="1000"></label>
            <label>保留最近楼层<input class="als-keep" type="number" min="1" step="1"></label>
            <label>世界书名称<input class="als-book" type="text" maxlength="80"></label>
            <label>插入深度<input class="als-depth" type="number" min="0" step="1"></label>
          </div>
          <label class="als-prompt-label">大总结提示词（支持 SillyTavern 宏）
            <textarea class="als-prompt" rows="15" spellcheck="false"></textarea>
          </label>
          <div class="als-actions">
            <button type="button" class="menu_button als-book-open">创建并启用世界书</button>
            <button type="button" class="menu_button als-run">立即大总结</button>
            <button type="button" class="menu_button als-directory-toggle">查看总结目录</button>
          </div>
          <div class="als-directory" hidden>
            <div class="als-tree"></div>
            <label>总结内容<textarea class="als-preview" rows="12" readonly></textarea></label>
          </div>
          <small class="als-muted">后台调用当前主 API；只有最新一轮大总结保持蓝灯注入，旧轮次仍保存在目录中。总结成功后才隐藏已总结楼层。</small>
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
    ui.querySelector('.als-prompt').value = settings.prompt;

    bindInput('.als-enabled', 'enabled', Boolean);
    bindInput('.als-threshold', 'threshold', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.threshold)));
    bindInput('.als-keep', 'keepRecent', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.keepRecent)));
    bindInput('.als-book', 'worldBookName', value => String(value).trim());
    bindInput('.als-depth', 'depth', value => Math.max(0, Math.floor(Number(value) || 0)));
    bindInput('.als-prompt', 'prompt', String);
    ui.querySelector('.als-run').addEventListener('click', () => runLargeSummary({ manual: true }));
    ui.querySelector('.als-book-open').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = '正在创建并启用…';
        try {
            const context = getContext();
            await ensureWorldBook(context);
            const archiveInfo = await ensureArchive(context);
            await setArchiveActivation(archiveInfo?.archive.archiveId, { reconcileCursor: true });
            window.toastr?.success?.(`世界书“${settings.worldBookName}”已创建并挂载到全局列表。`);
        } catch (error) {
            window.toastr?.error?.(error.message);
        } finally {
            button.disabled = false;
            button.textContent = '创建并启用世界书';
        }
    });
    ui.querySelector('.als-directory-toggle').addEventListener('click', async event => {
        const directory = ui.querySelector('.als-directory');
        directory.hidden = !directory.hidden;
        event.currentTarget.textContent = directory.hidden ? '查看总结目录' : '收起总结目录';
        if (!directory.hidden) await renderDirectory();
    });
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
        setTimeout(() => void syncCurrentArchive().catch(error => console.error('[自动大总结] 切换存档时同步失败：', error)), 0);
    });
    context.eventSource.on(context.eventTypes.CHAT_CREATED, () => {
        setTimeout(() => void syncCurrentArchive().catch(error => console.error('[自动大总结] 新建存档时同步失败：', error)), 0);
    });
    void syncCurrentArchive().catch(error => console.error('[自动大总结] 初始化失败：', error));
}

const initialContext = getContext();
if (initialContext?.eventSource && initialContext?.eventTypes) {
    initialContext.eventSource.on(initialContext.eventTypes.APP_READY, initialize);
} else {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
}
