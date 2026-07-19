// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R5.2 formula/computed fields. A tiny SAFE arithmetic expression evaluator over
// a record's own fields — no JS eval, no Function, no IO/global/require/process
// reachable. Supports + - * / %, parentheses, numeric/string literals, field
// references, and a small allow-listed function set (min,max,round,abs,if).
// Fields are dependency-tracked so a formula recomputes only when an input
// changes; dependency cycles are detected.
'use strict';

const infra = require('../r3-infra');
const { fail } = infra;

// ---- tokenizer ----
const TOKEN_RE = /\s*([0-9]*\.?[0-9]+|"[^"]*"|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/%,]|&&|\|\||[<>]=?|==|!=)\s*/y;
const ALLOWED_FUNCS = {
  min: Math.min, max: Math.max, round: (n, d = 0) => Math.round(Number(n) * 10 ** d) / 10 ** d,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  if: (cond, a, b) => (cond ? a : b),
};
// Identifiers that must NEVER be resolvable (defense in depth even though the
// evaluator has no host access at all).
const BANNED = new Set(['eval', 'Function', 'require', 'process', 'global', 'globalThis', 'module', 'constructor', 'prototype', '__proto__', 'window', 'this', 'import']);

function tokenize(src) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  let lastIndex = 0;
  while ((match = TOKEN_RE.exec(src))) {
    if (TOKEN_RE.lastIndex === lastIndex) break;
    lastIndex = TOKEN_RE.lastIndex;
    tokens.push(match[1]);
  }
  if (lastIndex !== src.length) throw fail('formula contains an illegal character', 400, 'FORMULA_SYNTAX');
  return tokens;
}

// ---- recursive-descent parser → AST (no eval) ----
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr() { return parseOr(); }
  function parseOr() { let node = parseAnd(); while (peek() === '||') { next(); node = { t: 'or', l: node, r: parseAnd() }; } return node; }
  function parseAnd() { let node = parseCmp(); while (peek() === '&&') { next(); node = { t: 'and', l: node, r: parseCmp() }; } return node; }
  function parseCmp() { let node = parseAdd(); while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) { const op = next(); node = { t: 'cmp', op, l: node, r: parseAdd() }; } return node; }
  function parseAdd() { let node = parseMul(); while (peek() === '+' || peek() === '-') { const op = next(); node = { t: 'bin', op, l: node, r: parseMul() }; } return node; }
  function parseMul() { let node = parseUnary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(); node = { t: 'bin', op, l: node, r: parseUnary() }; } return node; }
  function parseUnary() { if (peek() === '-') { next(); return { t: 'neg', v: parseUnary() }; } return parseAtom(); }
  function parseAtom() {
    const token = next();
    if (token === undefined) throw fail('unexpected end of formula', 400, 'FORMULA_SYNTAX');
    if (token === '(') { const node = parseExpr(); if (next() !== ')') throw fail('missing )', 400, 'FORMULA_SYNTAX'); return node; }
    if (/^[0-9]*\.?[0-9]+$/.test(token)) return { t: 'num', v: Number(token) };
    if (/^"[^"]*"$/.test(token)) return { t: 'str', v: token.slice(1, -1) };
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      if (BANNED.has(token)) throw fail(`identifier "${token}" is not allowed`, 400, 'FORMULA_FORBIDDEN');
      if (peek() === '(') { // function call
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCS, token)) throw fail(`function "${token}" is not allowed`, 400, 'FORMULA_FORBIDDEN');
        next(); const args = [];
        if (peek() !== ')') { args.push(parseExpr()); while (peek() === ',') { next(); args.push(parseExpr()); } }
        if (next() !== ')') throw fail('missing ) in call', 400, 'FORMULA_SYNTAX');
        return { t: 'call', name: token, args };
      }
      return { t: 'field', name: token };
    }
    throw fail(`unexpected token "${token}"`, 400, 'FORMULA_SYNTAX');
  }
  const ast = parseExpr();
  if (pos !== tokens.length) throw fail('trailing tokens in formula', 400, 'FORMULA_SYNTAX');
  return ast;
}

function collectDeps(ast, deps = new Set()) {
  if (!ast || typeof ast !== 'object') return deps;
  if (ast.t === 'field') deps.add(ast.name);
  for (const key of ['l', 'r', 'v']) if (ast[key]) collectDeps(ast[key], deps);
  if (ast.args) for (const arg of ast.args) collectDeps(arg, deps);
  return deps;
}

function evalAst(ast, record) {
  switch (ast.t) {
    case 'num': return ast.v;
    case 'str': return ast.v;
    case 'field': { const value = record[ast.name]; return value == null ? 0 : (typeof value === 'boolean' ? value : (isNaN(Number(value)) ? value : Number(value))); }
    case 'neg': return -Number(evalAst(ast.v, record));
    case 'bin': { const l = Number(evalAst(ast.l, record)); const r = Number(evalAst(ast.r, record)); if (ast.op === '+') return l + r; if (ast.op === '-') return l - r; if (ast.op === '*') return l * r; if (ast.op === '/') return r === 0 ? 0 : l / r; if (ast.op === '%') return r === 0 ? 0 : l % r; break; }
    case 'cmp': { const l = evalAst(ast.l, record); const r = evalAst(ast.r, record); if (ast.op === '<') return l < r; if (ast.op === '>') return l > r; if (ast.op === '<=') return l <= r; if (ast.op === '>=') return l >= r; if (ast.op === '==') return l === r; if (ast.op === '!=') return l !== r; break; }
    case 'and': return Boolean(evalAst(ast.l, record)) && Boolean(evalAst(ast.r, record));
    case 'or': return Boolean(evalAst(ast.l, record)) || Boolean(evalAst(ast.r, record));
    case 'call': return ALLOWED_FUNCS[ast.name](...ast.args.map((arg) => evalAst(arg, record)));
    default: throw fail('unknown formula node', 400, 'FORMULA_SYNTAX');
  }
  throw fail('invalid formula operation', 400, 'FORMULA_SYNTAX');
}

function compile(expression) {
  const ast = parse(tokenize(String(expression)));
  return { ast, deps: [...collectDeps(ast)] };
}

// ---- registry operations ----
function id() { return `ff_${Math.random().toString(36).slice(2, 10)}`; }

function createFormulaField(db, input, userId) {
  const entity = String(input.entity || '').trim();
  const key = String(input.key || '').trim();
  if (!entity || !key) throw fail('entity and key are required', 400, 'FORMULA_ARGS');
  if (db.prepare('SELECT 1 FROM formula_field WHERE entity=? AND key=?').get(entity, key)) throw fail('formula field already exists', 409, 'FORMULA_DUPLICATE');
  const compiled = compile(input.expression);
  // Cycle guard: a formula must not reference itself or another formula that
  // (transitively) references it.
  assertNoCycle(db, entity, key, compiled.deps);
  const row = { id: id(), entity, key, label_ar: input.label_ar || key, expression: String(input.expression), depends_on: JSON.stringify(compiled.deps), visible_when: input.visible_when || null, result_type: input.result_type || 'number', created_by: userId || null, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO formula_field(id,entity,key,label_ar,expression,depends_on,visible_when,result_type,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.entity, row.key, row.label_ar, row.expression, row.depends_on, row.visible_when, row.result_type, row.created_by, row.created_at);
  return { ...row, depends_on: compiled.deps };
}

function assertNoCycle(db, entity, key, deps, seen = new Set()) {
  if (deps.includes(key)) throw fail('formula field cannot reference itself', 409, 'FORMULA_CYCLE');
  for (const dep of deps) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    const depFormula = db.prepare('SELECT key, depends_on FROM formula_field WHERE entity=? AND key=?').get(entity, dep);
    if (depFormula) {
      const depDeps = JSON.parse(depFormula.depends_on);
      if (depDeps.includes(key)) throw fail('formula fields form a dependency cycle', 409, 'FORMULA_CYCLE');
      assertNoCycle(db, entity, key, depDeps, seen);
    }
  }
}

function listFormulaFields(db, entity) {
  return db.prepare('SELECT id, entity, key, label_ar, expression, depends_on, visible_when, result_type FROM formula_field WHERE entity=? ORDER BY key').all(entity)
    .map((row) => ({ ...row, depends_on: JSON.parse(row.depends_on) }));
}

// Recompute every formula field for a record; recomputes in dependency order so
// formulas that reference other formulas see fresh values. Returns { key: value }.
function computeForRecord(db, entity, record) {
  const formulas = listFormulaFields(db, entity);
  const byKey = new Map(formulas.map((formula) => [formula.key, formula]));
  const computed = { ...record };
  const done = new Set();
  function resolve(formula, stack = new Set()) {
    if (done.has(formula.key)) return;
    if (stack.has(formula.key)) throw fail('cycle during recompute', 409, 'FORMULA_CYCLE');
    stack.add(formula.key);
    for (const dep of formula.depends_on) if (byKey.has(dep)) resolve(byKey.get(dep), stack);
    computed[formula.key] = evalAst(parse(tokenize(formula.expression)), computed);
    done.add(formula.key);
  }
  for (const formula of formulas) resolve(formula);
  const result = {};
  for (const formula of formulas) result[formula.key] = computed[formula.key];
  return result;
}

// Which formula fields must recompute given a set of changed input fields.
function affectedByChange(db, entity, changedFields) {
  const changed = new Set(changedFields);
  return listFormulaFields(db, entity).filter((formula) => formula.depends_on.some((dep) => changed.has(dep))).map((formula) => formula.key);
}

// Conditional visibility: evaluate a formula field's visible_when expression.
function isVisible(db, entity, key, record) {
  const formula = db.prepare('SELECT visible_when FROM formula_field WHERE entity=? AND key=?').get(entity, key);
  if (!formula || !formula.visible_when) return true;
  return Boolean(evalAst(parse(tokenize(formula.visible_when)), record));
}

module.exports = { compile, createFormulaField, listFormulaFields, computeForRecord, affectedByChange, isVisible, _eval: (expr, record) => evalAst(parse(tokenize(expr)), record) };
