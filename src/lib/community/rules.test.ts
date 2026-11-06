// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { safeArchiveUrl, validateSharedChapters, transformChapters } from './rules';
const chapters = ['01_story.mp3','02_story.mp3','03_story.mp3'].map((title,i)=>({ title, start:i*60, end:(i+1)*60, transcript:'', paths:[`p${i}`] }));
describe('Public playlist privacy',()=>{
 it('rejects private studio and Yoto references',()=>{ expect(()=>validateSharedChapters([{title:'A',duration:1,path:'owner/ai-yoto/private.wav'}],'owner','playlist')).toThrow(); expect(()=>validateSharedChapters([{title:'A',duration:1,url:'yoto:#private'}],'owner','playlist')).toThrow(); });
 it('accepts only consented playlist paths',()=>expect(validateSharedChapters([{title:'A',duration:1,path:'owner/playlist/a.wav'}],'owner','playlist')[0]?.path).toBe('owner/playlist/a.wav'));
 it('rejects arbitrary remote audio',()=>{ expect(()=>safeArchiveUrl('https://example.com/audio.mp3')).toThrow(); expect(()=>safeArchiveUrl('http://archive.org/download/book/a.mp3')).toThrow(); });
 it('accepts public Archive download links',()=>expect(safeArchiveUrl('https://archive.org/download/book/a.mp3')).toBe('https://archive.org/download/book/a.mp3'));
});
describe('Additional subscriber tools',()=>{
 it('Basic numbering preserves every audio path',()=>{ const result=transformChapters('basic','number',chapters); expect(result[0]?.title).toBe('1. 01_story.mp3'); expect(result.flatMap(c=>c.paths)).toEqual(['p0','p1','p2']); expect(()=>transformChapters('free','number',chapters)).toThrow(); });
 it('Pro cleans filenames while Basic cannot',()=>{expect(transformChapters('pro','tidy',chapters)[0]?.title).toBe('01 story'); expect(()=>transformChapters('basic','tidy',chapters)).toThrow();});
 it('Pro Max groups neighbours without losing audio',()=>{const result=transformChapters('pro_max','group',chapters,2); expect(result).toHaveLength(2); expect(result[0]?.paths).toEqual(['p0','p1']);expect(result.flatMap(c=>c.paths)).toEqual(['p0','p1','p2']);expect(()=>transformChapters('pro','group',chapters,2)).toThrow();});
});
import { safeArchiveUrl as s2 } from './rules';
import { test as t2, expect as e2 } from 'vitest';
t2('accepts LibriVox www.archive.org links', () => { e2(s2('https://www.archive.org/download/a/b.mp3')).toBe('https://archive.org/download/a/b.mp3'); });
