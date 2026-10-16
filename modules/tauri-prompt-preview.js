// Preview the Rust TT post-processor on a private copy, never on a generation
// payload. Reference: Darkatse/TauriTavern@21477e44e0ecddd16e5013d08184182d2dd02fc5
// src-tauri/crates/tt-application/src/services/chat_completion_service/payload/prompt_post_processing.rs
// Unknown modes fail closed; successful native previews always take priority.
const MODES = new Set(['claude', 'merge', 'merge_tools', 'semi', 'semi_tools', 'strict', 'strict_tools', 'single']);
const PLACEHOLDER = "Let's get started.";
const asciiLower = value => value.replace(/[A-Z]/g, char => char.toLowerCase());
const nameText = value => typeof value === 'string' ? value.trim() : '';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function tauriPromptPreview(messages, type, names = {}) {
    const mode = typeof type === 'string' ? asciiLower(type.trim()) : '';
    if (!MODES.has(mode)) throw new Error('当前 TauriTavern 后处理模式尚未适配，无法可靠预览；请提供宿主版本和后处理模式。');
    if (!Array.isArray(messages)) throw new Error('提示词预览缺少消息列表。');
    const character = nameText(names.char_name), user = nameText(names.user_name);
    const groups = Array.isArray(names.group_names) ? names.group_names.map(nameText).filter(Boolean) : [];
    const tools = mode.endsWith('_tools');
    const strict = /^(semi|strict|single)/.test(mode);
    const placeholders = mode.startsWith('strict');
    const single = mode === 'single';
    const groupPrefix = text => groups.some(name => text.startsWith(`${name}: `));
    const prefix = (text, name, group = false) => !name || text.startsWith(`${name}: `) || (group && groupPrefix(text))
        ? text : `${name}: ${text}`;
    const source = structuredClone(messages);
    // Collision-free internal markers restore media parts in the same positions
    // as TT. They are never included in the returned prompt or model request.
    const serialized = JSON.stringify(source);
    let marker = '__MEWO_PREVIEW_MEDIA_';
    while (serialized.includes(marker)) marker += '_';
    let sequence = 0;

    const merge = (input, applyStrict, applySingle) => {
        const media = new Map();
        const normalize = content => {
            if (content == null) return '';
            if (typeof content === 'string') return content;
            if (!Array.isArray(content)) {
                // Scalar/object serialization can differ across Rust/JS. Do not
                // claim an exact preview for malformed message content.
                throw new Error('TauriTavern 本地预览暂不支持此消息内容格式，未跳过隐藏校验。');
            }
            return content.map(part => {
                if (typeof part === 'string') return part;
                if (part?.type === 'text') return typeof part.text === 'string' ? part.text : '';
                if (['image_url', 'video_url', 'audio_url'].includes(part?.type)) {
                    const key = `${marker}${sequence++}__`;
                    media.set(key, part);
                    return key;
                }
                return '';
            }).join('\n\n');
        };
        const plain = message => Object.keys(message).length === 2
            && typeof message.role === 'string' && typeof message.content === 'string';
        const result = [];
        for (const item of input) {
            if (!object(item)) continue;
            const message = { ...item };
            let role = typeof message.role === 'string' ? asciiLower(message.role.trim()) : 'user';
            let content = normalize(message.content);
            const name = typeof message.name === 'string' ? message.name.trim() : null;
            if (role === 'system' && name === 'example_assistant') content = prefix(content, character, true);
            else if (role === 'system' && name === 'example_user') content = prefix(content, user);
            if (role !== 'system' && name !== null && !content.startsWith(`${name}: `)) content = `${name}: ${content}`;
            if (role === 'tool' && !tools) role = 'user';
            if (applySingle) {
                if (role === 'assistant') content = prefix(content, character, true);
                else if (role === 'user') content = prefix(content, user);
                role = 'user';
            }
            Object.assign(message, { role, content });
            delete message.name;
            if (!tools) { delete message.tool_calls; delete message.tool_call_id; }
            const previous = result.at(-1);
            if (plain(message) && content && role !== 'tool' && previous && plain(previous) && previous.role === role) {
                previous.content += `\n\n${content}`;
            } else result.push(message);
        }
        if (!result.length) result.push({ role: 'user', content: PLACEHOLDER });
        for (const message of result) {
            if (![...media.keys()].some(key => message.content.includes(key))) continue;
            const parts = [];
            for (const segment of message.content.split('\n\n')) {
                if (media.has(segment)) parts.push(media.get(segment));
                else if (parts.at(-1)?.type === 'text') parts.at(-1).text += `\n\n${segment}`;
                else parts.push({ type: 'text', text: segment });
            }
            message.content = parts;
        }
        if (applyStrict) {
            result.forEach((message, index) => { if (index > 0 && message.role === 'system') message.role = 'user'; });
            if (placeholders) {
                if (result[0].role === 'system' && result[1]?.role !== 'user') result.splice(1, 0, { role: 'user', content: PLACEHOLDER });
                else if (!['system', 'user'].includes(result[0].role)) result.unshift({ role: 'user', content: PLACEHOLDER });
            }
            return merge(result, false, false);
        }
        return result;
    };
    const result = merge(source, strict, single);
    // TT itself can leave a media marker inside a name-prefixed segment. That
    // case cannot be a reliable local preview (the backend UUID is random).
    if (JSON.stringify(result).includes(marker)) throw new Error('TauriTavern 的媒体与姓名组合无法可靠预览，未跳过隐藏校验。');
    return result;
}
