import test from 'node:test';
import assert from 'node:assert/strict';
import { tauriPromptPreview as preview } from '../modules/tauri-prompt-preview.js';

const m = (role, content, extra = {}) => ({ role, content, ...extra });
const placeholder = m('user', "Let's get started.");
const names = { char_name: ' 角色 ', user_name: ' 用户 ', group_names: [' 同伴 ', ''] };

// Expectations from the pinned Rust implementation, including its four tests.
test('TT merge squashes consecutive roles and preserves the source', () => {
    const input = [m('user', 'a'), m('user', 'b'), m('assistant', 'c'), m('assistant', 'd'), m('user', 'e')];
    const original = structuredClone(input);
    assert.deepEqual(preview(input, 'merge'), [m('user', 'a\n\nb'), m('assistant', 'c\n\nd'), m('user', 'e')]);
    assert.deepEqual(input, original);
    assert.deepEqual(preview(input, 'claude'), preview(input, 'merge'));
});

for (const mode of ['strict', 'strict_tools']) test(`TT ${mode} inserts the native placeholder`, () => {
    assert.deepEqual(preview([m('assistant', 'prefill')], mode), [placeholder, m('assistant', 'prefill')]);
    assert.deepEqual(preview([m('system', 'rules')], mode), [m('system', 'rules'), placeholder]);
    assert.deepEqual(preview([m('system', 'rules'), m('assistant', 'prefill')], mode), [m('system', 'rules'), placeholder, m('assistant', 'prefill')]);
});

for (const mode of ['semi', 'semi_tools', 'strict', 'strict_tools']) test(`TT ${mode} demotes later system messages then merges again`, () => {
    assert.deepEqual(preview([m('system', 'rules'), m('user', 'source'), m('system', 'summary')], mode),
        [m('system', 'rules'), m('user', 'source\n\nsummary')]);
});

for (const mode of ['merge_tools', 'semi_tools', 'strict_tools']) test(`TT ${mode} keeps tool boundaries and unknown structured fields`, () => {
    const input = [m('user', 'draft'), m('assistant', 'prepare'),
        m('assistant', 'write', { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'write', arguments: '{}' } }] }),
        m('tool', 'ok', { tool_call_id: 'call_1' }), m('tool', 'again', { tool_call_id: 'call_2' })];
    assert.deepEqual(preview(input, mode), input);
    const reasoning = [m('assistant', 'a', { reasoning_content: 'kept' }), m('assistant', 'b')];
    assert.deepEqual(preview(reasoning, mode), mode === 'strict_tools' ? [placeholder, ...reasoning] : reasoning);
});

test('TT non-tool modes remove call metadata and turn tool output into user content', () => {
    const input = [m('assistant', null, { tool_calls: [{ id: 'x' }] }), m('tool', 'result', { tool_call_id: 'x' }), m('user', 'continue')];
    assert.deepEqual(preview(input, 'merge'), [m('assistant', ''), m('user', 'result\n\ncontinue')]);
});

test('TT single mode applies names, group names and example prefixes once', () => {
    const input = [m('system', 'rules'), m('system', 'example', { name: 'example_assistant' }),
        m('system', 'question', { name: 'example_user' }), m('assistant', '同伴: already'),
        m('user', '用户: already'), m('assistant', 'answer'), m('user', 'question')];
    assert.deepEqual(preview(input, 'single', names), [m('user', 'rules\n\n角色: example\n\n用户: question\n\n同伴: already\n\n用户: already\n\n角色: answer\n\n用户: question')]);
    assert.deepEqual(preview([m('USER', 'hello', { name: ' Named ' })], 'merge'), [m('user', 'Named: hello')]);
    assert.deepEqual(preview([m('user', 'hello', { name: '' })], 'merge'), [m('user', ': hello')]);
});

test('TT normalizes text arrays, empty input and absent content without losing extra fields', () => {
    assert.deepEqual(preview([], 'merge'), [placeholder]);
    assert.deepEqual(preview([null, false, { role: ' USER ' }, m('user', ['a', { type: 'text', text: 'b' }])], ' MERGE '), [m('user', '\n\na\n\nb')]);
    assert.deepEqual(preview([m('user', 'a'), m('user', '')], 'merge'), [m('user', 'a'), m('user', '')]);
    assert.deepEqual(preview([m('assistant', 'a', { custom: 1 }), m('assistant', 'b')], 'merge'), [m('assistant', 'a', { custom: 1 }), m('assistant', 'b')]);
});

for (const mode of ['merge', 'semi', 'strict']) test(`TT ${mode} restores image, video and audio blocks and keeps input immutable`, () => {
    const media = ['image_url', 'video_url', 'audio_url'].map(type => ({ type, [type]: { url: 'fixture' } }));
    const input = [m('user', [{ type: 'text', text: 'look' }, ...media]), m('user', 'after')];
    const original = structuredClone(input);
    assert.deepEqual(preview(input, mode), [m('user', [{ type: 'text', text: 'look' }, ...media, { type: 'text', text: 'after' }])]);
    assert.deepEqual(input, original);
});

test('TT unsupported mode, malformed content and unstable prefixed media stop verification', () => {
    assert.throws(() => preview([m('user', 'source')], 'future-mode'), /尚未适配/);
    assert.throws(() => preview([m('user', { nested: true })], 'merge'), /内容格式/);
    assert.throws(() => preview([m('user', [{ type: 'image_url', image_url: { url: 'fixture' } }])], 'single', names), /媒体与姓名/);
});
