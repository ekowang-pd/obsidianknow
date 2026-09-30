# Deer Notes 0.3.5

Adds folder browsing and safe in-dashboard reading for Markdown, HTML, and local images. Markdown and HTML source can be edited and saved directly; a concurrent modification check avoids silently overwriting a newer file. Images remain read-only.

This release replaces 0.3.4. The HTML preview now uses DOMPurify's sanitized DOM fragment directly, avoiding the `innerHTML` assignment rejected by the community scanner.
