export function completionFailure(response) {
    const reason = String(response?.choices?.[0]?.finish_reason ?? response?.stop_reason
        ?? response?.candidates?.[0]?.finishReason ?? response?.incomplete_details?.reason ?? '').toLowerCase();
    if (['length', 'max_tokens', 'max_output_tokens', 'max_completion_tokens'].includes(reason)) return '模型输出达到长度上限，正文可能不完整';
    if (['content_filter', 'safety', 'recitation', 'refusal', 'blocked', 'error'].includes(reason)
        || response?.choices?.[0]?.message?.refusal || response?.promptFeedback?.blockReason) return '模型未完整返回总结正文';
    if (['tool_calls', 'function_call', 'tool_use'].includes(reason)) return '模型返回了工具调用，未完成总结';
    if (response?.status === 'incomplete' || response?.status === 'failed') return '模型未完整返回总结正文';
    return null;
}

export function promptContainsText(prompt, expected) {
    const normalize = text => String(text ?? '').replace(/\s+/g, ' ').trim();
    const contentText = content => Array.isArray(content)
        ? content.map(part => typeof part === 'string' ? part : part?.text ?? '').join('\n') : String(content ?? '');
    const text = Array.isArray(prompt) ? prompt.map(message => contentText(message?.content)).join('\n') : prompt;
    const needle = normalize(expected);
    return Boolean(needle) && normalize(text).includes(needle);
}
