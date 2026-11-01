// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';
import { removeMedia } from '../media/library';
vi.mock('../core/storage/documents',()=>({ getRecentDocumentsList:vi.fn(async()=>[{id:'pdf',name:'Lesson.pdf',lastOpened:2,lastPage:2,totalPages:4,sizeBytes:200,available:true}]),removeDocumentFromStorage:vi.fn(),clearAllStoredDocuments:vi.fn() }));
vi.mock('../media/library',()=>({ APP_FILE_ACCEPT:'.pdf,.mp4',listMedia:vi.fn(async()=>[{id:'media:video',name:'Video.mp4',mediaKind:'video',lastOpened:1,lastPage:1,totalPages:1,sizeBytes:400,available:true}]),removeMedia:vi.fn(async()=>{}) }));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const props={ currentTheme:'paper' as const,currentLang:'ar' as const,onThemeChange:vi.fn(),onToggleLanguage:vi.fn(),onOpenFile:vi.fn(),onOpenRecent:vi.fn() };
beforeEach(async()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<WelcomeScreen {...props}/>));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens the selected file and filters by media kind',async()=>{
 await act(async()=> (host.querySelector('button[aria-label="فتح Lesson.pdf"]') as HTMLButtonElement).click());
 expect(props.onOpenRecent).toHaveBeenCalledWith(expect.objectContaining({id:'pdf'}));
 await act(async()=>[...host.querySelectorAll('.lab-filters button')].find(b=>b.textContent==='الفيديو')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(host.querySelectorAll('.lab-file')).toHaveLength(1); expect(host.querySelector('.lab-file')!.textContent).toContain('Video.mp4');
});
it('requires explicit confirmation before deleting media and preserves it when cancelled',async()=>{
 await act(async()=> (host.querySelector('button[aria-label="حذف من المكتبة: Video.mp4"]') as HTMLButtonElement).click());
 expect(host.querySelector('dialog')).not.toBeNull(); expect(removeMedia).not.toHaveBeenCalled();
 await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='إلغاء')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(removeMedia).not.toHaveBeenCalled(); expect(host.querySelectorAll('.lab-file')).toHaveLength(2);
});
