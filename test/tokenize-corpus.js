// Validates syntaxes/phh.tmLanguage.json against the real corpus, outside
// any VS Code window: vscode-textmate (the same tokenizer engine VS Code
// itself uses) plus vscode-oniguruma (its regex engine) run as a plain
// Node library. This is the TextMate-grammar equivalent of what
// `tree-sitter parse`/`tree-sitter query` did for tree-sitter-phh: real
// verification against real data, not just "the JSON is well-formed."
//
// Deliberately does NOT launch a VS Code Extension Development Host
// (@vscode/test-electron), since that would open a real GUI window on
// whoever runs this, and tokenization is testable as a pure library call.
"use strict";

const fs = require("fs");
const path = require("path");
const oniguruma = require("vscode-oniguruma");
const { Registry, INITIAL, parseRawGrammar } = require("vscode-textmate");

const GRAMMAR_PATH = path.join(__dirname, "..", "syntaxes", "phh.tmLanguage.json");
const CORPUS_ROOT = path.join(__dirname, "..", "..", "phh", "corpus");

async function loadOniguruma() {
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  const wasmBin = fs.readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasmBin);
  return {
    createOnigScanner(patterns) {
      return new oniguruma.OnigScanner(patterns);
    },
    createOnigString(s) {
      return new oniguruma.OnigString(s);
    },
  };
}

function listCorpusFiles() {
  const out = [];
  for (const sub of ["valid", "invalid"]) {
    const dir = path.join(CORPUS_ROOT, sub);
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".phh") || name.endsWith(".phhs")) {
        out.push({ sub, path: path.join(dir, name), name });
      }
    }
  }
  return out;
}

function scopesAt(tokens, lineText, needle) {
  const idx = lineText.indexOf(needle);
  if (idx === -1) return null;
  for (const t of tokens) {
    if (idx >= t.startIndex && idx < t.endIndex) return t.scopes;
  }
  return null;
}

async function main() {
  const vscodeOnigLib = loadOniguruma();
  const registry = new Registry({
    onigLib: vscodeOnigLib,
    loadGrammar: async (scopeName) => {
      if (scopeName !== "source.phh") return null;
      const content = fs.readFileSync(GRAMMAR_PATH, "utf8");
      return parseRawGrammar(content, GRAMMAR_PATH);
    },
  });

  const grammar = await registry.loadGrammar("source.phh");
  if (!grammar) throw new Error("failed to load source.phh grammar");

  let failures = 0;
  function check(label, cond) {
    console.log(`[${cond ? "ok" : "FAIL"}] ${label}`);
    if (!cond) failures++;
  }

  const files = listCorpusFiles();
  check("found corpus files to tokenize", files.length > 0);

  for (const file of files) {
    const text = fs.readFileSync(file.path, "utf8");
    const lines = text.split(/\r?\n/);
    let ruleStack = INITIAL;
    let anyErrorScope = false;

    for (const line of lines) {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      for (const t of result.tokens) {
        if (t.scopes.some((s) => s.includes("invalid"))) anyErrorScope = true;
      }
    }
    check(`${file.sub}/${file.name}: tokenizes with no 'invalid' scope`, !anyErrorScope);
  }

  // Targeted scope checks against one real file with known content.
  {
    const file = path.join(CORPUS_ROOT, "valid", "antonius-dwan-ivey-2009.phh");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    let ruleStack = INITIAL;
    const perLineTokens = [];
    for (const line of lines) {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      perLineTokens.push(result.tokens);
    }

    const variantLineIdx = lines.findIndex((l) => l.startsWith("variant"));
    const variantScopes = scopesAt(perLineTokens[variantLineIdx], lines[variantLineIdx], "NT");
    check(
      "variant value \"NT\" gets support.constant.variant-code.phh",
      !!variantScopes && variantScopes.some((s) => s === "support.constant.variant-code.phh")
    );

    const actionLineIdx = lines.findIndex((l) => l.includes("d dh p1 Ac2d"));
    const actionLine = lines[actionLineIdx];
    const actionTokens = perLineTokens[actionLineIdx];
    check(
      "action string actor \"d\" gets keyword.control.actor.dealer.phh",
      !!scopesAt(actionTokens, actionLine, "d dh")?.some((s) =>
        s === "keyword.control.actor.dealer.phh"
      )
    );
    check(
      "action string verb \"dh\" gets support.function.action-verb.phh",
      !!scopesAt(actionTokens, actionLine, "dh p1")?.some((s) =>
        s === "support.function.action-verb.phh"
      )
    );
    check(
      "action string player ref \"p1\" gets variable.parameter.actor.player.phh",
      !!scopesAt(actionTokens, actionLine, "p1 Ac2d")?.some((s) =>
        s === "variable.parameter.actor.player.phh"
      )
    );
    check(
      "action string card \"Ac\" gets constant.character.card.phh",
      !!scopesAt(actionTokens, actionLine, "Ac2d")?.some((s) =>
        s === "constant.character.card.phh"
      )
    );

    const commentLineIdx = 0;
    const commentScopes = scopesAt(perLineTokens[commentLineIdx], lines[commentLineIdx], "#");
    check(
      "a leading TOML comment gets comment.line.number-sign.phh",
      !!commentScopes && commentScopes.some((s) => s === "comment.line.number-sign.phh")
    );
  }

  // The event field containing a literal '#' must NOT be cut short the way
  // the tree-sitter-phh grammar's first draft was (see
  // tree-sitter-phh/README.md "A real bug this corpus caught"). The whole
  // quoted string, '#' included, should tokenize as one string, not break
  // into a string followed by a comment.
  {
    const file = path.join(CORPUS_ROOT, "valid", "arieh-esposito-hui-yockey-2019.phh");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    let ruleStack = INITIAL;
    let eventLine, eventTokens;
    for (const line of lines) {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      if (line.startsWith("event")) {
        eventLine = line;
        eventTokens = result.tokens;
      }
    }
    const hashScopes = scopesAt(eventTokens, eventLine, "#58");
    check(
      "literal '#' inside a quoted field value stays inside the string scope",
      !!hashScopes && hashScopes.some((s) => s.startsWith("string.quoted"))
    );
  }

  console.log();
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("All grammar checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
