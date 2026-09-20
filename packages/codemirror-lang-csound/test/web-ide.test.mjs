import assert from "node:assert/strict"
import test, { after, before } from "node:test"
import { JSDOM } from "jsdom"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { syntaxTree } from "@codemirror/language"
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight"
import {
  csound, csoundMode, csoundCsdLanguage, csoundOrcLanguage, csoundScoLanguage,
  csdLanguage, orcLanguage, scoLanguage,
  loadCsoundRichOpcodeCatalog,
} from "../dist/index.js"

let browser
before(() => {
  browser = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
  for (const name of ["window", "document", "MutationObserver", "HTMLElement", "Node"]) {
    globalThis[name] = browser.window[name]
  }
  globalThis.requestAnimationFrame = browser.window.requestAnimationFrame.bind(browser.window)
  globalThis.cancelAnimationFrame = browser.window.cancelAnimationFrame.bind(browser.window)
  globalThis.getComputedStyle = browser.window.getComputedStyle.bind(browser.window)
})
after(() => browser.window.close())

function editor(t, doc, options = {}, position = 0) {
  const parent = document.createElement("div")
  document.body.append(parent)
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: position }, extensions: [csoundMode(options)] }),
    parent,
  })
  t.after(() => { view.destroy(); parent.remove() })
  return view
}

function marked(view, className, token) {
  return Array.from(view.contentDOM.querySelectorAll("." + className)).find(node => node.textContent === token)
}

// Mirrors the web IDE's findSurroundingContext: these node names are a consumer contract.
function contextAt(source, fileType, search) {
  const state = EditorState.create({ doc: source, extensions: [csoundMode({ fileType })] })
  let node = syntaxTree(state).cursorAt(source.indexOf(search), 1).node
  let statement
  while (node) {
    if (["InstrumentDefinition", "UdoDefinition"].includes(node.name)) return source.slice(node.from, node.to)
    if ((node.name === "OrcStatement" && node.parent?.name === "OrcStatements") ||
        (node.name === "ScoStatement" && node.parent?.name === "ScoStatements")) statement = node
    node = node.parent
  }
  return statement && source.slice(statement.from, statement.to)
}

test("compatibility names, modes and completion switches match the web IDE API", () => {
  assert.equal(csdLanguage, csoundCsdLanguage)
  assert.equal(orcLanguage, csoundOrcLanguage)
  assert.equal(scoLanguage, csoundScoLanguage)
  assert.equal(csoundMode().language, csdLanguage)
  for (const fileType of ["csd", "orc", "sco"]) {
    for (const enabled of [true, false]) {
      const state = EditorState.create({ extensions: [csoundMode({
        fileType, enableCompletion: enabled, enableSynopsis: false, enableDefaultTheme: false,
      })] })
      assert.equal(state.languageDataAt("autocomplete", 0).length, enabled ? 1 : 0)
    }
  }
  assert.equal(csound({ mode: "orc" }).language, orcLanguage)
})

test("block evaluation selects instruments, UDOs and top-level orchestra/score statements", () => {
  const instrument = "instr 1\n  a1 oscili 0.2, 440\n  out a1\nendin"
  const legacy = "opcode PassThrough, a, a\n  ain xin\n  xout ain\nendop"
  const modern = "opcode PassThrough(\n  signal:a\n):a\n  xout(signal)\nendop"
  assert.equal(contextAt(instrument + "\n", "orc", "oscili"), instrument)
  assert.equal(contextAt(legacy + "\n", "orc", "xout"), legacy)
  assert.equal(contextAt(modern + "\n", "orc", "xout"), modern)
  assert.equal(contextAt('giValue init 1\nprints "ready"\n', "orc", "prints"), 'prints "ready"\n')
  assert.equal(contextAt("f 1 0 1024 10 1\ni 1 0 1\n", "sco", "i 1"), "i 1 0 1\n")
  assert.equal(contextAt("<CsoundSynthesizer>\n<CsInstruments>\n" + instrument +
    "\n</CsInstruments>\n</CsoundSynthesizer>\n", "csd", "oscili"), instrument)
})

test("0dbfs highlights as one constant with standard CodeMirror themes", () => {
  const doc = "0dbfs = 1\n"
  const state = EditorState.create({ doc, extensions: [orcLanguage] })
  const spans = []
  highlightTree(syntaxTree(state), tagHighlighter([{ tag: tags.constant(tags.variableName), class: "constant" }]),
    (from, to) => spans.push(doc.slice(from, to)))
  assert.deepEqual(spans, ["0dbfs"])
})

test("the DOM exposes every CSS hook used by the web IDE themes", t => {
  const doc = [
    "0dbfs = 1",
    "#define LEVEL #0.2#",
    "gaSig init 0",
    "instr 1",
    "  aSig oscili $LEVEL, 440",
    "  kRate = 1",
    '  SText = "hi"',
    "  fSpec pvsanal aSig, 1024, 256, 1024, 1",
    "  kTime = p3",
    "  if kRate > 0 then",
    "    out aSig",
    "  endif",
    "endin",
    "",
  ].join("\n")
  const view = editor(t, doc, { fileType: "orc", enableSynopsis: false, enableDefaultTheme: false })
  const expected = {
    "cm-csound-define": "instr",
    "cm-csound-control-flow": "if",
    "cm-csound-opcode": "oscili",
    "cm-csound-global-var": "gaSig",
    "cm-csound-a-rate-var": "aSig",
    "cm-csound-k-rate-var": "kRate",
    "cm-csound-s-rate-var": "SText",
    "cm-csound-f-rate-var": "fSpec",
    "cm-csound-p-field-var": "p3",
    "cm-csound-global-constant": "0dbfs",
    "cm-csound-macro-token": "$LEVEL",
  }
  for (const [className, token] of Object.entries(expected)) assert.ok(marked(view, className, token), className)
  view.dispatch({ changes: { from: 0, to: 5, insert: "nchnls" } })
  assert.ok(marked(view, "cm-csound-global-constant", "nchnls"))
  assert.equal(view.dom.querySelector(".cm-panels-bottom"), null)
})

test("explicit types and globals choose rates without styling member names", t => {
  const view = editor(t, "voice@global:a init 0\ncounter:k = 1\ntext@global:S = \"hi\"\nvalue = point.field\n",
    { fileType: "orc", enableSynopsis: false })
  assert.ok(marked(view, "cm-csound-global-var", "voice@global:a"))
  assert.ok(marked(view, "cm-csound-a-rate-var", "voice@global:a"))
  assert.ok(marked(view, "cm-csound-k-rate-var", "counter:k"))
  assert.ok(marked(view, "cm-csound-s-rate-var", "text@global:S"))
  assert.equal(marked(view, "cm-csound-f-rate-var", "field"), undefined)
})

async function settle() {
  // A UDO needs no rich-catalog import, but the panel renders asynchronously.
  await new Promise(resolve => setImmediate(resolve))
}

test("synopsis shows built-in help from old-style and function-style calls", async t => {
  await loadCsoundRichOpcodeCatalog()
  for (const line of ["a1 oscili 0.2, 440", "a1 = oscili:a(0.2, 440)"]) {
    const view = editor(t, line + "\n", { fileType: "orc" }, line.indexOf("440"))
    await settle()
    const panel = view.dom.querySelector(".cm-csound-synopsis")
    assert.equal(panel.querySelector(".cm-csound-opcode").textContent, "oscili")
    assert.match(panel.textContent, /oscili.*440|oscili.*oscillator|oscili.*table/i)
  }
})

test("synopsis follows the cursor and edits, clears on empty lines, and ignores stale results", async t => {
  const doc = "opcode localPass(signal:a):a\n  xout(signal)\nendop\naSig = localPass(0.2)\n\n"
  const position = doc.indexOf("0.2")
  const view = editor(t, doc, { fileType: "orc" }, position)
  await settle()
  const panel = view.dom.querySelector(".cm-panels-bottom .cm-csound-synopsis")
  assert.ok(panel)
  assert.match(panel.textContent, /localPass/)
  const call = doc.lastIndexOf("localPass")
  view.dispatch({ changes: { from: call, to: call + "localPass".length, insert: "unknownCall" } })
  await settle()
  assert.equal(panel.textContent, "")
  view.dispatch({ changes: { from: call, to: call + "unknownCall".length, insert: "localPass" },
    selection: { anchor: position } })
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  await settle()
  assert.equal(panel.textContent, "")
})

test("default csound keeps semantic highlighting and does not add the compatibility panel", t => {
  const parent = document.createElement("div")
  document.body.append(parent)
  const view = new EditorView({ doc: "a1 oscili 0.2, 440\n", extensions: [csound({ mode: "orc" })], parent })
  t.after(() => { view.destroy(); parent.remove() })
  assert.ok(view.contentDOM.querySelector(".cm-csoundBuiltinOpcode"))
  assert.equal(view.dom.querySelector(".cm-csound-synopsis"), null)
})
