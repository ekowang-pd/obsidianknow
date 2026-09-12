import { EditorState } from '@tiptap/pm/state';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';

/** Visual composer only; stored content remains Markdown with vault-relative images. */
export class RichComposer {
 readonly editor: Editor;
 readonly host: HTMLElement;
 private tags: HTMLElement;
 constructor(parent: HTMLElement, options: {
  value: string; label: string; placeholder: string;
  changed: (markdown: string) => void; save: () => void;
  upload: (file: File) => void; resolve: (path: string) => string | undefined;
 }) {
  const doc=parent.ownerDocument;
  this.host=doc.createElement('div');this.host.className='deer-rich-composer';parent.append(this.host);
  this.tags=doc.createElement('div');this.tags.className='deer-tag-picker';this.tags.hidden=true;parent.append(this.tags);
  const LocalImage=Image.extend({
   renderMarkdown: node => {
    const src=String(node.attrs?.src ?? "").replace(/[<>\r\n]/g, encodeURIComponent);
    const alt=String(node.attrs?.alt ?? "").replace(/[\[\]\\]/g, character => `\\${character}`);
    const title=String(node.attrs?.title ?? "").replace(/["\\]/g, character => `\\${character}`);
    return `![${alt}](<${src}>${title ? ` "${title}"` : ""})`;
   },
   addNodeView() { return ({node}) => {
    const dom=doc.createElement('span');dom.className='deer-rich-image';
    const img=doc.createElement('img');img.alt=node.attrs.alt || '';
    const path=String(node.attrs.src || '');
    const url=/^(?:[a-z][a-z\d+.-]*:|[\\/]{2})/i.test(path)?undefined:options.resolve(path);
    if(url){img.src=url;img.addEventListener('error',()=>{img.remove();dom.textContent=path;},{once:true});dom.append(img);}
    else dom.textContent=path;
    return {dom};
   }; },
  });
  this.editor=new Editor({
   element:this.host, extensions:[StarterKit.configure({underline:false,link:{openOnClick:false}}),LocalImage,Markdown],
   content:options.value,contentType:'markdown',injectCSS:false,
   editorProps:{attributes:{role:'textbox','aria-multiline':'true','aria-label':options.label,'data-placeholder':options.placeholder},
    handleKeyDown:(_view,event)=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();options.save();return true;}return false;},
    handleDOMEvents: {
    paste:(_view,event)=>{const file=Array.from(event.clipboardData?.files??[]).find(f=>f.type.startsWith('image/'));if(file){event.preventDefault();options.upload(file);return true;}return false;},
    drop:(_view,event)=>{const file=Array.from(event.dataTransfer?.files??[]).find(f=>f.type.startsWith('image/'));if(file){event.preventDefault();options.upload(file);return true;}return false;},
    },
   },
   onUpdate:({editor})=>options.changed(editor.getMarkdown()),
  });
 }
 reset(){const state=this.editor.state;this.editor.view.updateState(EditorState.create({schema:state.schema,plugins:state.plugins}));}
 set(value:string){if(this.editor.getMarkdown()!==value)this.editor.commands.setContent(value,{contentType:'markdown',emitUpdate:false});}
 image(path:string){this.editor.chain().focus().setImage({src:path,alt:''}).createParagraphNear().run();}
 action(action:string){if(action==='bold')this.editor.chain().focus().toggleBold().run();if(action==='unordered')this.editor.chain().focus().toggleBulletList().run();if(action==='ordered')this.editor.chain().focus().toggleOrderedList().run();}
 state(busy:boolean,hidden:boolean,label:string,placeholder:string){this.editor.setEditable(!busy,false);this.host.hidden=hidden;this.editor.view.dom.setAttribute('aria-label',label);this.editor.view.dom.setAttribute('data-placeholder',placeholder);if(hidden||busy)this.tags.hidden=true;}
 focus(){this.editor.commands.focus();}
 pickTag(known:string[],label:string){
  this.tags.replaceChildren();this.tags.hidden=false;
  const doc=this.tags.ownerDocument,input=doc.createElement('input');input.type='text';input.placeholder=label;input.setAttribute('aria-label',label);this.tags.append(input);
  const list=doc.createElement('div');this.tags.append(list);
  const add=(value:string)=>{const tag=value.trim().replace(/^#+/,'');if(!tag||!/^[\p{L}\p{N}_/-]+$/u.test(tag)||/^\d+$/.test(tag))return;this.editor.chain().focus().insertContent({type:'text',text:` #${tag} `}).run();this.tags.hidden=true;};
  const render=()=>{list.replaceChildren();const query=input.value.trim().replace(/^#/,'');const choices=Array.from(new Set([...(query?[query]:[]),...known.filter(t=>t.toLowerCase().includes(query.toLowerCase()))])).slice(0,8);for(const tag of choices){const b=doc.createElement('button');b.type='button';b.textContent=`#${tag}`;b.addEventListener('click',()=>add(tag));list.append(b);}};
  input.addEventListener('input',render);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();add(input.value);}if(e.key==='Escape'){this.tags.hidden=true;this.focus();}});render();input.focus();
 }
 destroy(){this.editor.destroy();this.host.remove();this.tags.remove();}
}
