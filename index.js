const MODULE_NAME = 'auto_large_summary';
const ENTRY_MARKER = 'auto_large_summary';
const EXTENSION_VERSION = '1.0.0';
const SUMMARY_INJECTION_ID = 'meow_large_summary_instruction';
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
    worldBookName: '喵喵大总结世界书',
    depth: 9999,
    mode: 'incremental',
    instructionPosition: 'tail',
    instructionDepth: 0,
    instructionRole: 0,
    prompt: DEFAULT_PROMPT,
    apiMode: 'main',
    secondaryUrl: '',
    secondaryKey: '',
    secondaryModel: '',
    secondaryModels: [],
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
const lockedControls = new Map();
const SEND_CONTROL_SELECTOR = '#send_but, #option_continue, #option_regenerate, .swipe_left, .swipe_right, .als-settings input:not(.als-enabled), .als-settings .als-mode, .als-settings .als-api-mode, .als-model-fetch, .als-settings .als-instruction-position, .als-settings .als-instruction-role, .als-settings .als-prompt, .als-run, .als-settings-save, .als-settings-reset, .als-prompt-save, .als-prompt-reset, .als-delete-archive, .als-delete-round, .als-update-apply';
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
let settingsDraft = {};
let promptEditorMode = 'incremental';
let updateCheckInProgress = false;
let updateInProgress = false;
let availableUpdate = null;
let dismissedUpdate = '';
let enabledRevision = 0;
let manualVisibilityRevision = 0;
let summaryHideInProgress = false;
let visibilityRefreshRevision = 0;
let visibilityRefreshTimer = null;
const visibilityCommandCallbacks = new WeakSet();
let enabledSaveChain = Promise.resolve();
let modelFetchRevision = 0;
let modelFetchTimer = null;
let modelFetchController = null;
const SETTING_FIELDS = ['enabled', 'threshold', 'keepRecent', 'worldBookName', 'depth', 'mode', 'instructionPosition', 'instructionDepth', 'instructionRole', 'apiMode', 'secondaryUrl', 'secondaryKey', 'secondaryModel', 'secondaryModels'];
const INSTRUCTION_POSITIONS = { tail: null, before: 2, after: 0, depth: 1 };

function setStatus(message) {
    const status = ui?.querySelector('.als-status');
    if (status) status.textContent = meowText(message);
}

function meowText(message) {
    const text = String(message ?? '');
    return !text || /^喵[，,!！]|喵[，,。!！？?…]|喵$|喵喵正在/.test(text)
        ? text : `${text.replace(/[。！!]$/, '')}喵。`;
}

function notify(kind, message, title = '喵喵大总结', options) {
    return window.toastr?.[kind]?.(meowText(message), title, options);
}

function lockSending() {
    sendLockDepth += 1;
    if (sendLockDepth !== 1) return;
    document.body?.classList.add('als-send-locked');
    for (const control of document.querySelectorAll(SEND_CONTROL_SELECTOR)) {
        // Keep the input's send action usable for local /hide and /unhide.
        // Conversation sends are blocked in the capture handler below.
        if (control.id === 'send_but') continue;
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
    const modelButton = ui?.querySelector('.als-model-fetch');
    if (modelButton) modelButton.disabled = Boolean(modelFetchController);
}

function blockSendInput(event) {
    const target = event.target;
    const isSend = event.type === 'click' && target?.closest?.(SEND_CONTROL_SELECTOR);
    const isEnter = event.type === 'keydown' && target?.id === 'send_textarea'
        && event.key === 'Enter' && !event.shiftKey && !event.isComposing;
    const isSubmit = event.type === 'submit' && target?.querySelector?.('#send_textarea');
    if (!isSend && !isEnter && !isSubmit) return;
    const fromChatInput = isEnter || isSubmit || (isSend && target.closest('#send_but'));
    const input = document.querySelector('#send_textarea');
    const command = input?.value?.trim() ?? '';
    // Observe user intent without intercepting the native command. It also
    // invalidates a pending check when /hide leaves the flags unchanged.
    if (fromChatInput && /^\/(?:hide|unhide)(?:\s|$)/i.test(command)) manualVisibilityRevision += 1;
    if (!sendLockDepth) return;
    // ST owns all slash parsing, including pipelines, macros, script controls
    // and commands added by other extensions. Never consume their input here.
    if (fromChatInput && command.startsWith('/')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify('info', '正在检查上下文或进行大总结，保存并隐藏旧楼层后才能继续发送。', '', { preventDuplicates: true });
}

function installVisibilityCommandHooks() {
    const commands = getContext()?.SlashCommandParser?.commands;
    if (!commands) return;
    for (const name of ['hide', 'unhide']) {
        const command = commands[name];
        const original = command?.callback;
        if (typeof original !== 'function' || visibilityCommandCallbacks.has(original)) continue;
        // Keep ST's parser, arguments, filters, return value and errors intact.
        // The callback is observed only to refresh counts after ST has saved.
        const callback = async function (...args) {
            const ownHide = summaryHideInProgress && name === 'hide';
            const context = getContext();
            if (!ownHide) manualVisibilityRevision += 1;
            try {
                return await original.apply(this, args);
            } finally {
                if (!ownHide) scheduleVisibilityRefresh(context);
            }
        };
        visibilityCommandCallbacks.add(callback);
        command.callback = callback;
    }
}

function scheduleVisibilityRefresh(context = getContext(), { afterSummary = false } = {}) {
    if (!context || !getCharacterAndChat(context)) return;
    const revision = ++visibilityRefreshRevision;
    if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer);
    visibilityRefreshTimer = setTimeout(() => {
        visibilityRefreshTimer = null;
        void refreshVisibilityTokens(context, revision, { afterSummary });
    }, 150);
}

async function renderNativeTokenCounter(context) {
    if (context.mainApi !== 'openai') return;
    const { promptManager } = await import('/scripts/openai.js');
    // Native dry preparation updates its count cache, but doesn't render it.
    // false renders that cache without starting a second dry generation.
    promptManager?.render(false);
}

async function refreshVisibilityTokens(context, revision = visibilityRefreshRevision, { afterSummary = false } = {}) {
    const currentRequest = () => revision === visibilityRefreshRevision
        && getContext()?.chat === context.chat && getContext()?.chatId === context.chatId
        && getContext()?.characterId === context.characterId;
    let locked = false;
    try {
        const native = await import('/script.js');
        const deadline = Date.now() + 30000;
        while (currentRequest()) {
            const current = getContext();
            const busy = runInProgress || thresholdCheckInProgress || promptProbe || sendLockDepth || archiveEditInProgress
                || native.is_send_press || native.isGenerating?.()
                || (current.streamingProcessor && !current.streamingProcessor.isFinished)
                || document.body.dataset.generating === 'true'
                || document.querySelector('#form_sheld')?.classList.contains('isExecutingCommandsFromChatInput');
            if (!busy) break;
            if (Date.now() >= deadline) return;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        if (!currentRequest()) return;
        lockSending();
        locked = true;
        const snapshot = captureMessageRange(context.chat, context.chat.length - 1);
        const count = await countAssembledPrompt(context, await assemblePrompt(context));
        if (!currentRequest() || !messageRangeMatches(context.chat, snapshot)) return;
        if (!Number.isFinite(count)) throw new Error('酒馆返回了无效的 token 数。');
        await renderNativeTokenCounter(context);
        if (!currentRequest()) return;
        const archive = context.chatMetadata?.[MODULE_NAME];
        if (archive) archive.lastPromptTokens = count;
        if (afterSummary && archive) {
            reportSummaryTokenCount(archive, count);
            await context.saveMetadata?.();
        } else {
            if (archive?.summaryStillOverThreshold && count < Math.max(1, Number(settings.threshold) || DEFAULT_SETTINGS.threshold)) {
                archive.summaryStillOverThreshold = false;
                archive.autoTriggerArmed = true;
                await context.saveMetadata?.();
            }
            if (currentRequest()) setStatus(`楼层显示状态已更新，当前上下文：${count.toLocaleString()} token。`);
        }
        // A manual visibility edit only refreshes counts. Never evaluate the
        // threshold for generation, sync world info, or issue another /hide.
        // Falling below the threshold only clears the over-limit pause.
    } catch (error) {
        if (currentRequest()) setStatus(`楼层状态由酒馆保存；token 刷新失败：${error.message}`);
    } finally {
        if (locked) unlockSending();
    }
}

function cancelPendingAutoSummary() {
    if (summaryTimer) clearTimeout(summaryTimer);
    summaryTimer = null;
    if (pendingGeneration?.locked) unlockSending();
    pendingGeneration = null;
    if (activeRun?.automatic) {
        activeRun.cancelled = true;
        if (summaryRequest?.sending) {
            summaryRequest.cancelled = true;
            getContext()?.stopGeneration?.();
        }
    }
}

function applyEnabledState(value) {
    settings.enabled = Boolean(value);
    settingsDraft.enabled = settings.enabled;
    const revision = ++enabledRevision;
    if (!settings.enabled) {
        cancelPendingAutoSummary();
        setStatus('自动总结已关闭。');
    }
    syncSettingsState();
    // Serialize immediate saves so rapid on/off toggles cannot leave an older
    // setting as the last server write. No other settings drafts are applied.
    void persistSettingsNow().then(() => {
        if (revision === enabledRevision && settings.enabled) void scheduleChatSync();
    }).catch(error => notify('error', `启用状态保存失败：${error.message}`));
}

function summaryWasCancelled() {
    return Boolean(activeRun && (activeRun.cancelled
        || activeRun.manualVisibilityRevision !== manualVisibilityRevision
        || (activeRun.automatic && (!settings.enabled || activeRun.enabledRevision !== enabledRevision))));
}

function assertSummaryActive() {
    if (summaryWasCancelled()) throw new Error('本次总结已取消。');
}

// The default tail is applied after preset/EJS assembly. Other positions use
// ST's own extension injection API during native context preparation.
function appendSummaryTail(messages) {
    if (!summaryRequest || summaryRequest.position !== 'tail' || !Array.isArray(messages)) return;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (summaryRequest.tailMessages.has(messages[i])) messages.splice(i, 1);
    }
    const tail = { role: 'user', content: summaryRequest.prompt };
    summaryRequest.tailMessages.add(tail);
    messages.push(tail);
}

function onFinalPromptData(data, dryRun) {
    if (!dryRun && summaryRequest?.native) {
        if (summaryWasCancelled() || !isSameArchive(getContext(), summaryRequest.archiveInfo, summaryRequest.characterId)) {
            summaryRequest.cancelled = true;
            getContext()?.stopGeneration?.();
            return;
        }
        if (!Array.isArray(data.prompt)) {
            if (summaryRequest.position === 'tail') {
                if (typeof data.prompt === 'string') data.prompt += `\n\n${summaryRequest.prompt}`;
                else if (typeof data.input === 'string') data.input += `\n\n${summaryRequest.prompt}`;
            }
            summaryRequest.expectedBody = JSON.stringify(data);
            summaryRequest.sent = true;
        }
    }
    if (!promptProbe || !dryRun) return;
    promptProbe.data = structuredClone(data);
}

function onMainApiRequest(data) {
    if (summaryRequest?.sending && data.type === 'quiet' && Array.isArray(data.messages)) {
        if (summaryWasCancelled() || !isSameArchive(getContext(), summaryRequest.archiveInfo, summaryRequest.characterId)) {
            summaryRequest.cancelled = true;
            getContext()?.stopGeneration?.();
            return;
        }
        appendSummaryTail(data.messages);
        // Quiet requests use the current connection, model and preset; tools
        // cannot replace the requested textual summary with a tool invocation.
        delete data.tools;
        delete data.tool_choice;
        if (summaryRequest.secondary) {
            // Set the destination in the owned request object as well as the
            // fetch adapter. A later hook cannot silently fall back to the
            // main provider merely by changing the serialized request body.
            const secondaryData = buildSecondaryRequest(getContext(), data, summaryRequest.secondary);
            for (const key of Object.keys(data)) delete data[key];
            Object.assign(data, secondaryData);
        }
        summaryRequest.sent = true;
        summaryRequest.expectedBody = JSON.stringify(data);
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
    const previousPreview = requestPreview;
    requestPreview = true;
    try {
        context.eventSource.makeLast?.('prompt_template_prepare', onTemplatePreviewContext);
        await context.eventSource.emit(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, generate_data);
        if (!Array.isArray(generate_data.messages)) throw new Error('主 API 提示词预览未返回消息列表。');
        return generate_data;
    } finally {
        requestPreview = previousPreview;
    }
}

function refreshFinalHooks() {
    const context = getContext();
    if (!context?.eventSource?.makeLast) return;
    context.eventSource.makeLast(context.eventTypes.GENERATE_AFTER_DATA, onFinalPromptData);
    context.eventSource.makeLast(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onMainApiRequest);
}

async function assemblePrompt(context) {
    if (typeof context.generate !== 'function') throw new Error('当前酒馆缺少提示词组装接口，请更新稳定版。');
    if (promptProbe) throw new Error('正在组装另一份提示词，请稍后再试。');
    const probe = { data: null };
    promptProbe = probe;
    const previousPreview = requestPreview;
    requestPreview = true;
    try {
        refreshFinalHooks();
        context.eventSource.makeLast?.('prompt_template_prepare', onTemplatePreviewContext);
        // Dry run assembles the preset, history and conditional world info,
        // without consuming the input box or sending a model request.
        await context.generate('normal', {}, true);
        if (!probe.data) throw new Error('酒馆未返回完整提示词，尚未调用主 API。');
        return probe.data;
    } finally {
        promptProbe = null;
        requestPreview = previousPreview;
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

function stripReasoning(text, template = getContext()?.powerUserSettings?.reasoning) {
    let content = String(text ?? '');
    const prefix = template?.prefix;
    const suffix = template?.suffix;
    if (!prefix || !suffix) return content.trim();
    // Literal delimiters match ST's selected template, including custom tags.
    // Remove every wrapped block; keep all non-reasoning text verbatim.
    let offset = 0;
    while (true) {
        const start = content.indexOf(prefix, offset);
        if (start < 0) break;
        const end = content.indexOf(suffix, start + prefix.length);
        if (end < 0) {
            // Never save the tail of an unfinished reasoning block.
            content = content.slice(0, start);
            break;
        }
        content = content.slice(0, start) + content.slice(end + suffix.length);
        offset = start;
    }
    return content.trim();
}

function getSecondaryConfig(source = settings, requireModel = true) {
    let url;
    try { url = new URL(String(source.secondaryUrl ?? '').trim()); }
    catch { throw new Error('喵，请填好副 API 的 http / https 地址。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('喵，副 API 地址只填基础 URL，Key 请放在下面的密钥框里。');
    }
    url.pathname = url.pathname.replace(/\/(?:chat\/completions|completions|models)\/?$/i, '').replace(/\/+$/, '') || '/v1';
    const key = String(source.secondaryKey ?? '').trim().replace(/^Bearer\s+/i, '');
    if (/[\r\n]/.test(key)) throw new Error('喵，副 API 的 Key 不能换行。');
    const model = String(source.secondaryModel ?? '').trim();
    if (requireModel && !model) throw new Error('喵，先拉取并选择副 API 模型，也可以手填模型名。');
    return { url: url.toString().replace(/\/$/, ''), key, model };
}

function secondaryHeaders(config) {
    // ST's custom endpoint merges these after its saved API key. Explicitly
    // override Authorization even for a keyless endpoint; never borrow a key.
    return JSON.stringify({ Authorization: config.key ? `Bearer ${config.key}` : '' });
}

function buildSecondaryRequest(context, original, config) {
    const messages = Array.isArray(original.messages) ? original.messages
        : Array.isArray(original.prompt) ? original.prompt
            : [{ role: 'user', content: original.prompt ?? original.input }];
    if (!messages.length || messages.some(message => typeof message?.content !== 'string' && !Array.isArray(message?.content))) {
        throw new Error('喵，酒馆没有组装出可发送给副 API 的提示词。');
    }
    const payload = {
        type: 'quiet', chat_completion_source: 'custom', model: config.model,
        messages: structuredClone(messages), stream: false, n: 1,
        custom_url: config.url, custom_include_headers: secondaryHeaders(config),
        custom_prompt_post_processing: original.custom_prompt_post_processing ?? 'none',
        max_tokens: Math.max(1, Math.floor(Number(original.max_tokens ?? original.max_completion_tokens ?? original.max_length
            ?? context.chatCompletionSettings?.openai_max_tokens) || 8192)),
        user_name: original.user_name ?? context.name1, char_name: original.char_name ?? context.name2,
    };
    for (const field of ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'seed']) {
        if (Number.isFinite(original[field])) payload[field] = original[field];
    }
    if (Array.isArray(original.stop)) payload.stop = original.stop.filter(value => typeof value === 'string');
    return payload;
}

async function fetchSecondaryModels({ silent = false } = {}) {
    if (sendLockDepth) return;
    let config;
    const label = ui.querySelector('.als-model-status');
    try { config = getSecondaryConfig(settingsDraft, false); }
    catch (error) {
        if (!silent) notify('warning', error.message);
        label.textContent = error.message;
        return;
    }
    const revision = ++modelFetchRevision;
    modelFetchController?.abort();
    const controller = new AbortController();
    modelFetchController = controller;
    const button = ui.querySelector('.als-model-fetch');
    button.disabled = true;
    label.textContent = '喵喵正在找可用模型…';
    const unchanged = () => revision === modelFetchRevision
        && settingsDraft.secondaryUrl === sourceUrl && settingsDraft.secondaryKey === sourceKey;
    const sourceUrl = settingsDraft.secondaryUrl;
    const sourceKey = settingsDraft.secondaryKey;
    try {
        const response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST', headers: getContext().getRequestHeaders(),
            body: JSON.stringify({ chat_completion_source: 'custom', custom_url: config.url,
                custom_include_headers: secondaryHeaders(config) }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok) throw new Error(`模型没拉到喵（HTTP ${response.status}），检查一下 URL 和 Key。`);
        const data = await response.json();
        if (data?.error || !Array.isArray(data?.data)) throw new Error('喵，副 API 没有返回 OpenAI 格式的模型列表；也可以手填模型名。');
        const models = [...new Set(data.data.map(model => typeof model === 'string' ? model : model?.id)
            .filter(model => typeof model === 'string' && model.trim()).map(model => model.trim()))].sort();
        if (!unchanged()) return;
        settingsDraft.secondaryModels = models;
        renderModelOptions();
        syncSettingsState();
        label.textContent = models.length ? `找到 ${models.length} 个模型喵，选好后记得保存设置。` : '喵，列表是空的，可以直接填写模型名。';
    } catch (error) {
        if (!unchanged()) return;
        label.textContent = error.name === 'TimeoutError' ? '拉取模型超时了喵，可以重试或手填模型名。'
            : error.name === 'AbortError' ? '本次模型拉取已取消喵。' : error.message;
        if (!silent) notify('warning', label.textContent);
    } finally {
        if (revision === modelFetchRevision) {
            modelFetchController = null;
            button.disabled = Boolean(sendLockDepth);
        }
    }
}

function renderModelOptions() {
    const list = ui?.querySelector('.als-model-options');
    if (!list) return;
    list.replaceChildren(...(settingsDraft.secondaryModels ?? []).map(model => {
        const option = document.createElement('option');
        option.value = model;
        return option;
    }));
}

function scheduleModelFetch() {
    if (modelFetchTimer) clearTimeout(modelFetchTimer);
    modelFetchTimer = setTimeout(() => {
        modelFetchTimer = null;
        if (settingsDraft.apiMode === 'secondary' && settingsDraft.secondaryUrl.trim()) void fetchSecondaryModels({ silent: true });
    }, 400);
}

async function requestMainApiSummary(context, prompt) {
    if (typeof context.generate !== 'function') throw new Error('当前酒馆缺少后台生成接口。');
    const secondary = settings.apiMode === 'secondary' ? getSecondaryConfig() : null;
    const archiveInfo = await ensureArchive(context);
    assertSummaryActive();
    const request = {
        prompt, position: settings.instructionPosition, archiveInfo, characterId: context.characterId,
        tailMessages: new WeakSet(), native: true, afterCommands: true, sending: true, sent: false,
        expectedBody: null, rawText: null, cancelled: false,
        secondary,
    };
    summaryRequest = request;
    const reasoningTemplate = { ...context.powerUserSettings?.reasoning };
    const originalFetch = globalThis.fetch;
    let observing = true;
    // ST's normal quiet pipeline can discard an entire custom-format reply in
    // output regex cleanup. Observe only this exact non-streaming API request,
    // preserving its raw content without bypassing sending-side processing.
    const observeSummaryResponse = async function(input, init) {
        const url = typeof input === 'string' ? input : input?.url ?? String(input);
        const matches = observing && request.expectedBody && init?.body === request.expectedBody
            && /\/api\/(?:backends\/[^/]+\/generate|novelai\/generate|horde\/generate)(?:[?#]|$)/.test(url);
        if (observing && secondary && request.expectedBody && !matches && typeof init?.body === 'string'
            && /\/api\/(?:backends\/[^/]+\/generate|novelai\/generate|horde\/generate)(?:[?#]|$)/.test(url)
            && init.body.includes(JSON.stringify(request.prompt).slice(1, -1))) {
            throw new Error('喵，其他扩展改写了这次模型请求，已取消副 API 总结，请重试。');
        }
        let response;
        if (matches && secondary) {
            assertSummaryActive();
            const payload = buildSecondaryRequest(context, JSON.parse(init.body), secondary);
            response = await originalFetch.call(globalThis, '/api/backends/chat-completions/generate', {
                ...init, method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(payload),
            });
            assertSummaryActive();
            if (!response.ok) throw new Error(`副 API 请求失败了喵（HTTP ${response.status}），检查一下 URL、Key 和模型。`);
            const raw = await response.json();
            if (raw?.error) throw new Error('副 API 返回错误了喵，检查一下连接信息和模型。');
            request.rawText = extractSummaryText(raw);
            // Let the native quiet flow finish with the same body regardless
            // of the main API's reply schema. No main-model request is sent.
            const text = request.rawText;
            return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, text }],
                results: [{ text }], output: text, text, content: [{ type: 'text', text }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        response = await originalFetch.call(globalThis, input, init);
        if (matches && response.ok) {
            try {
                const raw = await response.clone().json();
                const extracted = typeof context.extractMessageFromData === 'function'
                    ? context.extractMessageFromData(raw) : null;
                request.rawText = typeof extracted === 'string' || extracted instanceof String
                    ? String(extracted) : extractSummaryText(raw);
            } catch {
                // Let ST handle response errors; never save a speculative result.
            }
        }
        return response;
    };
    const originalInjection = context.extensionPrompts?.[SUMMARY_INJECTION_ID];
    let injected = null;
    try {
        if (request.position !== 'tail') {
            if (typeof context.setExtensionPrompt !== 'function') throw new Error('酒馆缺少提示词层级注入接口。');
            context.setExtensionPrompt(SUMMARY_INJECTION_ID, prompt, INSTRUCTION_POSITIONS[request.position],
                settings.instructionDepth, false, settings.instructionRole,
                () => summaryRequest === request && !request.cancelled);
            injected = context.extensionPrompts?.[SUMMARY_INJECTION_ID];
        }
        globalThis.fetch = observeSummaryResponse;
        refreshFinalHooks();
        // Use the actual quiet generation flow: regex, world info, extension
        // interceptors, EJS conditions, presets and current main API all run.
        const response = await context.generate('quiet', {}, false);
        assertSummaryActive();
        if (request.cancelled || !isSameArchive(getContext(), archiveInfo, context.characterId)) {
            throw new Error('生成期间聊天存档已切换，本次总结已取消。');
        }
        if (!request.sent) throw new Error(secondary
            ? '喵，副 API 总结还没进入酒馆发送流程，请先保持酒馆当前主连接可用，再试一次。'
            : '酒馆没有发出大总结请求，请确认主 API 已连接。');
        const text = stripReasoning(request.rawText ?? extractSummaryText(response), reasoningTemplate);
        if (!text) throw new Error(`${secondary ? '副' : '主'} API 没有返回可保存的总结正文喵（可能只有推理内容）。旧楼层未隐藏。`);
        return text;
    } finally {
        observing = false;
        request.expectedBody = null;
        request.rawText = null;
        if (globalThis.fetch === observeSummaryResponse) globalThis.fetch = originalFetch;
        if (injected && context.extensionPrompts?.[SUMMARY_INJECTION_ID] === injected) {
            if (originalInjection) context.extensionPrompts[SUMMARY_INJECTION_ID] = originalInjection;
            else delete context.extensionPrompts[SUMMARY_INJECTION_ID];
        }
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
            settings[key] = structuredClone(value);
        }
    }
    settings.pendingRetries ??= [];
    if (!['main', 'secondary'].includes(settings.apiMode)) settings.apiMode = 'main';
    for (const key of ['secondaryUrl', 'secondaryKey', 'secondaryModel']) {
        if (typeof settings[key] !== 'string') settings[key] = '';
    }
    if (!Array.isArray(settings.secondaryModels)) settings.secondaryModels = [];
    if (!Object.hasOwn(MODE_LABELS, settings.mode)) settings.mode = 'incremental';
    if (!Object.hasOwn(INSTRUCTION_POSITIONS, settings.instructionPosition)) settings.instructionPosition = 'tail';
    settings.instructionDepth = Math.min(10000, Math.max(0, Math.floor(Number(settings.instructionDepth) || 0)));
    if (![0, 1, 2].includes(settings.instructionRole)) settings.instructionRole = 0;
    let migrated = false;
    if (!settings.prompts || typeof settings.prompts !== 'object' || Array.isArray(settings.prompts)) {
        settings.prompts = {
            incremental: typeof previousPrompt === 'string' && previousPrompt && previousPrompt !== LEGACY_DEFAULT_PROMPT ? previousPrompt : DEFAULT_PROMPT,
            merged: DEFAULT_MERGED_PROMPT,
        };
        migrated = true;
    }
    if (typeof settings.prompts.incremental !== 'string') settings.prompts.incremental = DEFAULT_PROMPT;
    if (typeof settings.prompts.merged !== 'string') settings.prompts.merged = DEFAULT_MERGED_PROMPT;
    settings.prompt = settings.prompts[settings.mode];
    if (migrated) context.saveSettingsDebounced?.();
    return settings;
}

function saveSettings() {
    getContext()?.saveSettingsDebounced?.();
}

async function persistSettingsNow() {
    saveSettings();
    enabledSaveChain = enabledSaveChain.catch(() => {}).then(async () => {
        const native = await import('/script.js');
        if (typeof native.saveSettings !== 'function') throw new Error('喵，酒馆没有提供立即保存设置的接口，请升级稳定版。');
        const context = getContext();
        const event = context?.eventTypes?.SETTINGS_UPDATED;
        if (!event || typeof context.eventSource?.removeListener !== 'function') {
            throw new Error('喵，酒馆缺少保存确认接口，请升级稳定版后重试。');
        }
        let confirmed = false;
        const onSaved = () => { confirmed = true; };
        context.eventSource.on(event, onSaved);
        try {
            await native.saveSettings();
            if (!confirmed) throw new Error('喵，酒馆没有确认设置已写入，请检查连接后再保存一次。');
        } finally {
            context.eventSource.removeListener(event, onSaved);
        }
    });
    return await enabledSaveChain;
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
        archive.summaryStillOverThreshold = false;
        changed = true;
    }
    if (archive.worldBookName && archive.worldBookName !== settings.worldBookName) {
        archive.lastSummarizedThrough = -1;
        archive.round = 0;
        archive.autoTriggerArmed = true;
        archive.summaryStillOverThreshold = false;
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
        label.textContent = !exists ? '还没建好喵 · 首次总结会自动创建并全局启用'
            : mounted ? '世界书建好并全局启用啦喵' : '世界书建好啦喵 · 下次总结会自动全局启用';
    } catch (error) {
        label.textContent = meowText(`无法读取世界书状态：${error.message}`);
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
    const template = context.powerUserSettings?.reasoning;
    if (template?.prefix && template?.suffix) {
        for (const entry of listOwnedEntries(data)) {
            for (const target of [entry, ...(entryMetadata(entry)?.records ?? [])]) {
                if (typeof target.content !== 'string' || !target.content.includes(template.prefix)
                    || !target.content.includes(template.suffix)) continue;
                const clean = stripReasoning(target.content, template);
                // Preserve an old record when it has no recoverable正文.
                if (clean && clean !== target.content) { target.content = clean; changed = true; }
            }
        }
    }
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
    // User-hidden history is excluded by ST. Do not start a summary solely to
    // reapply a visibility rule to messages that the user already hid.
    if (!chat.slice(coveredFrom, coveredTo + 1).some(message => !message.is_system && String(message.mes ?? '').trim())) return null;
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
    const native = await import('/script.js');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const current = getContext();
        if (!current || current.chatId !== expectedChatId || current.characterId !== context.characterId) return false;
        const streaming = current.streamingProcessor && !current.streamingProcessor.isFinished;
        if (!streaming && !native.is_send_press && !native.isGenerating?.()
            && document.body.dataset.generating !== 'true') return true;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
}

async function runLargeSummary({ manual = false } = {}) {
    if (runInProgress || (manual && thresholdCheckInProgress)) return false;
    const context = getContext();
    const current = getCharacterAndChat(context);
    if (!context || !current) {
        if (manual) notify('warning', '请先打开一个角色卡的聊天存档。');
        return;
    }
    if (!canSummarize(context, !manual)) {
        if (manual) notify('warning', '请填写总结提示词。');
        return;
    }

    runInProgress = true;
    lockSending();
    setStatus('正在后台生成大总结，暂时暂停发送…');
    activeRun = {
        chatId: current.chatId, characterId: context.characterId, archiveId: null, committed: false,
        automatic: !manual, cancelled: false, enabledRevision, manualVisibilityRevision,
    };
    let toast = null;
    const showProgress = message => {
        if (toast) window.toastr?.clear?.(toast);
        toast = notify('info', message, '喵喵大总结', {
            timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false,
        });
    };
    let summaryCommitted = false;
    try {
        if (!await waitForCurrentGeneration(context, current.chatId)) {
            setStatus('当前生成尚未结束或聊天已切换，本次总结已取消。');
            if (manual) notify('warning', '当前生成尚未结束或聊天存档已切换，请稍后再试。');
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
        assertSummaryActive();
        const archiveInfo = await ensureArchive(context);
        if (!archiveInfo) return;
        activeRun.archiveId = archiveInfo.archive.archiveId;
        await ensureWorldBook(context);
        await setArchiveActivation(archiveInfo.archive.archiveId, { reconcileCursor: true });
        assertSummaryActive();
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
            if (manual) notify('info', '没有可总结的旧楼层。');
            return;
        }
        const sourceSnapshot = captureMessageRange(context.chat, range.coveredTo);
        const mode = settings.mode;
        const prompt = context.substituteParamsExtended
            ? await context.substituteParamsExtended(settings.prompt)
            : settings.prompt;
        if (!String(prompt ?? '').trim()) throw new Error('总结提示词为空。');
        assertSummaryActive();

        showProgress('正在大总结中，请等待…');
        const summary = await requestMainApiSummary(context, String(prompt));
        assertSummaryActive();
        const latestContext = getContext();
        const latestIdentity = getCharacterAndChat(latestContext);
        if (!summary || !String(summary).trim()) throw new Error('总结 API 没有返回正文喵。');
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
            notify('warning', '生成期间旧楼层发生变化，这次结果未保存也未隐藏楼层。', '喵喵大总结');
            return;
        }

        showProgress('大总结已返回，正在保存世界书…');
        const data = await ensureWorldBook(latestContext);
        assertSummaryActive();
        if (!isSameArchive(getContext(), archiveInfo, context.characterId)
            || !messageRangeMatches(getContext().chat, sourceSnapshot)) {
            notify('warning', '保存前聊天发生变化，这次结果未保存也未隐藏楼层。', '喵喵大总结');
            return;
        }
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
        summaryCommitted = true;
        activeRun.committed = true;
        showProgress('大总结保存成功，正在处理旧楼层…');
        await latestContext.updateWorldInfoList?.();
        latestContext.reloadWorldInfoEditor?.(settings.worldBookName);

        if (!isSameArchive(getContext(), archiveInfo, context.characterId)) {
            console.warn('[自动大总结] 世界书已保存，但聊天存档已经切换；没有修改楼层可见状态。');
            notify('info', '大总结保存成功；聊天已切换，没有隐藏楼层。', '喵喵大总结');
            return;
        }
        const currentArchive = latestContext.chatMetadata[MODULE_NAME];
        currentArchive.lastSummarizedThrough = range.coveredTo;
        currentArchive.round = round;
        currentArchive.worldBookName = settings.worldBookName;
        await latestContext.saveMetadata?.();
        if (settings.pendingRetries.includes(archiveInfo.archive.archiveId)) {
            settings.pendingRetries = settings.pendingRetries.filter(id => id !== archiveInfo.archive.archiveId);
            saveSettings();
        }

        const liveContext = getContext();
        assertSummaryActive();
        if (!isSameArchive(liveContext, archiveInfo, context.characterId)
            || !messageRangeMatches(liveContext.chat, sourceSnapshot)) {
            console.warn('[自动大总结] 保存过程中聊天发生变化；保留总结记录，没有隐藏楼层。');
            notify('info', '大总结保存成功；聊天已变化，没有隐藏楼层。', '喵喵大总结');
            return;
        }
        const hideStart = 0;
        const hideEnd = Math.min(range.coveredTo, liveContext.chat.length - range.keepRecent - 1);
        if (hideEnd >= hideStart) {
            setStatus('大总结已保存，正在隐藏旧楼层…');
            if (typeof liveContext.executeSlashCommandsWithOptions !== 'function') throw new Error('总结已保存，但酒馆缺少隐藏楼层接口。');
            // Exactly one native /hide after this newly saved summary.
            // Outside this transaction, manual visibility stays untouched.
            let result;
            summaryHideInProgress = true;
            try {
                result = await liveContext.executeSlashCommandsWithOptions(`/hide ${hideStart}-${hideEnd}`);
            } finally {
                summaryHideInProgress = false;
            }
            assertSummaryActive();
            if (result?.isError || liveContext.chat.slice(hideStart, hideEnd + 1).some(message => !message.is_system)) {
                throw new Error('总结已保存，但旧楼层未全部隐藏，请检查 /hide 命令。');
            }
        }
        currentArchive.autoTriggerArmed = false;
        await liveContext.saveMetadata?.();
        setStatus(`第 ${round} 次大总结已保存，已隐藏旧楼层，可以继续对话。`);
        notify('success', `第 ${round} 次大总结保存成功，旧楼层已隐藏，可以继续对话。`, '喵喵大总结');
        if (manual) scheduleVisibilityRefresh(liveContext, { afterSummary: true });
        void renderDirectory();
        return true;
    } catch (error) {
        if (summaryWasCancelled()) {
            setStatus(summaryCommitted ? '总结记录已保存；本次自动隐藏已取消。' : '本次总结已取消。');
            notify('info', summaryCommitted ? '大总结保存成功；本次自动隐藏已取消。' : '本次大总结已取消，旧楼层未隐藏。', '喵喵大总结');
        } else {
            console.error('[喵喵大总结] 总结失败：', error);
            const failure = `${summaryCommitted ? '大总结已保存，但后续处理失败' : '大总结失败'}：${error?.message ?? error}`;
            notify('error', failure, '喵喵大总结');
            setStatus(`${failure}。已解除发送锁。`);
        }
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

function onGenerationAfterCommands(type, _options, dryRun) {
    refreshFinalHooks();
    if (dryRun) return;
    if (summaryRequest?.afterCommands && type === 'quiet') {
        summaryRequest.afterCommands = false;
        summaryRequest.interceptorPending = true;
        return;
    }
    // Event listeners must return promptly: a slash script may itself call
    // Generate, and waiting here can hold ST's command/busy state indefinitely.
    if (sendLockDepth) return;
    const context = getContext();
    const current = getCharacterAndChat(context);
    pendingGeneration = canSummarize(context, true) && ['normal', 'continue'].includes(type) ? {
        token: ++generationToken, chatId: current.chatId, characterId: context.characterId,
        manualVisibilityRevision,
        received: false, ended: false, locked: false,
    } : null;
}

globalThis.meowLargeSummaryGenerationInterceptor = (_chat, _contextSize, abort, type) => {
    if (type === 'quiet' && summaryRequest?.interceptorPending && !summaryWasCancelled()) {
        summaryRequest.interceptorPending = false;
        return;
    }
    if (!sendLockDepth) return;
    // The supported ST interceptor aborts a model generation after slash
    // parsing. Local commands never reach it, and no waiter holds their script.
    abort(true);
    notify('info', '正在检查上下文或进行大总结，请处理完成后再生成。', '喵喵大总结', { preventDuplicates: true });
};

async function checkAfterReply(pending) {
    thresholdCheckInProgress = true;
    const startEnabledRevision = enabledRevision;
    const startVisibilityRevision = pending.manualVisibilityRevision ?? manualVisibilityRevision;
    const stillEnabled = () => settings.enabled && enabledRevision === startEnabledRevision
        && manualVisibilityRevision === startVisibilityRevision
        && getContext()?.chatId === pending.chatId && getContext()?.characterId === pending.characterId;
    try {
        const context = getContext();
        if (context?.chatId !== pending.chatId || context?.characterId !== pending.characterId
            || !canSummarize(context, true)) return;
        if (!stillEnabled() || !await waitForCurrentGeneration(context, pending.chatId) || !stillEnabled()) return;
        const archiveInfo = await ensureArchive(context);
        if (!archiveInfo || !stillEnabled()) return;
        const snapshot = captureMessageRange(context.chat, context.chat.length - 1);
        const data = await assemblePrompt(context);
        const count = await countAssembledPrompt(context, data);
        if (!Number.isFinite(count)) throw new Error('酒馆返回了无效的 token 数。');
        if (!stillEnabled() || !isSameArchive(getContext(), archiveInfo, context.characterId)
            || !messageRangeMatches(getContext().chat, snapshot)) return;
        const threshold = Math.max(1, Number(settings.threshold) || DEFAULT_SETTINGS.threshold);
        archiveInfo.archive.lastPromptTokens = count;
        await renderNativeTokenCounter(context);
        if (!stillEnabled()) return;
        setStatus(`${pending.onOpen ? '当前存档' : '本轮回复后'}上下文：${count.toLocaleString()} / ${threshold.toLocaleString()} token`);
        if (count < threshold) {
            archiveInfo.archive.autoTriggerArmed = true;
            archiveInfo.archive.summaryStillOverThreshold = false;
            await context.saveMetadata?.();
            return;
        }
        if (archiveInfo.archive.summaryStillOverThreshold) {
            setStatus(`喵，本档总结后仍超阈值，已暂停连续自动总结。当前 ${count.toLocaleString()} / ${threshold.toLocaleString()} token，请先调整设置或手动处理。`);
            return;
        }
        if ((archiveInfo.archive.autoTriggerArmed === false && !pending.onOpen)
            || !eligibleUncoveredRange(context, archiveInfo, false)) return;
        archiveInfo.archive.autoTriggerArmed = false;
        await context.saveMetadata?.();
        if (!stillEnabled()) return;
        const completed = await runLargeSummary();
        if (completed && stillEnabled() && isSameArchive(getContext(), archiveInfo, context.characterId)) {
            const after = await countAssembledPrompt(getContext(), await assemblePrompt(getContext()));
            if (!Number.isFinite(after)) throw new Error('喵，酒馆返回了无效的总结后 token 数。');
            if (!stillEnabled() || !isSameArchive(getContext(), archiveInfo, context.characterId)) return;
            archiveInfo.archive.lastPromptTokens = after;
            await renderNativeTokenCounter(getContext());
            if (!stillEnabled()) return;
            reportSummaryTokenCount(archiveInfo.archive, after);
            await getContext().saveMetadata?.();
        }
    } catch (error) {
        if (!stillEnabled()) return;
        console.error('[喵喵大总结] 回复后阈值检查失败：', error);
        setStatus(`阈值检查失败：${error.message}。已解除发送锁。`);
        notify('error', `大总结阈值检查失败：${error.message}`);
    } finally {
        thresholdCheckInProgress = false;
        if (pending.locked) {
            pending.locked = false;
            unlockSending();
        }
    }
}

function reportSummaryTokenCount(archive, count) {
    const threshold = Math.max(1, Number(settings.threshold) || DEFAULT_SETTINGS.threshold);
    const over = count >= threshold;
    archive.autoTriggerArmed = !over;
    archive.summaryStillOverThreshold = over;
    if (over) {
        const message = `总结已保存喵，但当前仍有 ${count.toLocaleString()} / ${threshold.toLocaleString()} token。已停止连续自动总结，请减少保留楼层、精简预设或世界书，或手动切换合并模式处理；原总结记录已保留。`;
        setStatus(message);
        notify('warning', message, '喵喵大总结', { timeOut: 12000, closeButton: true });
    } else setStatus(`大总结完成，当前上下文：${count.toLocaleString()} token，可以继续对话喵。`);
}

function maybeSchedulePending() {
    if (!settings.enabled) { cancelPendingAutoSummary(); return; }
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
    installVisibilityCommandHooks();
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
    const startVisibilityRevision = manualVisibilityRevision;
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
        if (checkThreshold && manualVisibilityRevision === startVisibilityRevision && current && canSummarize(context, true)) {
            await checkAfterReply({ chatId: current.chatId, characterId: context.characterId, onOpen: true, locked: false });
        } else {
            setStatus(current ? `总结条目已同步。${settings.enabled ? '' : '自动总结未启用。'}` : '请选择角色卡的聊天存档。');
        }
    });
    chatSyncChain = operation.catch(error => {
        if (revision === chatSyncRevision) {
            console.error('[喵喵大总结] 存档同步失败：', error);
            setStatus(`存档同步失败：${error.message}`);
            notify('error', `大总结存档同步失败：${error.message}`);
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
                round: remaining.at(-1)?.round ?? 0, autoTriggerArmed: true, summaryStillOverThreshold: false,
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
        notify('success', roundOnly ? '本轮总结已删除。' : '聊天档的总结条目已删除。');
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
        tree.append(createElement('p', 'als-muted', rows.length ? '喵，没找到匹配的角色或聊天档。' : '小窝还空着喵，首次总结会自动建好并启用世界书。'));
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
                void deleteSummarySelection().catch(error => notify('error', error.message));
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
    ui.querySelector('.als-settings-mode').value = settingsDraft.mode;
    ui.querySelector('.als-prompt-mode').value = promptEditorMode;
    const draft = promptDrafts[promptEditorMode] ?? settings.prompts[promptEditorMode];
    ui.querySelector('.als-prompt').value = draft;
    ui.querySelector('.als-mode-description').textContent = settingsDraft.mode === 'incremental'
        ? '每轮只记新增剧情喵，接着写进这个聊天档的原条目。'
        : '把旧总结和新剧情整理到一起喵，用新全文替换原条目，历史记录仍会留着。';
    ui.querySelector('.als-prompt-state').textContent = draft === settings.prompts[promptEditorMode] ? '提示词已经记住喵' : '还没保存喵';
}

function changeMode(mode) {
    if (sendLockDepth || !Object.hasOwn(MODE_LABELS, mode)) return;
    promptEditorMode = mode;
    syncPromptEditor();
}

async function savePromptDraft() {
    if (sendLockDepth) return;
    const draft = ui.querySelector('.als-prompt').value;
    if (!draft.trim()) {
        notify('warning', '提示词不能为空。');
        return;
    }
    const mode = promptEditorMode;
    const previous = settings.prompts[mode];
    promptDrafts[mode] = draft;
    settings.prompts[mode] = draft;
    settings.prompt = settings.prompts[settings.mode];
    lockSending();
    try {
        await persistSettingsNow();
        syncPromptEditor();
        notify('success', `${MODE_LABELS[promptEditorMode]}提示词已保存，刷新或重启也会记得喵。`);
    } catch (error) {
        settings.prompts[mode] = previous;
        settings.prompt = settings.prompts[settings.mode];
        ui.querySelector('.als-prompt-state').textContent = '保存没有成功喵，请重试。';
        notify('error', `提示词保存失败：${error.message}`);
    } finally {
        unlockSending();
    }
}

function bindInput(selector, key, transform = value => value) {
    const input = ui.querySelector(selector);
    const handler = () => {
        settingsDraft[key] = transform(input.type === 'checkbox' ? input.checked : input.value);
        if (key === 'mode') syncPromptEditor();
        syncSettingsState();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
}

function syncSettingsState() {
    ui.querySelector('.als-settings-state').textContent = SETTING_FIELDS.some(key => key === 'secondaryModels'
        ? JSON.stringify(settingsDraft[key]) !== JSON.stringify(settings[key]) : settingsDraft[key] !== settings[key])
        ? '有设置还没记住喵，点击保存设置后生效' : '设置已保存喵';
    const atDepth = settingsDraft.instructionPosition === 'depth';
    ui.querySelector('.als-instruction-depth-field').hidden = !atDepth;
    ui.querySelector('.als-instruction-role-field').hidden = settingsDraft.instructionPosition === 'tail';
    const secondary = ui.querySelector('.als-secondary-settings');
    if (secondary) secondary.hidden = settingsDraft.apiMode !== 'secondary';
}

function populateSettingsDraft() {
    const controls = {
        enabled: '.als-enabled', threshold: '.als-threshold', keepRecent: '.als-keep',
        worldBookName: '.als-book', depth: '.als-depth', mode: '.als-settings-mode',
        instructionPosition: '.als-instruction-position', instructionDepth: '.als-instruction-depth',
        instructionRole: '.als-instruction-role',
        apiMode: '.als-api-mode', secondaryUrl: '.als-secondary-url',
        secondaryKey: '.als-secondary-key', secondaryModel: '.als-secondary-model',
    };
    for (const [key, selector] of Object.entries(controls)) {
        const input = ui.querySelector(selector);
        if (input.type === 'checkbox') input.checked = Boolean(settingsDraft[key]);
        else input.value = settingsDraft[key];
    }
    syncPromptEditor();
    renderModelOptions();
    syncSettingsState();
}

async function saveSettingsDraft() {
    if (sendLockDepth) return;
    const name = String(settingsDraft.worldBookName).trim();
    if (!name || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
        notify('warning', '请填写有效的世界书名称。');
        return;
    }
    if (settingsDraft.apiMode === 'secondary') {
        try {
            const config = getSecondaryConfig(settingsDraft);
            settingsDraft.secondaryUrl = config.url;
            settingsDraft.secondaryKey = config.key;
            settingsDraft.secondaryModel = config.model;
        } catch (error) {
            notify('warning', error.message);
            return;
        }
    }
    archiveEditInProgress = true;
    lockSending();
    const previousSettings = Object.fromEntries(SETTING_FIELDS.map(key => [key, structuredClone(settings[key])]));
    const saveEnabledRevision = enabledRevision;
    try {
        const context = getContext();
        if (name !== settings.worldBookName) {
            const previous = await prepareWorldBook(context, settings.worldBookName, { create: false });
            const owned = listOwnedEntries(previous);
            if (owned.some(entry => !entry.disable)) {
                for (const entry of owned) { entry.disable = true; entry.constant = false; }
                await context.saveWorldInfo(settings.worldBookName, previous, true);
                const verified = await prepareWorldBook(context, settings.worldBookName, { create: false });
                if (owned.some(entry => !verified?.entries?.[entry.uid]?.disable)) throw new Error('旧世界书条目未成功关闭，设置尚未保存。');
                context.reloadWorldInfoEditor?.(settings.worldBookName);
            }
        }
        settingsDraft.worldBookName = name;
        const enabledChanged = settings.enabled !== settingsDraft.enabled;
        Object.assign(settings, settingsDraft);
        if (enabledChanged) {
            enabledRevision += 1;
            if (!settings.enabled) cancelPendingAutoSummary();
        }
        settings.prompt = settings.prompts[settings.mode];
        await persistSettingsNow();
        directoryData = null;
        selectedSummary = null;
        ui.querySelector('.als-preview-box').hidden = true;
        populateSettingsDraft();
        notify('success', '设置已保存喵。');
    } catch (error) {
        const liveEnabled = settings.enabled;
        Object.assign(settings, previousSettings);
        if (enabledRevision !== saveEnabledRevision) settings.enabled = liveEnabled;
        settings.prompt = settings.prompts[settings.mode];
        syncSettingsState();
        notify('error', error.message);
        return;
    } finally {
        archiveEditInProgress = false;
        unlockSending();
    }
    void scheduleChatSync();
}

async function getInstalledExtension() {
    const match = new URL(import.meta.url).pathname.match(/\/third-party\/([^/]+)\//);
    if (!match) throw new Error('无法确认插件安装目录，请使用酒馆扩展管理页面更新。');
    const folder = decodeURIComponent(match[1]);
    const response = await fetch('/api/extensions/discover', { cache: 'no-store' });
    if (!response.ok) throw new Error(`无法读取扩展列表（HTTP ${response.status}）。`);
    const extensions = await response.json();
    const extension = extensions.find(item => item.name?.replaceAll('\\', '/').split('/').at(-1) === folder);
    if (!extension || !['global', 'local'].includes(extension.type)) throw new Error('没有找到此插件的 Git 安装目录。');
    return { extensionName: folder, global: extension.type === 'global' };
}

async function extensionApi(action, installation) {
    const response = await fetch(`/api/extensions/${action}`, {
        method: 'POST', headers: getContext().getRequestHeaders(),
        body: JSON.stringify(installation),
    });
    if (!response.ok) throw new Error(`插件${action === 'update' ? '更新' : '检查'}失败（HTTP ${response.status}），请查看酒馆服务器日志。`);
    return await response.json();
}

function renderUpdateNotice() {
    if (!ui) return;
    const visible = Boolean(availableUpdate && dismissedUpdate !== availableUpdate.key);
    ui.querySelector('.als-update-badge').hidden = !visible;
    ui.querySelector('.als-update-notice').hidden = !visible;
    if (visible) ui.querySelector('.als-update-title').textContent = `喵！发现新版本：${availableUpdate.version}`;
}

async function checkForUpdate({ silent = false } = {}) {
    if (updateCheckInProgress || updateInProgress) return;
    updateCheckInProgress = true;
    const label = ui.querySelector('.als-update-status');
    const button = ui.querySelector('.als-update-check');
    button.disabled = true;
    label.textContent = '喵喵正在看看有没有更新…';
    try {
        const installation = await getInstalledExtension();
        const version = await extensionApi('version', installation);
        if (typeof version.isUpToDate !== 'boolean') throw new Error('酒馆未返回有效的更新状态。');
        availableUpdate = null;
        if (!version.isUpToDate) {
            let remoteVersion = 'Git 新提交';
            const remote = String(version.remoteUrl ?? '').match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
            if (remote && version.currentBranchName) {
                try {
                    const branch = version.currentBranchName.split('/').map(encodeURIComponent).join('/');
                    const url = `https://raw.githubusercontent.com/${encodeURIComponent(remote[1])}/${encodeURIComponent(remote[2])}/${branch}/manifest.json`;
                    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
                    if (response.ok) {
                        const manifest = await response.json();
                        if (typeof manifest.version === 'string') remoteVersion = manifest.version;
                    }
                } catch { /* The ST Git check remains authoritative if version labels cannot be read. */ }
            }
            availableUpdate = { installation, version: remoteVersion, key: `${remoteVersion}:${version.currentCommitHash}` };
            label.textContent = `新版本到啦喵：${remoteVersion}`;
        } else label.textContent = `当前 v${EXTENSION_VERSION}，已经是最新版本喵`;
        renderUpdateNotice();
    } catch (error) {
        label.textContent = error.message;
        if (!silent) notify('warning', error.message);
    } finally {
        updateCheckInProgress = false;
        button.disabled = false;
    }
}

const UPDATE_DRAFT_KEY = `meow-summary-update-draft:${location.pathname}`;

export async function onExtensionUpdate() {
    notify('info', '喵喵大总结已更新，当前处理完成后自动刷新酒馆。');
    const native = await import('/script.js');
    while (sendLockDepth || runInProgress || thresholdCheckInProgress || archiveEditInProgress
        || native.is_send_press || native.isGenerating?.() || document.body.dataset.generating === 'true'
        || (getContext()?.streamingProcessor && !getContext().streamingProcessor.isFinished)) {
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    lockSending();
    try {
        const draft = document.querySelector('#send_textarea')?.value;
        if (draft) sessionStorage.setItem(UPDATE_DRAFT_KEY, JSON.stringify({ text: draft, time: Date.now() }));
        // Flush the debounced ST settings save before unloading this page.
        await persistSettingsNow();
        await enabledSaveChain;
        location.reload();
    } catch (error) {
        notify('error', `插件已更新，但自动刷新失败：${error.message}。请手动刷新酒馆。`);
    } finally {
        unlockSending();
    }
}

async function updateExtensionNow() {
    if (updateInProgress || sendLockDepth) return;
    updateInProgress = true;
    const button = ui.querySelector('.als-update-apply');
    button.disabled = true;
    button.textContent = '正在更新喵…';
    try {
        const installation = availableUpdate?.installation ?? await getInstalledExtension();
        await extensionApi('update', installation);
        await onExtensionUpdate();
    } catch (error) {
        notify('error', error.message);
        ui.querySelector('.als-update-status').textContent = error.message;
    } finally {
        updateInProgress = false;
        button.disabled = false;
        button.textContent = '更新';
    }
}

function restoreUpdateDraft() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(UPDATE_DRAFT_KEY) ?? 'null');
        sessionStorage.removeItem(UPDATE_DRAFT_KEY);
        const input = document.querySelector('#send_textarea');
        if (saved?.text && Date.now() - saved.time < 300000 && input && !input.value) {
            input.value = saved.text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } catch { /* Draft restoration must not prevent plugin initialization. */ }
}

async function renderSettings() {
    if (ui?.isConnected) return;
    ui = document.createElement('section');
    ui.id = 'auto_large_summary_settings';
    ui.className = 'als-settings';
    ui.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <div class="als-heading"><b>喵喵大总结</b><span class="als-update-badge" hidden>mewo!!</span></div>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="als-version">v${EXTENSION_VERSION} | by NUE-喵喵电波</div>
          <div class="als-update-notice" hidden>
            <span class="als-update-title"></span>
            <button type="button" class="menu_button als-update-apply">更新</button>
            <button type="button" class="als-update-dismiss" aria-label="关闭更新提示">×</button>
          </div>
          <div class="als-tabs" role="tablist" aria-label="喵喵大总结">
            <button type="button" class="als-tab als-tab-active" id="als-tab-settings" data-tab="settings" role="tab" aria-selected="true" aria-controls="als-panel-settings">喵喵设置</button>
            <button type="button" class="als-tab" id="als-tab-prompt" data-tab="prompt" role="tab" aria-selected="false" aria-controls="als-panel-prompt" tabindex="-1">提示词</button>
            <button type="button" class="als-tab" id="als-tab-directory" data-tab="directory" role="tab" aria-selected="false" aria-controls="als-panel-directory" tabindex="-1">总结小窝</button>
          </div>
          <div class="als-status" role="status" aria-live="polite">打开存档、普通回复结束后，喵喵会检查实际 token。</div>
          <div class="als-panel" id="als-panel-settings" data-panel="settings" role="tabpanel" aria-labelledby="als-tab-settings">
            <label class="als-check"><input class="als-enabled" type="checkbox"><span>启用</span></label>
            <small class="als-muted">开关会马上记住喵；下面的设置改好后，记得点“保存设置”。</small>
            <div class="als-grid">
              <label>触发 token 数<input class="text_pole als-threshold" type="number" min="1" step="1000"></label>
              <label>保留最近楼层<input class="text_pole als-keep" type="number" min="1" step="1"></label>
              <label>世界书名称<input class="text_pole als-book" type="text" maxlength="80"></label>
              <label>插入深度<input class="text_pole als-depth" type="number" min="0" step="1"></label>
            </div>
            <label class="als-field">大总结用哪个 API 喵？
              <select class="text_pole als-api-mode"><option value="main">酒馆主 API（跟随当前连接）</option><option value="secondary">副 API（OpenAI 兼容 / 自定义）</option></select>
            </label>
            <div class="als-secondary-settings" hidden>
              <small class="als-muted">副 API 只负责大总结喵，提示词环境仍沿用酒馆发送时的处理。</small>
              <label class="als-field">副 API 基础 URL<input class="text_pole als-secondary-url" type="url" placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false"></label>
              <label class="als-field">副 API Key（无密钥服务可留空）<input class="text_pole als-secondary-key" type="password" autocomplete="new-password" spellcheck="false"></label>
              <div class="als-model-state"><small class="als-model-status als-muted" role="status">填好 URL 和 Key 后，喵喵会帮你拉取模型。</small><button type="button" class="menu_button als-model-fetch">拉取模型</button></div>
              <label class="als-field">副 API 模型<input class="text_pole als-secondary-model" type="text" list="als-secondary-model-options" placeholder="从列表选择，也可以手填模型名" autocomplete="off" spellcheck="false"><datalist class="als-model-options" id="als-secondary-model-options"></datalist></label>
              <small class="als-muted">选好模型后和其他设置一起保存喵。采样与输出长度沿用当前生成参数。</small>
            </div>
            <label class="als-field">总结模式
              <select class="text_pole als-mode als-settings-mode"><option value="incremental">多次大总结</option><option value="merged">合并大总结</option></select>
            </label>
            <p class="als-mode-description als-muted"></p>
            <label class="als-field">大总结指令插入位置
              <select class="text_pole als-instruction-position">
                <option value="tail">全部提示词尾部（默认）</option>
                <option value="before">角色定义之前（↑ Char）</option>
                <option value="after">角色定义之后（↓ Char）</option>
                <option value="depth">插入聊天深度（@D）</option>
              </select>
            </label>
            <div class="als-grid">
              <label class="als-instruction-depth-field" hidden>指令深度<input class="text_pole als-instruction-depth" type="number" min="0" max="10000" step="1"></label>
              <label class="als-instruction-role-field" hidden>指令角色<select class="text_pole als-instruction-role"><option value="0">system（系统）</option><option value="1">user（用户）</option><option value="2">assistant（助手）</option></select></label>
            </div>
            <small class="als-muted">此处控制总结指令的位置；上方“插入深度”控制保存后的世界书条目。选择 @D、深度 0、system 即为 D0 系统层。</small>
            <div class="als-actions">
              <button type="button" class="menu_button als-settings-save">保存设置</button>
              <button type="button" class="menu_button als-settings-reset">回到默认设置</button>
            </div>
            <small class="als-settings-state als-muted" role="status">设置已经记住喵。</small>
            <div class="als-book-state">
              <span class="als-book-status als-muted">喵喵正在看看世界书…</span>
              <button type="button" class="menu_button als-book-check">刷新状态</button>
            </div>
            <button type="button" class="menu_button als-run">马上大总结喵</button>
            <small class="als-muted">第一次总结会自动建好并挂上全局世界书喵。每个聊天档一个条目，自动防止递归；只启用当前档。</small>
            <div class="als-update-state"><small class="als-update-status als-muted">喵，还没看看有没有更新</small><button type="button" class="menu_button als-update-check">检查更新</button></div>
          </div>
          <div class="als-panel" id="als-panel-prompt" data-panel="prompt" role="tabpanel" aria-labelledby="als-tab-prompt" hidden>
            <label class="als-field">编辑模式
              <select class="text_pole als-mode als-prompt-mode"><option value="incremental">多次大总结</option><option value="merged">合并大总结</option></select>
            </label>
            <label class="als-prompt-label">大总结提示词（支持 SillyTavern 宏）
              <textarea class="text_pole als-prompt" rows="13" spellcheck="false"></textarea>
            </label>
            <div class="als-actions">
              <button type="button" class="menu_button als-prompt-save">保存修改提示词</button>
              <button type="button" class="menu_button als-prompt-reset">回到默认提示词</button>
            </div>
            <small class="als-prompt-state als-muted" role="status">提示词已经记住喵。</small>
            <small class="als-muted">两种模式的提示词分开记住喵。这里选要编辑的模板；实际总结模式在“喵喵设置”里保存。点击保存后，刷新和重启都不会丢；回到默认只改编辑框，还要保存才生效。</small>
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
    settingsDraft = Object.fromEntries(SETTING_FIELDS.map(key => [key, settings[key]]));
    promptEditorMode = settings.mode;
    promptDrafts = { ...settings.prompts };
    populateSettingsDraft();
    ui.querySelector('.als-enabled').addEventListener('change', event => applyEnabledState(event.target.checked));
    bindInput('.als-threshold', 'threshold', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.threshold)));
    bindInput('.als-keep', 'keepRecent', value => Math.max(1, Math.floor(Number(value) || DEFAULT_SETTINGS.keepRecent)));
    bindInput('.als-book', 'worldBookName', value => String(value).trim());
    bindInput('.als-depth', 'depth', value => Math.max(0, Math.floor(Number(value) || 0)));
    bindInput('.als-settings-mode', 'mode', String);
    bindInput('.als-api-mode', 'apiMode', String);
    bindInput('.als-secondary-url', 'secondaryUrl', value => String(value).trim());
    bindInput('.als-secondary-key', 'secondaryKey', String);
    bindInput('.als-secondary-model', 'secondaryModel', value => String(value).trim());
    ui.querySelector('.als-model-fetch').addEventListener('click', () => void fetchSecondaryModels());
    ui.querySelector('.als-api-mode').addEventListener('change', () => {
        if (settingsDraft.apiMode === 'secondary' && !settingsDraft.secondaryModels.length) scheduleModelFetch();
    });
    for (const selector of ['.als-secondary-url', '.als-secondary-key']) {
        ui.querySelector(selector).addEventListener('input', () => {
            modelFetchRevision += 1;
            modelFetchController?.abort();
            modelFetchController = null;
            settingsDraft.secondaryModels = [];
            renderModelOptions();
            ui.querySelector('.als-model-fetch').disabled = Boolean(sendLockDepth);
            ui.querySelector('.als-model-status').textContent = '连接信息改好后，喵喵会重新找模型。';
            syncSettingsState();
        });
        ui.querySelector(selector).addEventListener('change', scheduleModelFetch);
    }
    bindInput('.als-instruction-position', 'instructionPosition', String);
    bindInput('.als-instruction-depth', 'instructionDepth', value => Math.min(10000, Math.max(0, Math.floor(Number(value) || 0))));
    bindInput('.als-instruction-role', 'instructionRole', Number);
    ui.querySelector('.als-prompt-mode').addEventListener('change', event => changeMode(event.target.value));
    ui.querySelector('.als-settings-save').addEventListener('click', () => void saveSettingsDraft());
    ui.querySelector('.als-settings-reset').addEventListener('click', () => {
        if (sendLockDepth) return;
        modelFetchRevision += 1;
        modelFetchController?.abort();
        modelFetchController = null;
        ui.querySelector('.als-model-fetch').disabled = false;
        ui.querySelector('.als-model-status').textContent = '填好 URL 和 Key 后，喵喵会帮你拉取模型。';
        settingsDraft = Object.fromEntries(SETTING_FIELDS.map(key => [key, structuredClone(DEFAULT_SETTINGS[key])]));
        populateSettingsDraft();
    });
    ui.querySelector('.als-update-check').addEventListener('click', () => void checkForUpdate());
    ui.querySelector('.als-update-apply').addEventListener('click', () => void updateExtensionNow());
    ui.querySelector('.als-update-dismiss').addEventListener('click', () => {
        dismissedUpdate = availableUpdate?.key ?? '';
        renderUpdateNotice();
    });
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
        promptDrafts[promptEditorMode] = event.target.value;
        ui.querySelector('.als-prompt-state').textContent = event.target.value === settings.prompts[promptEditorMode] ? '提示词已经记住喵' : '还没保存喵';
    });
    ui.querySelector('.als-prompt-save').addEventListener('click', () => void savePromptDraft());
    ui.querySelector('.als-prompt-reset').addEventListener('click', () => {
        if (sendLockDepth) return;
        promptDrafts[promptEditorMode] = promptEditorMode === 'merged' ? DEFAULT_MERGED_PROMPT : DEFAULT_PROMPT;
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
    ui.querySelector('.als-delete-round').addEventListener('click', () => void deleteSummarySelection({ roundOnly: true }).catch(error => notify('error', error.message)));
    ui.querySelector('.als-preview-box .als-delete-archive').addEventListener('click', () => void deleteSummarySelection().catch(error => notify('error', error.message)));
    void updateWorldBookStatus();
    void checkForUpdate({ silent: true });
}

function initialize() {
    const context = getContext();
    if (!context) return;
    getSettings();
    installVisibilityCommandHooks();
    void renderSettings();
    restoreUpdateDraft();
    document.addEventListener('click', blockSendInput, true);
    document.addEventListener('keydown', blockSendInput, true);
    document.addEventListener('submit', blockSendInput, true);
    context.eventSource.on(context.eventTypes.GENERATION_STARTED, refreshFinalHooks);
    context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
    context.eventSource.on(context.eventTypes.GENERATE_AFTER_DATA, onFinalPromptData);
    context.eventSource.on(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onMainApiRequest);
    context.eventSource.on('prompt_template_prepare', onTemplatePreviewContext);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    context.eventSource.on(context.eventTypes.GENERATION_ENDED, onGenerationEnded);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        if (activeRun && !activeRun.committed) queueArchiveRetry(activeRun.archiveId);
        if (activeRun) activeRun.cancelled = true;
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
