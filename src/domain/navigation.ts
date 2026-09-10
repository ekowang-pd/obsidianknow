import type { DeerNotesSettings } from "../settings";

export interface RootNavItem {
  path: string;
  label: string;
}

export function buildRootNavigation(
  folders: string[],
  settings: DeerNotesSettings
): RootNavItem[] {
  const hidden = new Set(settings.hiddenRootFolders);

  return folders
    .filter((path) => (
      !path.startsWith(".") &&
      path !== settings.notesFolder &&
      !hidden.has(path)
    ))
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
    .map((path) => ({ path, label: path }));
}
