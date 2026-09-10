// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { DeerNotesView } from '../src/views/dashboard-view';
import DeerNotesPlugin from '../src/main';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';

it('switches navigation, editor and overview without changing a draft or folder name', async () => {
 const snapshot = {rootFolders:[{path:'项目灵感',name:'项目灵感'}],markdownFiles:[],deerNotes:[]};
 const index = {getSnapshot:()=>snapshot, subscribe:()=>()=>{},initialize:async()=>{}};
 const view = new DeerNotesView({app:{}} as never,index as never,{} as never,{...DEFAULT_SETTINGS},()=>{},async()=> '');
 const host=document.createElement('div'); Object.defineProperty(view,'contentEl',{value:host});document.body.append(host);
 try {
  await view.onOpen();const input=host.querySelector('textarea')!;
  input.value='全部笔记 is my own content';input.dispatchEvent(new Event('input'));
  view.updateSettings({...DEFAULT_SETTINGS,language:'en'});
  await Promise.resolve();
  expect(host.querySelector('[data-action="notes"]')?.textContent).toBe('All notes');
  expect(host.querySelector('[data-action="folder"]')?.textContent).toBe('项目灵感');
  expect(host.querySelector('[data-action="save"]')?.textContent).toBe('Save note');
  expect(input.placeholder).toBe('What’s on your mind?');
  expect(input.value).toBe('全部笔记 is my own content');
  (host.querySelector('[data-action="overview"]') as HTMLButtonElement).click();
  await Promise.resolve();
  expect(host.textContent).toContain('Knowledge growth');
  expect(host.textContent).toContain('View daily data');
  view.updateSettings({...DEFAULT_SETTINGS,language:'zh-CN'});await Promise.resolve();
  expect(host.querySelector('[data-action="notes"]')?.textContent).toBe('全部笔记');
  expect(input.value).toBe('全部笔记 is my own content');
 } finally {await view.onClose();host.remove();}
});

it('normalizes language, restores it after load and keeps the previous value when persistence fails', async () => {
 expect(normalizeSettings({language:'en'}).language).toBe('en');
 expect(normalizeSettings({language:'invalid'}).language).toBe('zh-CN');
 const plugin=new DeerNotesPlugin({} as never,{} as never);
 vi.spyOn(plugin,'loadData').mockResolvedValue({...DEFAULT_SETTINGS,language:'en'});
 await plugin.onload();expect(plugin.settings.language).toBe('en');
 vi.spyOn(plugin,'saveData').mockRejectedValue(new Error('Disk full'));
 await expect(plugin.saveSettings({...DEFAULT_SETTINGS,language:'zh-CN'})).rejects.toThrow('Disk full');
 expect(plugin.settings.language).toBe('en');
 plugin.unload();
});
