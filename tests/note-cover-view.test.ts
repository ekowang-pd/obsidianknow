// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { DeerNotesView } from '../src/views/dashboard-view';
import { DEFAULT_SETTINGS } from '../src/settings';

it('resolves covers relative to their note, keeps text on image failure and opens the note from its cover', async () => {
 const descriptor={path:'Notes/Test.md',name:'Test.md',basename:'Test',extension:'md',ctime:1000,mtime:2000};
 const snapshot={rootFolders:[],markdownFiles:[descriptor],deerNotes:[]};
 const index={getSnapshot:()=>snapshot,subscribe:()=>()=>{},initialize:async()=>{}};
 const attachment={path:'Notes/picture.png'};
 const resolve=vi.fn(()=>attachment);
 const resource=vi.fn(()=> 'app://local/picture.png');
 const open=vi.fn();
 const view=new DeerNotesView({app:{metadataCache:{getFirstLinkpathDest:resolve},vault:{getResourcePath:resource}}} as never,index as never,{} as never,{...DEFAULT_SETTINGS},open,async()=> '![[picture.png|600]]\n\nMy understanding.');
 const host=document.createElement('div');Object.defineProperty(view,'contentEl',{value:host});document.body.append(host);
 try {
  await view.onOpen();for(let i=0;i<12;i++)await Promise.resolve();
  const img=host.querySelector<HTMLImageElement>('.deer-note-cover')!;
  expect(img).not.toBeNull();
  expect(resolve).toHaveBeenCalledWith('picture.png','Notes/Test.md');
  expect(resource).toHaveBeenCalledWith(attachment);
  expect(img.loading).toBe('lazy');
  img.click();expect(open).toHaveBeenCalledWith('Notes/Test.md');
  img.dispatchEvent(new Event('error'));
  expect(host.querySelector('.deer-note-cover')).toBeNull();
  expect(host.querySelector('.deer-note-summary')?.textContent).toBe('My understanding.');
 }finally{await view.onClose();host.remove();}
});
