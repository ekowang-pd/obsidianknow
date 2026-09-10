# 小鹿笔记：阅读与记录界面

## 知识概览扩充

参考 GitHub：Dashboard Navigator（分类统计、分类最近文件，仓库已归档，仅作设计参考）、Vault Size History（时间趋势）、Obsidian Startpage（统计与最近笔记）。链接：https://github.com/drbap/dashboard-navigator-for-obsidian 、https://github.com/technerium/obsidian-vault-size-history 、https://github.com/kuzzh/obsidian-startpage 。不安装这些插件，不复制实现。

第一遍计划：沿用白色卡片、浅灰画布与紫色强调，标题 15–16px、统计值 26px、图表标签 12px。四个核心数字 → 增长趋势 → 分类条形图与最近更新 → 各类别数量及最近三篇。7/30/90 天切换影响新增、近期更新和趋势，分类总量独立于周期。窄屏单列。

```text
知识概览
文档总量 | 近期新增 | 近期更新 | 知识类别
知识增长趋势                      7 / 30 / 90 天
累计文档折线 + 每日数据可展开
知识分类条形图       最近更新五篇
类别名称 / 数量 / 近期新增 / 最近三篇
```

复核：不为漂亮曲线伪造数据。分类是一级目录，根目录文件单独归类；隐藏目录不参与概览。创建时间反映现存文件，无法复原已删除文件或导入前历史，图旁说明这个限制。空库、无近期新增、异常时间有明确显示。最近文章使用真实文件路径打开；日期切换支持键盘焦点保留。采用原生 SVG 和 HTML，避免额外图表运行时依赖。

## 参考图第二轮调整

计划：采用参考图的浅灰画布、白色无边线内容卡片、安静的元信息与正文摘要；保留紫色作为已有识别色。正文 #292932、辅助文字 #686875、画布 #F7F7FA、卡片 #FFFFFF、强调 #7350B5。使用系统无衬线字体，减少粗体和文件图标。顶行放当前目录与搜索，下面只在全部笔记显示记录框，再展示卡片列表；详情保持舒适行宽。侧栏与内容同底色，靠留白区分。

```text
小鹿笔记        全部笔记          搜索
导航            [此刻的想法…        保存]
活动            [日期 / 标题 / 正文摘要 / 标签]
                [日期 / 标题 / 正文摘要 / 标签]
```

复核：参考图中的绿色、PRO 标志、AI 菜单不属于当前功能，不照搬。重点采用内容卡片和较轻的字重，保留已有目录、设置和草稿行为。摘要读取失败不影响打开原文，列表异步更新不抢焦点；缩略只影响呈现，不修改 Markdown。

## 设计依据

用户优先级：简洁、视觉整齐、操作流畅、列表和详情优雅可读。
参考技能：anthropics/skills 的 frontend-design（41bbe19），nextlevelbuilder/ui-ux-pro-max-skill 的 ui-ux-pro-max（7f69fed）。2026-09-10 安装到个人 Codex 技能目录。

## 第一遍：设计计划

- 配色：白 #FFFFFF、浅灰 #F7F7FA、边线 #E6E6EC、正文 #292932、辅助文字 #686875、强调紫 #7350B5。插件继续使用 Obsidian 语义色变量，尊重用户主题；这些色值用于浏览器预览。
- 字体：系统中文无衬线字体，无外部字体请求。正文 16px / 1.85；列表标题 16px / 1.5；辅助信息 12–13px；文章标题 28px / 1.4。
- 布局：220px 侧栏，导航紧接品牌，统计放到导航下方；主区最大 900px；文章正文最大 680px；间距使用 4/8px 倍数。
- 主操作：紧凑的快速记录框；整行笔记打开；明确的返回按钮；有标题、来源、引文、输入和操作区的摘录窗口。

```text
品牌         | 快速记录                 保存
全部笔记     | 搜索笔记
目录         | 全部笔记                 数量
知识概览     | 标题                         ›
             | 日期 · 标签 / 来源
最近活动     | ────────────────────────────
统计与热图   | 下一条笔记

返回列表     | 所在目录              打开原文件
             文章标题
             正文（限制阅读宽度）
             小标题、引用、列表
```

## 第二遍：复核与取舍

UI UX Pro Max 搜索匹配到知识管理和网格排版，但其棕色、衬线字体与当前中文笔记工具不符。仅采用清晰层次、网格对齐、可访问性和克制的交互反馈；保留原有紫色识别。
不增加装饰、营销文案、无意义动画和每行卡片边框。完整文件路径通过悬停及阅读页保留，列表不再重复文件名。窄屏优先显示导航与内容，活动统计可折叠。
详情顶部使用紧凑目录信息，完整路径可悬停查看；正文没有一级标题时，顶部显示文件名。主标题由正文承担。自动生成的时间标题降为辅助信息，不改动原 Markdown。
保持现有失败保留草稿、保存中防重复操作、键盘焦点恢复机制。新增快捷保存需排除中文输入法组合输入。

## 验证范围

真实共享组件的列表、目录、概览、阅读、摘录；浅色/深色和窄屏；现有保存与失败恢复测试；浏览器构建和插件构建。浏览器数据为独立示例，不访问真实知识库。

完成记录：133 项测试通过，类型检查、插件和预览构建、发布文件检查通过。实际浏览器检查了列表、目录、概览、详情及摘录窗口，包括 390px 窄屏和深色模式。活动默认折叠，切换导航时保留展开状态；按修改时间排列笔记；新增 Ctrl / ⌘ + Enter 快捷保存并排除输入法组合输入。

### Logo refinement — deer and notebook
- Reference: https://dribbble.com/shots/24316777--Negative-Space-Deer-Logo-Logo-Design and https://scalebranding.com/product/324489 (concept research; no source artwork reused).
- Plan: original symmetrical deer silhouette with broad open-page cutouts; short branched antlers and leaf-shaped ears establish the animal. Remove tiny eyes to give the notebook more visual weight at 30 px.
- Tokens: purple #7350b5, light #f7f7fa, white #ffffff, text #292932; retain system UI wordmark, 17 px/600. Layout: [30 px mark] 10 px [name], center aligned vertically.
- Brief review: a generic notebook symbol misses the deer identity; detailed deer faces obscure the writing metaphor. Use two large page-shaped apertures and a clear center spine, single fill, no outline or decorative badge.

### Rounded compact deer mark
User feedback: replace pointed stag with a friendlier rounded fawn; match the wordmark height. Keep the purple fill and notebook cutout, use rounded antler tips, oval ears and a soft chin. Reduce the box from 30 to 22 px (visible silhouette about 18 px), center beside the existing 17 px wordmark with 8 px spacing. Review: avoid a shield-shaped jaw and angular page corners; favor a compact face with generous curves.
