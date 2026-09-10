import { buildRootNavigation } from "../domain/navigation";
import type { DeerNotesSettings } from "../settings";
import type { DeerNoteDescriptor, VaultFileDescriptor, VaultSnapshot } from "../services/vault-index";

export type DashboardSelection = { kind: "notes" } | { kind: "folder"; path: string } | { kind: "overview" };
export interface DashboardNavItem { id: string; label: string; kind: DashboardSelection["kind"] }
export type DashboardFile = VaultFileDescriptor | DeerNoteDescriptor;
export type ReadBody = (path: string) => Promise<string>;

export class DashboardState {
  selectedView: DashboardSelection = { kind: "notes" };
  searchQuery = "";
  private bodyMatches = new Set<string>();
  private revision = 0;

  constructor(
    private snapshot: VaultSnapshot,
    private settings: DeerNotesSettings,
    private readonly readBody?: ReadBody
  ) {}

  get navigation(): DashboardNavItem[] {
    return [
      { id: "all-notes", label: "全部笔记", kind: "notes" },
      ...buildRootNavigation(this.snapshot.rootFolders.map(folder => folder.path), this.settings)
        .map(folder => ({ id: folder.path, label: folder.label, kind: "folder" as const })),
      { id: "overview", label: "知识概览", kind: "overview" }
    ];
  }

  get visibleFiles(): DashboardFile[] {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    return this.candidates().filter(file => !query || this.matchesMetadata(file, query) || this.bodyMatches.has(file.path))
      .sort((a, b) => b.mtime - a.mtime);
  }

  selectNotes(): void { this.select({ kind: "notes" }); }
  selectFolder(path: string): void {
    this.select(this.navigation.some(item => item.kind === "folder" && item.id === path)
      ? { kind: "folder", path } : { kind: "notes" });
  }
  selectOverview(): void { this.select({ kind: "overview" }); }

  updateSnapshot(snapshot: VaultSnapshot): void {
    this.snapshot = snapshot;
    this.reconcile();
  }

  updateSettings(settings: DeerNotesSettings): void {
    this.settings = settings;
    this.reconcile();
  }

  cancelSearch(): void { this.revision += 1; }

  async setSearchQuery(query: string): Promise<void> {
    this.searchQuery = query;
    this.bodyMatches.clear();
    const revision = ++this.revision;
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || !this.readBody) return;
    const matches = new Set<string>();
    for (const file of this.candidates()) {
      if (this.matchesMetadata(file, normalized)) continue;
      const body = await this.readBody(file.path);
      if (revision !== this.revision) return;
      if (body.toLocaleLowerCase().includes(normalized)) matches.add(file.path);
    }
    if (revision === this.revision) this.bodyMatches = matches;
  }

  private candidates(): DashboardFile[] {
    const selected = this.selectedView;
    if (selected.kind === "overview") return [];
    if (selected.kind === "notes") return [...this.snapshot.deerNotes];
    const notes = new Map(this.snapshot.deerNotes.map(note => [note.path, note]));
    return this.snapshot.markdownFiles
      .filter(file => file.path.startsWith(`${selected.path}/`))
      .map(file => notes.get(file.path) ?? file);
  }

  private matchesMetadata(file: DashboardFile, query: string): boolean {
    return [file.basename, file.path, ...("title" in file ? [file.title, file.source, ...file.tags.map(tag => `#${tag}`)] : [])]
      .some(value => value.toLocaleLowerCase().includes(query));
  }

  private select(selection: DashboardSelection): void {
    this.selectedView = selection;
    this.cancelSearch();
    this.bodyMatches.clear();
  }

  private reconcile(): void {
    if (this.selectedView.kind === "folder") this.selectFolder(this.selectedView.path);
    else this.select(this.selectedView);
  }
}
