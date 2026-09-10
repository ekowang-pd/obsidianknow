import { DEER_MARK_PATHS } from "./brand-mark";

// Shared solid silhouettes for the plugin and browser preview. All cutouts use
// even-odd fill, so icons remain legible on selected buttons and in dark themes.
const paths: Record<string, string> = {
  notebook: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 0v18h2V3H6Zm5 4v2h7V7h-7Zm0 5v2h5v-2h-5Z",
  folder: "M3 4h6l2 2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  "chart-no-axes-combined": "M3 13h4v8H3v-8Zm7-5h4v13h-4V8Zm7-5h4v18h-4V3Z",
  tag: "M3 2h8l11 11a2 2 0 0 1 0 3l-6 6a2 2 0 0 1-3 0L2 11V3a1 1 0 0 1 1-1Zm4 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  image: "M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 18h16l-5-7-4 5-3-3-4 5Z",
  bold: "M6 3h7a5 5 0 0 1 3.6 8.5A5 5 0 0 1 14 21H6V3Zm4 3v4h3a2 2 0 0 0 0-4h-3Zm0 7v5h4a2.5 2.5 0 0 0 0-5h-4Z",
  list: "M3 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 5h14v2H8V5Zm0 6h14v2H8v-2Zm0 6h14v2H8v-2Z",
  "list-ordered": "M3 2h2v7H3V4H1V2h2Zm-2 9h4a2 2 0 0 1 2 2v1l-4 4h4v2H1v-2l4-4v-1H1v-2ZM10 4h12v3H10V4Zm0 7h12v3H10v-3Zm0 7h12v3H10v-3Z",
  eye: "M1 12C3 7 7 4 12 4s9 3 11 8c-2 5-6 8-11 8S3 17 1 12Zm11-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  plus: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z",
  search: "M10 2a8 8 0 1 0 4.9 14.3l5.7 5.7 2.1-2.1-5.7-5.7A8 8 0 0 0 10 2Zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  "arrow-left": "M11 3 2 12l9 9 2.5-2.5-5-5H22v-3H8.5l5-5L11 3Z",
};

export function setFilledIcon(element: HTMLElement, name: string): void {
  const shapes = name === "deer-brand" ? DEER_MARK_PATHS : paths[name] ? [paths[name]] : [];
  if (!shapes.length) return;
  const document = element.ownerDocument;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", name === "deer-brand" ? "0 0 32 32" : "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("stroke", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const shape of shapes) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", shape);
    path.setAttribute("fill-rule", "evenodd");
    svg.append(path);
  }
  element.replaceChildren(svg);
}
