import './shell.css';
import '../styles.css';
import { DeerNotesView } from '../src/views/dashboard-view';
import { VaultIndex } from '../src/services/vault-index';
import { NoteService } from '../src/services/note-service';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import { createNoteMarkdown } from '../src/domain/notes';
import { PreviewVault, STORAGE_KEY } from './vault';
import type { StoredEntry } from './vault';
import { Notice } from './obsidian';

const folders = ['小鹿笔记', '阅读素材', '项目灵感'];
const seed: StoredEntry[] = folders.map(path => ({ path, folder: true }));
seed.push({ path: '阅读素材/如何把阅读变成自己的知识.md', content: '# 如何把阅读变成自己的知识\n\n阅读的价值，不只在于读过多少内容，更在于留下多少自己的理解。\n\n## 从一句话开始\n\n遇到让你停下来思考的句子，可以选中这段文字，点击浮层中的“做笔记”。写下它与你正在做的事情有什么关联。\n\n> 笔记不是文章的缩影，而是思考发生过的证据。\n\n## 一个简单的记录习惯\n\n1. 保存触动你的原文。\n2. 用自己的话解释它。\n3. 写下下一步可以尝试的行动。\n\n同一篇文章当天的多次摘录，会汇总到同一篇笔记中。' });
seed.push({ path: '项目灵感/下一版界面想法.md', content: '# 下一版界面想法\n\n在这里试试搜索、阅读和摘录。\n\n- 列表信息是否清楚？\n- 快速笔记工具栏是否顺手？\n- 窄屏下的导航是否好用？\n\n把你的修改意见直接发到左侧对话。' });
for (const [index, body] of ['今天，从记录一个小想法开始。\n\n把脑海中一闪而过的念头留住，之后再慢慢整理。 #日常', '阅读之后，留一句自己的理解。\n\n连接已有的经验，比收集更多摘抄更重要。 #阅读', '让工具顺着思考的节奏工作。\n\n界面越清楚，越能把注意力留给内容。 #产品'].entries()) {
  const date = new Date(); date.setDate(date.getDate() - index * 3);
  const title = body.split('\n')[0]; seed.push({ path: `小鹿笔记/${title}.md`, content: createNoteMarkdown({ title, body, date }), ctime: date.getTime(), mtime: date.getTime() });
}
const vault = new PreviewVault(localStorage, seed);
const mode = document.querySelector<HTMLSelectElement>('#save-mode')!;
vault.beforeWrite = async () => {
  const choice = mode.value;
  if (choice === 'normal') return;
  if (choice === 'fail') mode.value = 'normal';
  await new Promise(resolve => window.setTimeout(resolve, 2000));
  if (choice === 'fail') throw new Error('模拟保存失败；原文和草稿已保留，请重试');
};
const languageKey = 'deer-notes-preview-language';
const settings = normalizeSettings({ ...DEFAULT_SETTINGS, language: window.localStorage.getItem(languageKey) });
const index = new VaultIndex(vault as never, settings);
const notes = new NoteService(vault as never, settings);
const app = { vault, workspace: {
  getLeaf: () => ({ openFile: async () => { new Notice('浏览器预览：此操作会在 Obsidian 中打开原文件'); } }),
  openLinkText: async (path: string, source: string) => {
    const resolved = vault.resolveLink(path, source); if (resolved) await view.openReader(resolved); else new Notice('示例库中没有这个链接对应的文件');
  },
} };
const host = document.querySelector<HTMLElement>('#app')!;
const view: DeerNotesView = new DeerNotesView({ app, contentEl: host } as never, index, notes, settings,
  path => view.openReader(path), async path => {
    const file = vault.getAbstractFileByPath(path); if (!file || !('content' in file)) throw new Error('文件不存在'); return file.content;
  }, (path, source) => vault.resource(path, source));
await view.onOpen();
const language = document.querySelector<HTMLSelectElement>('#language')!;
language.value = settings.language ?? 'zh-CN';
language.addEventListener('change', () => {
  const next = language.value === 'en' ? 'en' : 'zh-CN';
  try { window.localStorage.setItem(languageKey, next); }
  catch { new Notice('Could not save language. Please try again.'); return; }
  view.updateSettings({ ...settings, language: next });
  settings.language = next;
  updatePreviewLanguage(next);
});

const settingsDialog = document.querySelector<HTMLDialogElement>('#preview-settings')!;
const settingsButton = document.querySelector<HTMLButtonElement>('#open-settings')!;
settingsButton.addEventListener('click', () => settingsDialog.showModal());
document.querySelector('#close-settings')!.addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('close', () => settingsButton.focus());
document.querySelector<HTMLSelectElement>('#theme')!.addEventListener('change', event => { document.documentElement.dataset.theme = (event.target as HTMLSelectElement).value; });
document.querySelector<HTMLSelectElement>('#width')!.addEventListener('change', event => { const value = (event.target as HTMLSelectElement).value; host.style.maxWidth = value === 'full' ? '' : `${value}px`; });
document.querySelector('#reset')!.addEventListener('click', () => {
  if (confirm('重置将清空此浏览器中的预览笔记与附件，恢复示例。是否继续？')) { localStorage.removeItem(STORAGE_KEY); location.reload(); }
});
document.querySelector('#export')!.addEventListener('click', () => {
  const content = vault.getMarkdownFiles().filter(file => file.path.startsWith('小鹿笔记/')).map(file => `<!-- ${file.path} -->\n\n${file.content}`).join('\n\n---\n\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = '小鹿笔记-预览导出.md'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
new EventSource('/esbuild').addEventListener('change', () => location.reload());

function updatePreviewLanguage(language: string): void {
 const en = language === 'en'; document.documentElement.lang = language;
 document.title = en ? 'Deer Notes · Preview' : '小鹿笔记 · 调试预览';
 const texts: Record<string, [string,string]> = {
 '#settings-title':['设置','Settings'], '#open-settings':['设置','Settings'], '#close-settings':['关闭','Close'],
 '#export':['导出笔记','Export notes'], '#reset':['重置示例','Reset demo'],
 '.preview-settings-description':['小鹿笔记 · 调试预览。示例数据保存在此浏览器。','Deer Notes · Preview. Demo data is saved in this browser.'],
 '.preview-footer span':['本地预览 · Obsidian 原生功能请在插件中验收','Local preview · Verify native features in Obsidian']
 };
 for (const [selector, values] of Object.entries(texts)) {const el=document.querySelector(selector);if(el)el.textContent=values[en?1:0];}
 document.querySelector('#close-settings')?.setAttribute('aria-label',en?'Close settings':'关闭设置');
 const labels: Record<string,[string,string]> = {theme:['外观 ','Appearance '],width:['宽度 ','Width '],'save-mode':['保存 ','Save mode ']};
 for(const [id,values] of Object.entries(labels)){const label=document.querySelector('#'+id)?.parentElement;if(label?.firstChild)label.firstChild.textContent=values[en?1:0];}
 const options: Record<string,[string,string]> = {light:['浅色','Light'],dark:['深色','Dark'],full:['自适应','Responsive'],'390':['窄屏 390px','Narrow 390px'],'768':['平板 768px','Tablet 768px'],normal:['正常','Normal'],slow:['延迟 2 秒','Delay 2 seconds'],fail:['下次失败','Fail next save']};
 for(const el of document.querySelectorAll<HTMLOptionElement>('option')){const pair=options[el.value];if(pair)el.textContent=pair[en?1:0];}
}
updatePreviewLanguage(settings.language ?? 'zh-CN');
