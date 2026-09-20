# Csound Web IDE migration

This compatibility entry lets the Web IDE replace
`@hlolli/codemirror-lang-csound` with `@kunstmusik/codemirror-lang-csound`
after an upstream release includes these changes.

## Imports and options

Change the import in `src/components/editor/editor.tsx` and
`src/components/editor/utils.test.ts`:

```ts
import { csoundMode } from "@kunstmusik/codemirror-lang-csound"
```

Replace the package dependency at the same time. Keep `csoundMode({ fileType })`.
The mode defaults to `csd` and also accepts `orc` and `sco`. The IDE already maps
other file types, including UDO files, to `orc`.

`enableCompletion`, `enableSynopsis`, and `enableDefaultTheme` default to true.
Setting `enableDefaultTheme: false` retains the CSS hooks below. Setting
`enableSynopsis: false` removes the panel. Setting `enableCompletion: false`
removes this language's completion source.

Use `csound({ mode })` when switching to upstream's semantic colors and hover UI.
For that API, the options remain `semanticHighlighting` and `hover`.

## Theme contract

`src/styles/code-mirror-painter.tsx` styles these classes:

| Classes | Meaning |
| --- | --- |
| `cm-csound-define` | Instruments, UDOs, declarations, and definitions |
| `cm-csound-control-flow` | Branches, loops, and control statements |
| `cm-csound-opcode` | Built-in and document-local opcode calls |
| `cm-csound-global-var` | An extra class on global variables |
| `cm-csound-a-rate-var`, `cm-csound-k-rate-var` | Audio and control variables |
| `cm-csound-s-rate-var`, `cm-csound-f-rate-var` | Strings and spectral variables |
| `cm-csound-p-field-var` | P-fields |
| `cm-csound-global-constant` | Header names, including all of `0dbfs` |
| `cm-csound-macro-token` | Macro uses |
| `cm-panels-bottom` | CodeMirror's panel container |

The compatibility highlighter also supplies classes for init variables, numbers,
booleans, comments, XML tags, labels, and brackets. It uses explicit types such as
`signal@global:a` before legacy rate prefixes. The panel uses DOM text nodes for
opcode help and clears stale results when the cursor moves.
The rich help catalog loads on demand through a bundler-visible import, so
browser builds can keep named arguments in a separate chunk.

## Block evaluation

The IDE's `findSurroundingContext` in `src/components/editor/utils.ts` relies on:

- `InstrumentDefinition` and `UdoDefinition` for whole-block evaluation.
- `OrcStatement` inside `OrcStatements` for a top-level orchestra statement.
- `ScoStatement` inside `ScoStatements` for a score statement.

These nodes remain available in bare files and CSD blocks. The integration tests
exercise the same walk for classic UDOs, multiline modern UDOs, instruments, and
individual orchestra and score statements.

## Csound 7

The parser adds `declare`, multiline modern UDO signatures, `truek` and `falsek`,
Unicode names, legacy boolean-rate names, typed multidimensional arrays, and
indexing or slicing an array literal or parenthesized expression. Completion,
hover, and semantic analysis also recognize Unicode UDO names.

The source checkout keeps its npm/Node build and ESM/CommonJS outputs.
The migration does not require Bun in the IDE or in package consumers.
