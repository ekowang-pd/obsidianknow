// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Component, MarkdownRenderer } from '../preview/obsidian';
import { PreviewVault } from '../preview/vault';

it('preserves Markdown formatting while preventing executable markup and links', async () => {
  const target = document.createElement('div');
  const vault = new PreviewVault(window.localStorage, []);
  await MarkdownRenderer.render({ vault }, '# Title\n\n**Readable**\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))\n\n[[Notes/Safe|Safe note]]', target, 'source.md', new Component());
  expect(target.querySelector('h1')?.textContent).toBe('Title');
  expect(target.querySelector('strong')?.textContent).toBe('Readable');
  expect(target.querySelector('script, [onerror], [onclick], a[href^="javascript:"]')).toBeNull();
  expect(target.querySelector('a.internal-link')?.textContent).toBe('Safe note');
});
