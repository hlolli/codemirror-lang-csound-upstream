import { syntaxTree } from "@codemirror/language"
import type { Extension, Range } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view"
import { collectUserOpcodeSignatures, type OpcodeSignature } from "./opcodes.js"
import { findSemanticSpans } from "./semantic.js"

const identifierNodes = new Set([
  "Identifier", "LegacyTypeIdentifier", "TypedIdentifier", "GlobalTypedIdentifier",
  "ArrayIdentifier", "TypedArrayIdentifier", "GlobalTypedArrayIdentifier", "HeaderIdentifier", "PField",
])
const headerNames = new Set(["sr", "kr", "ksmps", "nchnls", "nchnls_i", "nchnls_hw", "0dbfs"])
const definitionNodes = new Set(["instr", "endin", "opcode", "endop", "struct", "declare", "void", "HashDefine", "HashUndef"])
const controlNodes = new Set([
  "if", "then", "ithen", "kthen", "elseif", "else", "endif", "fi", "while", "until", "do",
  "od", "enduntil", "for", "in", "switch", "case", "default", "endsw", "goto", "igoto", "kgoto",
  "rigoto", "reinit", "break", "continue", "return", "rireturn", "xin", "xout",
  "HashIfdef", "HashIfndef", "HashElse", "HashEnd",
])

function identifierClass(text: string, parent: string | undefined, isOpcode: boolean): string | null {
  if (parent === "MemberAccessSegment") return null
  if (headerNames.has(text)) return "cm-csound-global-constant"
  if (/^p\d+$/.test(text)) return "cm-csound-p-field-var"
  if (parent === "LabelName") return "cm-csound-goto-token"
  if (parent === "FunctionCallee" || parent === "ScoreFunctionCallee" || parent === "UdoName" ||
      isOpcode) return "cm-csound-opcode"

  const explicitRate = /:([akiSf])(?:\[\])*$/.exec(text)?.[1]
  const rate = explicitRate ?? /^(?:g)?([akiSf])/.exec(text)?.[1] ?? "i"
  const global = text.includes("@global:") || (!text.includes(":") && /^g[akiSf]/.test(text))
  return `cm-csound-${rate.toLowerCase()}-rate-var${global ? " cm-csound-global-var" : ""}`
}

function decorations(view: EditorView, userOpcodes: Map<string, OpcodeSignature[]>): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const seen = new Set<string>()
  const opcodePositions = new Set<number>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        // A token can straddle more than one visible range.
        if (node.to <= from || node.from >= to) return
        if (node.name === "OrcGenericLine") {
          const text = view.state.sliceDoc(node.from, node.to)
          for (const span of findSemanticSpans(text, node.from, userOpcodes)) {
            if (span.kind === "builtInOpcode" || span.kind === "userOpcode") opcodePositions.add(span.from)
          }
        }
        let className: string | null = null
        if (identifierNodes.has(node.name)) {
          className = identifierClass(view.state.sliceDoc(node.from, node.to), node.node.parent?.name, opcodePositions.has(node.from))
        } else if (definitionNodes.has(node.name)) className = "cm-csound-define"
        else if (controlNodes.has(node.name)) className = "cm-csound-control-flow"
        else if (node.name === "MacroUsageToken") className = "cm-csound-macro-token"
        else if (node.name === "ScoreOpcode") className = "cm-csound-opcode"
        else if (node.name === "String" || node.name === "RawString") className = "cm-csound-s-rate-var"
        else if (node.name === "Number") className = "cm-csound-number"
        else if (node.name === "BooleanLiteral") className = "cm-csound-boolean"
        else if (/^[()[\]{}]$/.test(node.name)) className = "cm-csound-bracket"
        else if (/^(LineComment|BlockComment|LineContinuation)$/.test(node.name)) className = "cm-csound-comment"
        else if (/^Csd/.test(node.name) && /(?:Tag|Open|Close|Csbeats)$/.test(node.name)) className = "cm-csound-xml-tag"
        if (className && node.from < node.to) {
          const key = node.from + ":" + node.to + ":" + node.name
          if (seen.has(key)) return false
          seen.add(key)
          ranges.push(Decoration.mark({ class: className }).range(node.from, node.to))
          return false
        }
      },
    })
  }
  return Decoration.set(ranges, true)
}

/**
 * Stable CSS classes used by the Csound Web IDE and @hlolli themes.
 * Rates determine variable colors; globals carry an extra class.
 */
export function csoundLegacyHighlighting(): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    userOpcodes: Map<string, OpcodeSignature[]>
    tree

    constructor(view: EditorView) {
      this.userOpcodes = collectUserOpcodeSignatures(view.state.doc.toString())
      this.tree = syntaxTree(view.state)
      this.decorations = decorations(view, this.userOpcodes)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.userOpcodes = collectUserOpcodeSignatures(update.state.doc.toString())
      const tree = syntaxTree(update.state)
      if (update.docChanged || update.viewportChanged || tree !== this.tree) {
        this.tree = tree
        this.decorations = decorations(update.view, this.userOpcodes)
      }
    }
  }, { decorations: plugin => plugin.decorations })
}

/** Default colors for the compatibility mode. Host CSS can override these. */
export const csoundLegacyTheme = EditorView.baseTheme({
  ".cm-csound-global-var": { fontWeight: "600" },
  ".cm-csound-i-rate-var": { color: "#29a8ff" },
  ".cm-csound-a-rate-var": { color: "#6237ff" },
  ".cm-csound-k-rate-var": { color: "#6c82ab" },
  ".cm-csound-s-rate-var": { color: "#a11" },
  ".cm-csound-f-rate-var": { color: "#004761" },
  ".cm-csound-opcode": { color: "#005cc5" },
  ".cm-csound-define": { color: "#6f42c1" },
  ".cm-csound-control-flow, .cm-csound-global-constant, .cm-csound-xml-tag, .cm-csound-bracket": { color: "#22863a" },
  ".cm-csound-p-field-var": { color: "#ff9d0c", fontWeight: "600" },
  ".cm-csound-goto-token": { color: "#59648b", fontWeight: "600" },
  ".cm-csound-macro-token": { color: "red" },
  ".cm-csound-number": { color: "#0550ae" },
  ".cm-csound-boolean": { color: "#cf222e" },
  ".cm-csound-comment": { color: "gray" },
})
