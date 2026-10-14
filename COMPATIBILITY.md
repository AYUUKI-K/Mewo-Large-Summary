# 1.2.9 兼容性核验

核验日期：2026-10-14。适用于 1.2.9 兼容更新；保留 1.2.8 的界面修复。

## 结论与范围

原 1.2.7 不能直接宣称支持全部 1.14–1.18：1.14–1.17 没有 `context.getWorldInfoNames()`；1.14 也没有 `WORLDINFO_SCAN_DONE`。前者会阻断建书/读取/同步，后者会使保存后的隐藏验证停止。

1.2.9 已处理这两个已知障碍，并去掉扩展自身对新版 AbortSignal 辅助方法的依赖。已核对下列固定源码，但没有将源码检查或模拟宿主结果当作真实安装包认证。

| 宿主 | 固定源码 | 本地核验结论 |
|---|---|---|
| SillyTavern 1.14.0 | [9c9be908](https://github.com/SillyTavern/SillyTavern/tree/9c9be90821ffd6132b40b5f04982522a61d7ad30) | 世界书列表回退 + 两次 dry-run 来源确认；源码检查和浏览器模拟通过 |
| SillyTavern 1.15.0 | [1c0e7ea9](https://github.com/SillyTavern/SillyTavern/tree/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc) | 世界书列表回退；源码检查通过 |
| SillyTavern 1.16.0 | [e3b866b5](https://github.com/SillyTavern/SillyTavern/tree/e3b866b5d2bcc7fbaa889bb926fbb567cd1ed25b) | 世界书列表回退；源码检查通过 |
| SillyTavern 1.17.0 | [e3f41666](https://github.com/SillyTavern/SillyTavern/tree/e3f41666c69db032e17e079fcddcf40cf47e8593) | 世界书列表回退；源码检查通过 |
| SillyTavern 1.18.0 | [51ad27fb](https://github.com/SillyTavern/SillyTavern/tree/51ad27fb86d39a3daca3adaa970375c9670c12df) | 原生列表与扫描接口；源码检查通过 |
| TauriTavern Canary 2026-10-12 | [21477e44e0ec](https://github.com/Darkatse/TauriTavern/tree/21477e44e0ecddd16e5013d08184182d2dd02fc5) | 有条件试用；源码检查、宿主形态浏览器模拟通过 |

未逐一核验上述系列的其他补丁标签。Canary 标签会移动，本结论仅针对表中的提交。

## TauriTavern 使用条件

1. 使用正常的第三方前端扩展安装方式，保留 `index.js`、`modules/`、`assets/`、`style.css`、`manifest.json`。不需改动 TauriTavern 核心。
2. 主连接的 **自定义提示词后处理设为“无”**。Canary 的 Rust 后端实现了生成后处理，但没有 `/api/backends/chat-completions/process` 预览路由。计数和隐藏确认因此无法可靠预览后处理结果；插件会显示操作建议并停止，不会跳过验证。
3. 优先用常规聊天补全主连接或 OpenAI 兼容副 API 试用；副 API 仍要求主连接可用以完成宿主原生提示词组装。未对 Canary 新增的 Responses、Gemini Interactions、Agent/MCP 模式及所有提供商变体做端到端验证。
4. WebView 的 `AbortController`、ES modules、ReadableStream 等基础能力仍须由宿主提供。修复三项 AbortSignal API 依赖不代表支持所有旧 Android/iOS 系统。

核对依据：Canary 的 [第三方扩展契约](https://github.com/Darkatse/TauriTavern/blob/21477e44e0ecddd16e5013d08184182d2dd02fc5/docs/CurrentState/ThirdPartyExtensions.md)、[生成及模型列表路由](https://github.com/Darkatse/TauriTavern/blob/21477e44e0ecddd16e5013d08184182d2dd02fc5/src/tauri/main/routes/ai-routes.js)、[串行生成封装](https://github.com/Darkatse/TauriTavern/blob/21477e44e0ecddd16e5013d08184182d2dd02fc5/src/scripts/util/safe-generate.js)、[Rust 提示词后处理](https://github.com/Darkatse/TauriTavern/blob/21477e44e0ecddd16e5013d08184182d2dd02fc5/src-tauri/crates/tt-application/src/services/chat_completion_service/payload/prompt_post_processing.rs)。

## 隐藏保护与验证

1.15 及以后的宿主继续在扫描完成事件中核对世界书、条目 UID 和存档身份，再核对最终提示词的正文。

1.14 先检查正常 dry-run 的完整正文，再通过 `WORLDINFO_ENTRIES_LOADED` 为目标条目的临时数组元素创建带唯一标记的副本，执行第二次 dry-run。标记和完整正文必须同时进入最终提示词，防止聊天中恰好含相同文本造成误判。不会修改原条目对象或保存标记，不发第二次模型请求。临时标记略占预算，因此接近预算上限或模板移除标记时可能保守拒绝隐藏；已保存的总结保留，可调整后只重试隐藏。

已执行：

- 213 项隔离回归全部通过，包括保存/隐藏/恢复、取消、流式中断、世界书列表更新、旧版来源确认失败和临时对象不污染缓存。
- 六个固定宿主的源码契约检查全部通过；覆盖使用中的 context 成员、导出、事件调用点和关键后端路由。
- 浏览器模拟 1.14/Tauri 形态：缺失旧版接口或新版 AbortSignal 静态方法时，完成总结、保存和隐藏 80 条/保留 20 条的流程；没有真实模型调用。
- JS 语法与 Git 差异空白检查。

尚未执行：真实 SillyTavern 1.14–1.18 各版本启动测试、Tauri 桌面/手机安装包测试、真实主/副 API、EJS/MVU 等第三方扩展组合测试。这些仍是实机兼容性的确认项。
