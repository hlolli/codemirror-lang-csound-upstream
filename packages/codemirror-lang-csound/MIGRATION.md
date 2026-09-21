# Host migration

Version 1.0.3 prepares hosts to replace `@hlolli/codemirror-lang-csound`.
It must ship as a new version, not as changed contents under 1.0.2.

## Core interface

Use the main entry for language support:

```ts
import { csound, getCsoundHoverInfo } from "@kunstmusik/codemirror-lang-csound"

csound({ mode: "orc", semanticHighlighting: false, hover: false })
const info = await getCsoundHoverInfo("oscili", { documentText })
```

The package owns parsing, Csound 7 syntax, semantic classification, completion,
hover data, and generic folding, indentation, comment, and bracket metadata.
Set `completion: false` when a host supplies its own completion source.
The existing semantic-highlighting and hover extensions remain available.
The rich help catalog loads on demand through a bundler-visible import.

## Temporary compatibility entry

```ts
import { csoundMode } from "@kunstmusik/codemirror-lang-csound/compat"

csoundMode({ fileType: "orc", enableCompletion: true })
```

This language-only adapter maps `fileType` to `mode` and `enableCompletion`
to `completion`. It defaults to CSD with completion enabled. It adds no colors,
legacy CSS classes, synopsis panel, hover UI, evaluation policy, or preferred
indent unit. Hosts supply those choices. It is not a drop-in replacement for
the old package's presentation behavior.

The adapter also exports `csdLanguage`, `orcLanguage`, and `scoLanguage`.
The main entry does not export these aliases or `csoundMode`. New integrations
should use the core interface directly. Existing core consumers such as Blue
do not need the compatibility entry.

## Web IDE responsibilities

The companion Web IDE migration uses `csound({ mode })` directly and owns:

- Its synopsis DOM, panel layout, and stale-result handling, using
  `getCsoundHoverInfo` for data.
- Rate colors and the `cm-csound-*` theme classes.
- File-type mapping, indentation preferences, keys, and editor state.
- Context selection and Csound execution.

The IDE adapts the current syntax tree inside its own `findSurroundingContext`
helper and returns plain `{ from, to, kind }` values to evaluation code.
Its tests cover whole instruments, legacy and modern UDOs, top-level orchestra
and score statements, and their actual execution routes.

Parser node names remain implementation details, not an evaluation interface
promised by this package. A reusable range helper can follow if another host
needs the same policy.

## Test and release split

Package tests prove language behavior, entry-point isolation, ESM/CommonJS
support, and browser catalog loading. Web IDE tests prove presentation and
evaluation behavior. The language package needs no DOM test dependency for
the IDE's UI.

Publish 1.0.3 or a later version after merging the language changes. Then update
host dependencies and lockfiles. Hosts pinned to 1.0.2, including Blue, must
explicitly choose the new version to receive these changes.
