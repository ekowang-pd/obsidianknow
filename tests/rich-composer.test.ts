// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { RichComposer } from '../src/views/rich-composer';

it('round-trips formatted text, tags and relative images without saving resource URLs, and preserves undo', () => {
 const host=document.createElement('div');document.body.append(host);
 const changed=vi.fn();
 const rich=new RichComposer(host,{value:'Hello **knowledge**\n\n- Learn\n- Apply\n\n#阅读',label:'Note',placeholder:'Write',changed,save:vi.fn(),upload:vi.fn(),resolve:()=> 'app://local/image.png'});
 try {
  expect(rich.editor.getMarkdown()).toContain('**knowledge**');
  expect(rich.editor.getMarkdown()).toContain('#阅读');
  rich.editor.commands.setImage({src:'附件/my image.png'});
  expect(host.querySelector('img')?.getAttribute('src')).toBe('app://local/image.png');
  const md=rich.editor.getMarkdown();expect(md).toContain('附件/my image.png');expect(md).not.toContain('app://');
  rich.editor.commands.undo();expect(rich.editor.getMarkdown()).not.toContain('my image.png');
  rich.set(md);expect(host.querySelector('img')).not.toBeNull();
  rich.state(true,false,'笔记','记录');expect(rich.editor.isEditable).toBe(false);
 } finally {rich.destroy();host.remove();}
});

it('does not automatically request remote images in the composer',()=>{
 const host=document.createElement('div');document.body.append(host);const resolve=vi.fn();
 const rich=new RichComposer(host,{value:'![](https://example.com/a.png)',label:'Note',placeholder:'',changed:vi.fn(),save:vi.fn(),upload:vi.fn(),resolve});
 try{expect(host.querySelector('img')).toBeNull();expect(resolve).not.toHaveBeenCalled();expect(rich.editor.getMarkdown()).toContain('https://example.com/a.png');}finally{rich.destroy();host.remove();}
});

it('handles pasted/dropped local images and IME-safe save shortcuts',()=>{
 const host=document.createElement('div');document.body.append(host);const upload=vi.fn(),save=vi.fn();
 const rich=new RichComposer(host,{value:'Draft',label:'Note',placeholder:'',changed:vi.fn(),save,upload,resolve:()=>undefined});
 try{
  const file=new File(['x'],'image.png',{type:'image/png'});
  for(const type of ['paste','drop']){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,type==='paste'?'clipboardData':'dataTransfer',{value:{files:[file],getData:()=>"",types:[]}});rich.editor.view.dom.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}
  expect(upload).toHaveBeenCalledTimes(2);
  rich.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true}));expect(save).not.toHaveBeenCalled();
  rich.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));expect(save).toHaveBeenCalledOnce();
 }finally{rich.destroy();host.remove();}
});

it('starts a new undo history after saving so previous notes cannot reappear',()=>{
 const host=document.createElement('div');document.body.append(host);
 const rich=new RichComposer(host,{value:'',label:'Note',placeholder:'',changed:vi.fn(),save:vi.fn(),upload:vi.fn(),resolve:()=>undefined});
 try{rich.editor.commands.insertContent('Saved note');rich.reset();expect(rich.editor.commands.undo()).toBe(false);expect(rich.editor.getMarkdown()).toBe('');rich.editor.commands.insertContent('Next note');rich.editor.commands.undo();expect(rich.editor.getMarkdown()).toBe('');}finally{rich.destroy();host.remove();}
});
