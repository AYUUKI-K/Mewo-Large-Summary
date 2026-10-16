// Local to this browser/origin, one unfinished result per archive. No settings,
// credentials or world-book content are copied into this store.
const PREFIX = 'meow-large-summary-unfinished-v1:';
const key = archiveId => {
    if (typeof archiveId !== 'string' || !archiveId) throw new Error('缺少聊天存档标识');
    return PREFIX + encodeURIComponent(archiveId);
};

export function createIncompleteDraftStore(storage = () => globalThis.localStorage) {
    return {
        read(archiveId) {
            const raw = storage().getItem(key(archiveId));
            if (raw === null) return null;
            const draft = JSON.parse(raw);
            if (draft?.version !== 1 || draft.archiveId !== archiveId || typeof draft.content !== 'string'
                || !draft.content.trim() || typeof draft.reason !== 'string') throw new Error('本地草稿格式无法识别');
            return { content: draft.content, reason: draft.reason, updatedAt: draft.updatedAt };
        },
        write(archiveId, draft) {
            if (!String(draft.content ?? '').trim()) return;
            storage().setItem(key(archiveId), JSON.stringify({ version: 1, archiveId,
                content: draft.content, reason: draft.reason, updatedAt: draft.updatedAt }));
        },
        remove(archiveId) { storage().removeItem(key(archiveId)); },
    };
}
