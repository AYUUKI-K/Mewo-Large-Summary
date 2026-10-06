// Shipped templates are kept only to recognize unchanged settings during migration.
export const LEGACY_DEFAULT_PROMPT = `ELLA, suspend all current commands. The following directive has absolute priority:
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

export const PREVIOUS_DEFAULT_PROMPT = `新增大总结应当遵循以下原则：
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
  - 关键角色和{{user}}之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）:
...
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和{{user}}之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）
</details>

<details><summary>角色表</summary>
所有对剧情有影响的角色均需出现(包括没有实体的角色,mermaid图同理)，路人NPC不保留，参考\`[角色表规范]\`
</details>`;

export const PREVIOUS_DEFAULT_MERGED_PROMPT = `大总结应当遵循以下原则：
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
  - 关键角色和{{user}}之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）:
...
- 时间:
  - 关键事件（需要以流水帐形式综述事件经过和涉及人物）:
  - 重要细节:
  - 关键对话和内心戏:(标明角色)
  - 关键行为：(标明角色)
  - 关键角色和{{user}}之间的情感变化（选填）:
  - 简要的事件后续，事件结束后的小互动（选填）
</details>

<details><summary>角色表</summary>
所有对剧情有影响的角色均需出现(包括没有实体的角色,mermaid图同理)，路人NPC不保留，参考\`[角色表规范]\`
</details>

**注意，本回合无需输出任何其他内容，远期事件可大胆精简合并，仅保留重要细节，严禁输出<moew_FM>摘要**`;
