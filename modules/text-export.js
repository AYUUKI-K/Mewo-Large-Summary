export function textExportFilename(label) {
    const safe = Array.from(String(label ?? '总结').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim()).slice(0, 100).join('');
    return `喵喵-${safe || '总结'}.txt`;
}

export function downloadText(content, label) {
    const url = URL.createObjectURL(new Blob([String(content)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    try {
        link.href = url;
        link.download = textExportFilename(label);
        link.hidden = true;
        document.body.append(link);
        link.click();
    } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
