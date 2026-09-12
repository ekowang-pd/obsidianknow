# 新增笔记编辑器选型与验收

本轮接入 Tiptap 3.31.3（MIT）：https://github.com/ueberdosis/tiptap 。对比 Milkdown Crepe 后，选择可以沿用现有工具栏与配色的无头编辑器，避免同时引入另一整套界面。Markdown 扩展仍处于 Beta，限制在新增笔记编辑区使用，不批量转换已有笔记。

- 直接编辑加粗、列表、图片，支持撤销/重做。
- 图片按钮、粘贴和拖入共用原有本地附件保存服务；每次处理一张图片。
- 图片显示地址和保存路径分离，保存的是库内相对路径。修复上游默认序列化对带空格图片路径的处理。
- 标签面板支持新建、筛选及复用当前小鹿笔记中的标签，保存为普通 #标签。
- 外部图片链接保留为文本占位，不自动请求；依赖随插件打包，无 CDN 或云账号要求。
- 现有 Markdown 预览保留；图片插入不再强制切换预览模式。

验证包括图文和标签的浏览器上传、Markdown 图片往返、撤销、失效图片、粘贴/拖入与输入法快捷键。真实 Obsidian 移动端仍待验收。编辑器增加了构建体积，目前 main.js 约 1.07 MB，发布前需验证原生加载体验。

参考：https://milkdown.dev/docs/guide/using-crepe 、https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage 。
