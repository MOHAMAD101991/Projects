# Graph Report - corpus  (2026-11-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 172 nodes · 371 edges · 15 communities (9 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 4
- Community 7
- Community 8
- Community 10
- Community 12
- Community 13
- Community 14

## God Nodes (most connected - your core abstractions)
1. `Component` - 77 edges
2. `createRuntime()` - 15 edges
3. `getReact()` - 9 edges
4. `walk()` - 9 edges
5. `walkElement()` - 9 edges
6. `walkXImport()` - 9 edges
7. `boot()` - 8 edges
8. `resolve()` - 8 edges
9. `walkChildren()` - 8 edges
10. `createExternalModules()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `load()` --calls--> `bundledBlob()`  [EXTRACTED]
  dc-runtime.js → dc-runtime.js  _Bridges community 0 → community 7_
- `createComponentFactory()` --calls--> `getReact()`  [EXTRACTED]
  dc-runtime.js → dc-runtime.js  _Bridges community 0 → community 14_
- `createRuntime()` --calls--> `createPseudoSheet()`  [EXTRACTED]
  dc-runtime.js → dc-runtime.js  _Bridges community 0 → community 12_
- `init()` --calls--> `createRuntime()`  [EXTRACTED]
  dc-runtime.js → dc-runtime.js  _Bridges community 0 → community 10_
- `updateHtml()` --calls--> `compileTemplate()`  [EXTRACTED]
  dc-runtime.js → dc-runtime.js  _Bridges community 0 → community 1_

## Import Cycles
- None detected.

## Communities (15 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (20): bundledBlob(), createComponentFactory(), getDC(), createHelmetManager(), applyCanvasBg(), compile(), postDesignMode(), setDesignDocMode() (+12 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (10): cdnScriptFor(), compileTemplate(), contentKey(), dcNameFromPath(), encodeCamelAttrs(), encodeCase(), loadReactUmd(), loadScript() (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (14): collectProps(), compileAttr(), cssToObj(), hostPositionStyle(), isDeckMountTag(), kebabToCamel(), walk(), walkChildren() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (8): createExternalModules(), ensureBabel(), load(), resolveGlobal(), waitForGlobal(), isElementClass(), isRenderableType(), resolveDottedPath()

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (6): COLUMNS, MANPOWER_COLUMNS, NUMERIC, OPTION_GROUPS, REPORT_COLUMNS, REPORT_SEED

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (7): boot(), createStreamTracker(), getReactDOM(), init(), parseDataProps(), parseDcDocument(), parseDcText()

### Community 12 - "Community 12"
Cohesion: 0.67
Nodes (4): createPseudoSheet(), importantify(), scanUnquotedUrl(), stripComments()

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (4): findTopLevelEquality(), parensWrapWhole(), resolve(), resolvePath()

### Community 14 - "Community 14"
Cohesion: 0.50
Nodes (4): getReact(), renderDeckKids(), walkText(), warnUnresolved()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Component` connect `Community 2` to `Community 3`, `Community 5`, `Community 6`, `Community 8`, `Community 9`, `Community 11`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `createRuntime()` (e.g. with `adoptParsed()` and `dcUpdate()`) actually correct?**
  _`createRuntime()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13852813852813853 - nodes in this community are weakly interconnected._
- **Why does `createRuntime()` connect `Community 0` to `Community 1`, `Community 10`, `Community 12`, `Community 7`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12380952380952381 - nodes in this community are weakly interconnected._
- **Why does `createExternalModules()` connect `Community 7` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14210526315789473 - nodes in this community are weakly interconnected._