# Deer Notes

Capture ideas, read your notes, and turn useful passages into knowledge—all within Obsidian.

Deer Notes is a local-first dashboard for quick notes, Markdown reading, and excerpts. Its minimal interface keeps content easy to browse, while your notes remain ordinary Markdown files in your vault.

## Features

- **Quick capture:** Write Markdown notes with formatting tools, tags, and image attachments.
- **Readable note cards:** Browse content previews, dates, and tags.
- **Search and folders:** Find notes by title, path, tags, or content, and explore top-level folders.
- **Built-in reader:** Read Markdown in a focused view or open the original file in Obsidian.
- **Selection excerpts:** Select a passage, add your thoughts, and save an excerpt with its source link.
- **Knowledge overview:** Explore document growth over 7, 30, or 90 days, folder distribution, recent updates, and recent articles in each category.
- **Activity heatmap:** View note modification activity over the past 13 weeks.

## Interface language

In Obsidian, open Settings → Deer Notes and select English under Interface language (界面语言). The selection is saved per vault and updates the open dashboard without discarding drafts.

## Getting started

Enable Deer Notes, then click its ribbon icon or search the command palette for **打开小鹿笔记** (Open Deer Notes). Choose **Settings → Deer Notes → Interface language → English** to switch the interface. The default is Simplified Chinese. Notes, tags, and folder names are not translated.

### Capture a note

Open **全部笔记** (All Notes), enter your thoughts, and click **保存笔记** (Save Note). You can also press **Ctrl+Enter** on Windows/Linux or **Cmd+Enter** on macOS.

The quick-note editor appears only in All Notes. Switching to a folder or the overview preserves your draft while the dashboard remains open.

### Browse and read

Select a folder in the sidebar and use search to narrow the list. Click a note card to read it. Choose **在 Obsidian 中打开** (Open in Obsidian) to work with the original file.

### Save an excerpt

Select text in the built-in reader, choose **做笔记** (Take a Note), add your thoughts, and save. Excerpts are grouped by source and date. The original document stays unchanged.

### Explore your knowledge

Open **知识概览** (Knowledge Overview) to see document counts, growth trends, folder distribution, and recent updates. Click an article to read it or expand the growth chart's daily data.

Growth is estimated from the creation times of files currently in your vault. Deleted files are not included, and importing or copying files may affect these dates.

## Storage and privacy

Notes are ordinary `.md` files with metadata and optional source links. The default notes folder is `小鹿笔记`, with images in its `附件` subfolder. Choose another notes folder in the plugin settings if needed. This affects future saves and does not move, rename, or delete existing files.

Deer Notes makes no network requests and includes no telemetry or advertising. It reads and writes through Obsidian's Vault API. Your notes and attachments remain under your control.

## Compatibility and support

The current interface and text-selection workflow primarily target desktop use. Mobile compatibility has not yet been verified.

Report bugs and request features through [GitHub Issues](https://github.com/ekowang-pd/obsidianknow/issues). Deer Notes is open source under the MIT License.
