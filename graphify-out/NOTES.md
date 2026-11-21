# Graph provenance

This graph was NOT built directly from `index.html`.

`graphify detect` classifies `index.html` as a **document**, not code — its
tree-sitter parser set has no HTML grammar. A direct run reports:

    [graphify extract] found 0 code, 0 docs, 0 papers, 0 images
    [graphify extract] graph is empty — extraction produced no nodes

`index.html` is bundler output: line 376 is a JSON manifest of four base64
assets, line 388 is the real HTML document as a JSON string literal.

`derived-src/` holds what was unpacked from it, and is what the graph indexes:

| File | Origin |
|---|---|
| `app.js` | asset `<script type="text/x-dc">` in the embedded document — the application source |
| `dc-runtime.js` | asset `606d7e7e-…`, gzip+base64, generated from `dc-runtime/src/*.ts` |
| `embedded-document.html` | line 388 of `index.html`, JSON-unescaped |

Two further assets were decoded and excluded as vendor code: `ec8e5998-…`
(React production) and `68fdc4d5-…` (React-DOM production + Modernizr).

Graph: 172 nodes, 371 edges, 15 communities. Communities are unnamed
(`cluster-only --no-label`) — naming needs an LLM backend.

Rebuild:

    graphify extract graphify-out/derived-src --code-only
    graphify cluster-only graphify-out/derived-src --no-label

`index.html` was not modified.
