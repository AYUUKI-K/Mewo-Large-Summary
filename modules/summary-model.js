// Pure data rules. No host state, network calls or DOM access.
export function textDigest(text) {
    let a = 2166136261;
    let b = 2246822519;
    for (let i = 0; i < text.length; i++) {
        const value = text.charCodeAt(i);
        a = Math.imul(a ^ value, 16777619);
        b = Math.imul(b ^ value, 3266489917);
    }
    return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export function messageFingerprint(message) {
    // Visibility is deliberately separate: hiding must not change provenance.
    return textDigest(JSON.stringify([
        String(message?.mes ?? ''), String(message?.name ?? ''), Boolean(message?.is_user),
        message?.send_date ?? null, message?.swipe_id ?? null, message?.extra?.reasoning ?? null,
    ]));
}

export function historyDigest(chat, end = chat.length - 1) {
    if (end < 0) return textDigest('[]');
    if (end >= chat.length) return null;
    return textDigest(JSON.stringify(chat.slice(0, end + 1).map(messageFingerprint)));
}

export function activeRecords(records) {
    return records.filter(record => !record.undone).sort((a, b) => a.round - b.round);
}

export function combineRecords(records) {
    let content = '';
    for (const record of activeRecords(records)) {
        const text = String(record.content ?? '').trim();
        if (record.mode === 'merged') content = text;
        else if (text) content = content ? `${content}\n\n${text}` : text;
    }
    return content;
}

export function branchRecords(records, chat) {
    let inherited = [];
    let missingEarlier = false;
    for (const record of activeRecords(records)) {
        const known = Number.isInteger(record.sourceEnd) && record.sourceEnd >= 0 && record.sourceDigest
            && historyDigest(chat, record.sourceEnd) === record.sourceDigest;
        if (!known) { missingEarlier = true; continue; }
        if (record.mode === 'merged') {
            if (missingEarlier) inherited = [];
            missingEarlier = false;
        }
        if (!missingEarlier) inherited.push(structuredClone(record));
    }
    return inherited;
}

export function archiveTransition(archive, current, integrity) {
    if (!archive.archiveId || (archive.cardKey && archive.cardKey !== current.cardKey)) return 'new';
    if (archive.chatIntegrity && integrity && archive.chatIntegrity !== integrity) return 'branch';
    // ST keeps integrity across renames and mints it anew for branches.
    if (archive.chatIntegrity && archive.chatIntegrity === integrity) return 'same';
    if (archive.chatId && archive.chatId !== current.chatId) return 'branch';
    return 'same';
}

export function visibilityChanges(chat, end) {
    if (end < 0) return [];
    return chat.slice(0, end + 1).flatMap((message, index) => message.is_system ? [] : [{
        index, fingerprint: messageFingerprint(message),
    }]);
}

export function recoveryMatches(chat, operation, epoch) {
    return operation && operation.manualEpoch === (epoch ?? '')
        && historyDigest(chat, operation.sourceEnd) === operation.sourceDigest;
}

export function consecutiveRanges(indices) {
    const ranges = [];
    for (const index of [...new Set(indices)].sort((a, b) => a - b)) {
        const last = ranges.at(-1);
        if (last && last[1] + 1 === index) last[1] = index;
        else ranges.push([index, index]);
    }
    return ranges;
}

export function entryRevision(entry, marker) {
    if (!entry) return null;
    return textDigest(JSON.stringify([entry.content, entry.extensions?.[marker]]));
}

export function sourceDescription(record) {
    if (!record) return '暂无总结记录';
    const source = Number.isInteger(record.sourceEnd) && record.sourceEnd >= 0
        ? `总结时到第 ${record.sourceEnd} 层（${record.sourceEnd + 1} 条消息）` : '旧记录未保存总结来源终点';
    const hidden = Number.isInteger(record.coveredTo) && record.coveredTo >= 0
        ? `隐藏计划到第 ${record.coveredTo} 层` : '没有隐藏计划';
    return `${record.undone ? '已撤销 · ' : ''}${source}；${record.operation === 'compact' ? '仅合并，未隐藏消息' : hidden}`;
}
