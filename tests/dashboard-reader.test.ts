// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import DeerNotesPlugin from "../src/main";
import type { DeerNotesView } from "../src/views/dashboard-view";

it("opens a dashboard descriptor in its internal reader and disposes it on view close", async () => {
  const file = { path: "docs/source.md", name: "source.md", basename: "source", extension: "md" };
  const app = {
    vault: {
      getRoot: () => ({ children: [{ path: "docs", name: "docs", children: [] }] }),
      getMarkdownFiles: () => [file], on: vi.fn(() => ({})), offref: vi.fn(),
      getAbstractFileByPath: vi.fn(() => file), cachedRead: vi.fn(async () => "source body")
    },
    workspace: {
      onLayoutReady: (callback: () => void) => callback(),
      getLeavesOfType: vi.fn(() => [] as unknown[]), revealLeaf: vi.fn(async () => {}),
      openLinkText: vi.fn(async () => {}), getLeaf: vi.fn()
    }
  };
  const plugin = new DeerNotesPlugin(app as never, {} as never);
  const factory = vi.spyOn(plugin, "registerView"); await plugin.onload();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const view = factory.mock.calls[0][1]({ app } as never) as DeerNotesView;
  const host = document.createElement("div");
  Object.defineProperty(view, "contentEl", { value: host }); document.body.append(host);
  app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
  await view.onOpen();
  host.querySelector<HTMLButtonElement>('button[data-folder="docs"]')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  host.querySelector<HTMLButtonElement>('button[data-action="open-file"]')!.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(host.querySelector(".deer-reader-content")?.textContent).toBe("source body");
  expect(app.workspace.openLinkText).not.toHaveBeenCalled();
  await view.onClose(); expect(host.children).toHaveLength(0); plugin.unload(); host.remove();
});
