# 猫咪手账素材

- 文件：`mewo-note-cat.png`
- 来源：本次会话中用户提供的 `Photo 1.jpg`。
- 处理：使用内置 imagegen 工具，将插画外部白底及图形之间的背景空隙改为真实透明；保留猫咪与手账内部的白色、奶油色、原图造型和配色。
- 用途：悬浮入口 60 px、窗口标题栏 40 px、扩展标题 32 px、记录空状态 96 px。装饰图片不参与点击或键盘焦点，按钮名称独立保留。
- 通过 CSS 相对路径引用，无需图床、构建步骤或运行时图片服务。

## 编辑提示词

```text
Use case: background-extraction.
Asset type: transparent mascot sticker for an existing SillyTavern summary plugin floating window.
Input image 1 is the EDIT TARGET, not a loose style reference. Remove only its plain white exterior background and the white background showing in gaps between separate outlined shapes. Preserve the exact cheerful gray-and-white winking cat, pink ears and cheeks, paws, striped tail, gray pen with pink pawprint, spiral notebook, cream paper, pink tabs, small marks and all dark outlines. Keep all white/cream fills INSIDE the cat and notebook opaque. Preserve original composition, proportions, colors, expression, and soft illustrated texture as faithfully as possible. Do not redesign, redraw into another style, add text, add drop shadows, or change any features. Return a tightly framed square PNG-like image with a real alpha transparent background and a small transparent edge margin so nothing is clipped. No white matte, checkerboard painted background, or opaque rectangle.
```
