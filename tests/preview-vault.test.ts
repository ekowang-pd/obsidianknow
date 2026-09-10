import { describe, expect, it, vi } from 'vitest';
import { PreviewVault } from '../preview/vault';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
}
describe('browser preview storage', () => {
  it('restores saved notes after reloading the preview', async () => {
    const disk = storage(); const vault = new PreviewVault(disk as unknown as Storage, [{ path: '笔记', folder: true }]);
    await vault.create('笔记/测试.md', 'saved content');
    const restored = new PreviewVault(disk as unknown as Storage, []);
    expect(restored.getMarkdownFiles()[0].content).toBe('saved content');
    expect(restored.getRoot().children).toHaveLength(1);
  });
  it('does not publish an unsuccessful write when browser storage is full', async () => {
    const disk = storage(); const vault = new PreviewVault(disk as unknown as Storage, []);
    const file = await vault.create('测试.md', 'original');
    const changed = vi.fn(); vault.on('modify', changed);
    disk.setItem.mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(vault.process(file, text => text + ' lost')).rejects.toThrow('浏览器存储不足');
    expect(file.content).toBe('original'); expect(changed).not.toHaveBeenCalled();
  });
  it('serializes competing excerpt appends using the latest contents', async () => {
    const vault = new PreviewVault(storage() as unknown as Storage, []);
    const file = await vault.create('测试.md', 'original');
    await Promise.all([vault.process(file, text => text + ' first'), vault.process(file, text => text + ' second')]);
    expect(file.content).toBe('original first second');
  });
});
