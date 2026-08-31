import React, { useState, useRef } from "react";

// ============================================================
// ASAS — a tiny language interpreter (lexer -> parser -> evaluator)
// V1 scope: numbers, arithmetic (+ - * /), variables (let), print()
// V2: structured errors with line numbers + hints, "insight" messages
// for successful-but-non-obvious runs, plus new language features:
// strings, comments (#), booleans, comparisons, and/or/not, if/else.
// ============================================================

// ---------- ERRORS ----------
class AsasError extends Error {
  constructor({ line, message, hint }) {
    super(message);
    this.name = "AsasError";
    this.line = line;
    this.hint = hint || null;
  }
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function closestName(target, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const name of candidates) {
    const d = levenshtein(target, name);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return bestDist > 0 && bestDist <= 2 ? best : null;
}

// ---------- LEXER ----------
const TokenType = {
  NUMBER: "NUMBER",
  STRING: "STRING",
  IDENT: "IDENT",
  LET: "LET",
  PRINT: "PRINT",
  IF: "IF",
  ELSE: "ELSE",
  TRUE: "TRUE",
  FALSE: "FALSE",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  EQUALS: "EQUALS",
  EQEQ: "EQEQ",
  NEQ: "NEQ",
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  SEMI: "SEMI",
  EOF: "EOF",
};

function lex(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const isDigit = (c) => c >= "0" && c <= "9";
  const isAlpha = (c) => /[a-zA-Z_]/.test(c);

  while (i < source.length) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }

    // comments: # to end of line
    if (c === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // string literals
    if (c === '"') {
      const startLine = line;
      i++; // skip opening quote
      let str = "";
      let closed = false;
      while (i < source.length) {
        if (source[i] === '"') {
          i++;
          closed = true;
          break;
        }
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          if (next === "n") str += "\n";
          else if (next === '"') str += '"';
          else if (next === "\\") str += "\\";
          else str += next;
          i += 2;
          continue;
        }
        if (source[i] === "\n") line++;
        str += source[i];
        i++;
      }
      if (!closed) {
        throw new AsasError({
          line: startLine,
          message: `This text starting on line ${startLine} is missing a closing quote.`,
          hint: `Every string needs a matching " at the end — add one where the text should stop.`,
        });
      }
      tokens.push({ type: TokenType.STRING, value: str, line: startLine });
      continue;
    }

    if (isDigit(c)) {
      let start = i;
      while (i < source.length && (isDigit(source[i]) || source[i] === ".")) i++;
      tokens.push({ type: TokenType.NUMBER, value: parseFloat(source.slice(start, i)), line });
      continue;
    }

    if (isAlpha(c)) {
      let start = i;
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) i++;
      const word = source.slice(start, i);
      switch (word) {
        case "let": tokens.push({ type: TokenType.LET, line }); break;
        case "print": tokens.push({ type: TokenType.PRINT, line }); break;
        case "if": tokens.push({ type: TokenType.IF, line }); break;
        case "else": tokens.push({ type: TokenType.ELSE, line }); break;
        case "true": tokens.push({ type: TokenType.TRUE, line }); break;
        case "false": tokens.push({ type: TokenType.FALSE, line }); break;
        case "and": tokens.push({ type: TokenType.AND, line }); break;
        case "or": tokens.push({ type: TokenType.OR, line }); break;
        case "not": tokens.push({ type: TokenType.NOT, line }); break;
        default: tokens.push({ type: TokenType.IDENT, value: word, line });
      }
      continue;
    }

    // two-character operators
    if (c === "=" && source[i + 1] === "=") { tokens.push({ type: TokenType.EQEQ, line }); i += 2; continue; }
    if (c === "!" && source[i + 1] === "=") { tokens.push({ type: TokenType.NEQ, line }); i += 2; continue; }
    if (c === "<" && source[i + 1] === "=") { tokens.push({ type: TokenType.LTE, line }); i += 2; continue; }
    if (c === ">" && source[i + 1] === "=") { tokens.push({ type: TokenType.GTE, line }); i += 2; continue; }

    switch (c) {
      case "+": tokens.push({ type: TokenType.PLUS, line }); i++; break;
      case "-": tokens.push({ type: TokenType.MINUS, line }); i++; break;
      case "*": tokens.push({ type: TokenType.STAR, line }); i++; break;
      case "/": tokens.push({ type: TokenType.SLASH, line }); i++; break;
      case "=": tokens.push({ type: TokenType.EQUALS, line }); i++; break;
      case "<": tokens.push({ type: TokenType.LT, line }); i++; break;
      case ">": tokens.push({ type: TokenType.GT, line }); i++; break;
      case "(": tokens.push({ type: TokenType.LPAREN, line }); i++; break;
      case ")": tokens.push({ type: TokenType.RPAREN, line }); i++; break;
      case "{": tokens.push({ type: TokenType.LBRACE, line }); i++; break;
      case "}": tokens.push({ type: TokenType.RBRACE, line }); i++; break;
      case ";": tokens.push({ type: TokenType.SEMI, line }); i++; break;
      default:
        throw new AsasError({
          line,
          message: `Asas doesn't recognize the character '${c}'.`,
          hint: `Asas understands letters, numbers, "text in quotes", and + - * / = < > ( ) { } ; # and, or, not.`,
        });
    }
  }

  tokens.push({ type: TokenType.EOF, line });
  return tokens;
}

// ---------- PARSER ----------
// Grammar:
// program     -> statement*
// statement   -> letStmt | printStmt | ifStmt | exprStmt
// block       -> LBRACE statement* RBRACE
// ifStmt      -> IF LPAREN expression RPAREN block (ELSE (ifStmt | block))?
// letStmt     -> LET IDENT EQUALS expression SEMI?
// printStmt   -> PRINT LPAREN expression RPAREN SEMI?
// expression  -> logicOr
// logicOr     -> logicAnd (OR logicAnd)*
// logicAnd    -> equality (AND equality)*
// equality    -> comparison ((EQEQ|NEQ) comparison)*
// comparison  -> sum ((LT|GT|LTE|GTE) sum)*
// sum         -> factor ((PLUS|MINUS) factor)*
// factor      -> unary ((STAR|SLASH) unary)*
// unary       -> (MINUS|NOT) unary | primary
// primary     -> NUMBER | STRING | TRUE | FALSE | IDENT | LPAREN expression RPAREN

function describeToken(type) {
  switch (type) {
    case TokenType.RPAREN: return "a closing ')'";
    case TokenType.LPAREN: return "an opening '('";
    case TokenType.LBRACE: return "an opening '{'";
    case TokenType.RBRACE: return "a closing '}'";
    case TokenType.EQUALS: return "'='";
    case TokenType.IDENT: return "a variable name";
    case TokenType.NUMBER: return "a number";
    case TokenType.STRING: return "text in quotes";
    case TokenType.TRUE: return "'true'";
    case TokenType.FALSE: return "'false'";
    case TokenType.IF: return "'if'";
    case TokenType.ELSE: return "'else'";
    case TokenType.AND: return "'and'";
    case TokenType.OR: return "'or'";
    case TokenType.NOT: return "'not'";
    case TokenType.EQEQ: return "'=='";
    case TokenType.NEQ: return "'!='";
    case TokenType.LT: return "'<'";
    case TokenType.GT: return "'>'";
    case TokenType.LTE: return "'<='";
    case TokenType.GTE: return "'>='";
    case TokenType.EOF: return "the end of the code";
    case TokenType.PLUS: return "'+'";
    case TokenType.MINUS: return "'-'";
    case TokenType.STAR: return "'*'";
    case TokenType.SLASH: return "'/'";
    case TokenType.SEMI: return "';'";
    default: return type;
  }
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];

  function expect(type, context) {
    if (peek().type !== type) throw friendlyExpectError(type, peek(), context);
    return advance();
  }

  function friendlyExpectError(expectedType, gotToken, context) {
    if (gotToken.type === TokenType.EOF && expectedType === TokenType.RPAREN) {
      return new AsasError({
        line: gotToken.line,
        message: `Reached the end of the code while still looking for a closing ')'.`,
        hint: context && context.openLine
          ? `The '(' opened on line ${context.openLine} is never closed — add a ')' where that expression should end.`
          : `Check that every '(' has a matching ')'.`,
      });
    }
    if (gotToken.type === TokenType.EOF && expectedType === TokenType.RBRACE) {
      return new AsasError({
        line: gotToken.line,
        message: `Reached the end of the code while still looking for a closing '}'.`,
        hint: context && context.openLine
          ? `The '{' opened on line ${context.openLine} is never closed — add a '}' to end that block.`
          : `Check that every '{' has a matching '}'.`,
      });
    }
    if (gotToken.type === TokenType.EOF) {
      return new AsasError({
        line: gotToken.line,
        message: `The code ends unexpectedly here — Asas was still expecting ${describeToken(expectedType)}.`,
        hint: `Make sure the last line is a complete statement.`,
      });
    }
    return new AsasError({
      line: gotToken.line,
      message: `Expected ${describeToken(expectedType)} but found ${describeToken(gotToken.type)}.`,
      hint: null,
    });
  }

  function parsePrimary() {
    const tok = peek();
    if (tok.type === TokenType.NUMBER) {
      advance();
      return { kind: "Number", value: tok.value, line: tok.line };
    }
    if (tok.type === TokenType.STRING) {
      advance();
      return { kind: "String", value: tok.value, line: tok.line };
    }
    if (tok.type === TokenType.TRUE) {
      advance();
      return { kind: "Boolean", value: true, line: tok.line };
    }
    if (tok.type === TokenType.FALSE) {
      advance();
      return { kind: "Boolean", value: false, line: tok.line };
    }
    if (tok.type === TokenType.IDENT) {
      advance();
      return { kind: "Identifier", name: tok.value, line: tok.line };
    }
    if (tok.type === TokenType.LPAREN) {
      const openTok = advance();
      const expr = parseExpression();
      expect(TokenType.RPAREN, { openLine: openTok.line });
      return expr;
    }
    throw new AsasError({
      line: tok.line,
      message: `Expected a value here (a number, text in quotes, true/false, a variable, or parentheses) but found ${describeToken(tok.type)}.`,
      hint: null,
    });
  }

  function parseUnary() {
    const tok = peek();
    if (tok.type === TokenType.MINUS) {
      advance();
      const operand = parseUnary();
      return { kind: "Unary", op: "-", operand, line: tok.line };
    }
    if (tok.type === TokenType.NOT) {
      advance();
      const operand = parseUnary();
      return { kind: "Unary", op: "not", operand, line: tok.line };
    }
    return parsePrimary();
  }

  function parseFactor() {
    let left = parseUnary();
    while (peek().type === TokenType.STAR || peek().type === TokenType.SLASH) {
      const opTok = advance();
      const op = opTok.type === TokenType.STAR ? "*" : "/";
      const right = parseUnary();
      left = { kind: "Binary", op, left, right, line: opTok.line };
    }
    return left;
  }

  function parseSum() {
    let left = parseFactor();
    while (peek().type === TokenType.PLUS || peek().type === TokenType.MINUS) {
      const opTok = advance();
      const op = opTok.type === TokenType.PLUS ? "+" : "-";
      const right = parseFactor();
      left = { kind: "Binary", op, left, right, line: opTok.line };
    }
    return left;
  }

  function parseComparison() {
    let left = parseSum();
    while ([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE].includes(peek().type)) {
      const opTok = advance();
      const op = { LT: "<", GT: ">", LTE: "<=", GTE: ">=" }[opTok.type];
      const right = parseSum();
      left = { kind: "Binary", op, left, right, line: opTok.line };
    }
    return left;
  }

  function parseEquality() {
    let left = parseComparison();
    while (peek().type === TokenType.EQEQ || peek().type === TokenType.NEQ) {
      const opTok = advance();
      const op = opTok.type === TokenType.EQEQ ? "==" : "!=";
      const right = parseComparison();
      left = { kind: "Binary", op, left, right, line: opTok.line };
    }
    return left;
  }

  function parseLogicAnd() {
    let left = parseEquality();
    while (peek().type === TokenType.AND) {
      const opTok = advance();
      const right = parseEquality();
      left = { kind: "Logical", op: "and", left, right, line: opTok.line };
    }
    return left;
  }

  function parseLogicOr() {
    let left = parseLogicAnd();
    while (peek().type === TokenType.OR) {
      const opTok = advance();
      const right = parseLogicAnd();
      left = { kind: "Logical", op: "or", left, right, line: opTok.line };
    }
    return left;
  }

  function parseExpression() {
    return parseLogicOr();
  }

  function parseBlock() {
    if (peek().type !== TokenType.LBRACE) {
      throw new AsasError({
        line: peek().line,
        message: `Expected a '{' to start a block of code here.`,
        hint: `Blocks in Asas are wrapped in curly braces, like { ... }.`,
      });
    }
    const openTok = advance();
    const statements = [];
    while (peek().type !== TokenType.RBRACE && peek().type !== TokenType.EOF) {
      statements.push(parseStatement());
    }
    expect(TokenType.RBRACE, { openLine: openTok.line });
    return statements;
  }

  function parseIf() {
    const ifTok = advance(); // IF
    if (peek().type !== TokenType.LPAREN) {
      throw new AsasError({
        line: ifTok.line,
        message: `if needs parentheses around its condition.`,
        hint: `Try if (condition) { ... }.`,
      });
    }
    const openParen = advance();
    const cond = parseExpression();
    expect(TokenType.RPAREN, { openLine: openParen.line });
    const thenBranch = parseBlock();
    let elseBranch = null;
    if (peek().type === TokenType.ELSE) {
      advance();
      elseBranch = peek().type === TokenType.IF ? [parseIf()] : parseBlock();
    }
    return { kind: "If", cond, thenBranch, elseBranch, line: ifTok.line };
  }

  function parseStatement() {
    if (peek().type === TokenType.LET) {
      const letTok = advance();
      if (peek().type !== TokenType.IDENT) {
        throw new AsasError({
          line: letTok.line,
          message: `Expected a variable name after 'let'.`,
          hint: `Try something like let x = 5.`,
        });
      }
      const name = advance().value;
      if (peek().type !== TokenType.EQUALS) {
        throw new AsasError({
          line: letTok.line,
          message: `Expected '=' after 'let ${name}'.`,
          hint: `Variable declarations look like let ${name} = <value>.`,
        });
      }
      advance();
      const value = parseExpression();
      if (peek().type === TokenType.SEMI) advance();
      return { kind: "Let", name, value, line: letTok.line };
    }

    if (peek().type === TokenType.PRINT) {
      const printTok = advance();
      if (peek().type !== TokenType.LPAREN) {
        const shown = peek().type === TokenType.IDENT ? peek().value : "...";
        throw new AsasError({
          line: printTok.line,
          message: `print needs parentheses around what you want to print.`,
          hint: `Try print(${shown}) instead.`,
        });
      }
      advance();
      const value = parseExpression();
      expect(TokenType.RPAREN, { openLine: printTok.line });
      if (peek().type === TokenType.SEMI) advance();
      return { kind: "Print", value, line: printTok.line };
    }

    if (peek().type === TokenType.IF) {
      return parseIf();
    }

    // bare expression statement
    const tok = peek();
    const value = parseExpression();
    if (peek().type === TokenType.SEMI) advance();
    return { kind: "ExprStmt", value, line: tok.line };
  }

  const statements = [];
  while (peek().type !== TokenType.EOF) {
    statements.push(parseStatement());
  }
  return { kind: "Program", statements };
}

// ---------- EVALUATOR ----------
function toDisplay(v) {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function describeType(v) {
  if (typeof v === "string") return "text";
  if (typeof v === "boolean") return "a true/false value";
  return "a number";
}

function evaluate(program) {
  const env = {};
  const output = [];
  const insights = [];

  function evalExpr(node) {
    switch (node.kind) {
      case "Number":
        return node.value;
      case "String":
        return node.value;
      case "Boolean":
        return node.value;
      case "Identifier": {
        if (!(node.name in env)) {
          const suggestion = closestName(node.name, Object.keys(env));
          throw new AsasError({
            line: node.line,
            message: `'${node.name}' hasn't been defined yet.`,
            hint: suggestion
              ? `Did you mean '${suggestion}'? If not, declare '${node.name}' first with let ${node.name} = ...`
              : `Declare it first with let ${node.name} = ... before using it.`,
          });
        }
        return env[node.name];
      }
      case "Unary": {
        const val = evalExpr(node.operand);
        if (node.op === "-") {
          if (typeof val !== "number") {
            throw new AsasError({
              line: node.line,
              message: `Can't negate ${describeType(val)} — '-' only works on numbers.`,
              hint: null,
            });
          }
          return -val;
        }
        if (node.op === "not") {
          if (typeof val !== "boolean") {
            throw new AsasError({
              line: node.line,
              message: `'not' needs a true/false value, but got ${describeType(val)}.`,
              hint: `Use a comparison like x > 0 to get a true/false value first.`,
            });
          }
          return !val;
        }
        throw new AsasError({ line: node.line, message: `Unknown unary operator ${node.op}.` });
      }
      case "Logical": {
        const l = evalExpr(node.left);
        if (typeof l !== "boolean") {
          throw new AsasError({
            line: node.line,
            message: `'${node.op}' needs true/false values, but the left side is ${describeType(l)}.`,
            hint: `Use a comparison like x > 0 to get a true/false value first.`,
          });
        }
        if (node.op === "or" && l === true) return true;
        if (node.op === "and" && l === false) return false;
        const r = evalExpr(node.right);
        if (typeof r !== "boolean") {
          throw new AsasError({
            line: node.line,
            message: `'${node.op}' needs true/false values, but the right side is ${describeType(r)}.`,
            hint: `Use a comparison like x > 0 to get a true/false value first.`,
          });
        }
        return r;
      }
      case "Binary": {
        const l = evalExpr(node.left);
        const r = evalExpr(node.right);
        switch (node.op) {
          case "+": {
            if (typeof l === "number" && typeof r === "number") return l + r;
            if (typeof l === "string" || typeof r === "string") {
              if (typeof l !== typeof r) {
                insights.push({
                  line: node.line,
                  message: `Combined ${describeType(l)} and ${describeType(r)} with '+', so the non-text value was converted to text and joined on.`,
                  hint: `This automatic conversion only happens with '+' when one side is text — other operators require matching types.`,
                });
              }
              return toDisplay(l) + toDisplay(r);
            }
            throw new AsasError({
              line: node.line,
              message: `'+' needs numbers or text, but got ${describeType(l)} and ${describeType(r)}.`,
              hint: null,
            });
          }
          case "-":
          case "*":
          case "/": {
            if (typeof l !== "number") {
              throw new AsasError({ line: node.line, message: `'${node.op}' needs a number on the left, but got ${describeType(l)}.`, hint: null });
            }
            if (typeof r !== "number") {
              throw new AsasError({ line: node.line, message: `'${node.op}' needs a number on the right, but got ${describeType(r)}.`, hint: null });
            }
            if (node.op === "-") return l - r;
            if (node.op === "*") return l * r;
            if (r === 0) {
              throw new AsasError({
                line: node.line,
                message: `Division by zero.`,
                hint: `The right-hand side of this '/' evaluated to 0, which isn't a valid divisor.`,
              });
            }
            const result = l / r;
            if (!Number.isInteger(result) && Number.isInteger(l) && Number.isInteger(r)) {
              insights.push({
                line: node.line,
                message: `${l} / ${r} doesn't divide evenly, so the result is ${result}.`,
                hint: `Asas always does decimal division — there's no separate integer division that truncates the remainder.`,
              });
            }
            return result;
          }
          case "<":
          case ">":
          case "<=":
          case ">=": {
            if (typeof l !== "number" || typeof r !== "number") {
              throw new AsasError({
                line: node.line,
                message: `'${node.op}' only compares numbers, but got ${describeType(l)} and ${describeType(r)}.`,
                hint: null,
              });
            }
            if (node.op === "<") return l < r;
            if (node.op === ">") return l > r;
            if (node.op === "<=") return l <= r;
            return l >= r;
          }
          case "==":
          case "!=": {
            if (typeof l !== typeof r) {
              insights.push({
                line: node.line,
                message: `Compared ${describeType(l)} and ${describeType(r)} with '${node.op}' — different types are never equal in Asas, so this is always ${node.op === "==" ? "false" : "true"}.`,
                hint: `Make sure both sides are the same type if you meant to compare their values.`,
              });
            }
            const eq = l === r;
            return node.op === "==" ? eq : !eq;
          }
          default:
            throw new AsasError({ line: node.line, message: `Unknown operator ${node.op}.` });
        }
      }
      default:
        throw new AsasError({ line: node.line, message: `Unknown expression.` });
    }
  }

  function execStatements(statements) {
    for (const stmt of statements) {
      if (stmt.kind === "Let") {
        if (stmt.name in env) {
          insights.push({
            line: stmt.line,
            message: `'${stmt.name}' was already defined earlier — this line replaced its old value (${toDisplay(env[stmt.name])}).`,
            hint: `let doesn't error on redeclaration in Asas; it just overwrites silently.`,
          });
        }
        env[stmt.name] = evalExpr(stmt.value);
      } else if (stmt.kind === "Print") {
        output.push(toDisplay(evalExpr(stmt.value)));
      } else if (stmt.kind === "ExprStmt") {
        evalExpr(stmt.value);
      } else if (stmt.kind === "If") {
        const cond = evalExpr(stmt.cond);
        if (typeof cond !== "boolean") {
          throw new AsasError({
            line: stmt.line,
            message: `An 'if' condition must be true or false, but this one is ${describeType(cond)}.`,
            hint: `Use a comparison like x > 0 or x == 5 to get a true/false value.`,
          });
        }
        if (cond) execStatements(stmt.thenBranch);
        else if (stmt.elseBranch) execStatements(stmt.elseBranch);
      }
    }
  }

  execStatements(program.statements);

  return { output, insights };
}

function runAsas(source) {
  try {
    const tokens = lex(source);
    const program = parse(tokens);
    const { output, insights } = evaluate(program);
    return { ok: true, output, insights };
  } catch (err) {
    if (err instanceof AsasError) {
      return { ok: false, error: { line: err.line, message: err.message, hint: err.hint } };
    }
    return { ok: false, error: { line: null, message: err.message, hint: null } };
  }
}

// ============================================================
// UI
// ============================================================

const SAMPLE = "";

function StarDivider() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ display: "block" }}>
      <g transform="translate(14,14)">
        <path
          d="M0,-12 L3,-3 L12,0 L3,3 L0,12 L-3,3 L-12,0 L-3,-3 Z"
          fill="none"
          stroke="#c9a45c"
          strokeWidth="1.2"
        />
        <circle r="2" fill="#c9a45c" />
      </g>
    </svg>
  );
}

function CornerOrnament({ corner }) {
  const rot = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      style={{
        position: "absolute",
        [corner.includes("t") ? "top" : "bottom"]: 6,
        [corner.includes("l") ? "left" : "right"]: 6,
        transform: `rotate(${rot}deg)`,
        opacity: 0.55,
        pointerEvents: "none",
      }}
    >
      <path d="M2,2 Q2,20 20,20 Q2,20 2,38" fill="none" stroke="#c9a45c" strokeWidth="1" />
      <path d="M2,2 Q22,2 22,20 Q22,2 40,2" fill="none" stroke="#c9a45c" strokeWidth="1" />
      <circle cx="2" cy="2" r="2.5" fill="#c9a45c" />
    </svg>
  );
}

export default function AsasIDE() {
  const [code, setCode] = useState(SAMPLE);
  const [lines, setLines] = useState([]); // terminal output lines: {type, text}
  const [history, setHistory] = useState([]); // session-only run history
  const [feedback, setFeedback] = useState(null); // { type: 'error'|'insight', items: [] }
  const [showHistory, setShowHistory] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const textareaRef = useRef(null);

  const lineCount = code.split("\n").length;

  function handleRun() {
    const timestamp = new Date().toLocaleTimeString();
    const result = runAsas(code);

    if (result.ok) {
      const newLines = result.output.length
        ? result.output.map((t) => ({ type: "out", text: t }))
        : [{ type: "info", text: "(no output)" }];
      setLines((prev) => [
        ...prev,
        ...(prev.length ? [{ type: "divider" }] : []),
        ...newLines,
      ]);
      setHistory((prev) => [{ time: timestamp, code, status: "ok" }, ...prev]);
      setFeedback(result.insights.length ? { type: "insight", items: result.insights } : null);
    } else {
      setLines((prev) => [
        ...prev,
        ...(prev.length ? [{ type: "divider" }] : []),
        {
          type: "err",
          text: result.error.line ? `line ${result.error.line}: ${result.error.message}` : result.error.message,
        },
      ]);
      setHistory((prev) => [{ time: timestamp, code, status: "error" }, ...prev]);
      setFeedback({ type: "error", items: [result.error] });
    }
  }

  function handleClear() {
    setLines([]);
    setFeedback(null);
  }

  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        background: "#0a1f16",
        backgroundImage:
          "radial-gradient(circle at 15% 10%, rgba(201,164,92,0.05), transparent 40%), radial-gradient(circle at 85% 90%, rgba(201,164,92,0.05), transparent 40%)",
        minHeight: "100vh",
        color: "#eee6d3",
        padding: "28px",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tangerine:wght@700&family=JetBrains+Mono:wght@400;500&family=Cormorant+Garamond:wght@400;500&display=swap');
        .asas-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .asas-scrollbar::-webkit-scrollbar-thumb { background: #8a6d3b; border-radius: 4px; }
        .asas-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .asas-textarea::placeholder { color: #6b6250; }
      `}</style>

      <CornerOrnament corner="tl" />
      <CornerOrnament corner="tr" />
      <CornerOrnament corner="bl" />
      <CornerOrnament corner="br" />

      {/* Header */}
      <div style={{ textAlign: "center", position: "relative", marginBottom: "18px" }}>
        <div
          style={{
            fontFamily: "'Tangerine', cursive",
            fontSize: "64px",
            color: "#d4b06a",
            lineHeight: 1,
            textShadow: "0 0 18px rgba(201,164,92,0.25)",
          }}
        >
          Asas
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "12px",
            letterSpacing: "3px",
            color: "#8a6d3b",
            textTransform: "uppercase",
            marginTop: "-4px",
          }}
        >
          a small language, built from the ground up
        </div>

        <div style={{ position: "absolute", top: 0, right: 8, display: "flex", gap: "14px", alignItems: "center" }}>
          <button
            onClick={() => setShowHistory((s) => !s)}
            title="Session history"
            style={{
              background: "none",
              border: "1px solid #8a6d3b",
              borderRadius: "6px",
              color: "#c9a45c",
              padding: "5px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            ⟲ history
          </button>
          <button
            onClick={() => setShowDocs(true)}
            title="How Asas works"
            style={{
              background: "none",
              border: "1px solid #8a6d3b",
              borderRadius: "6px",
              color: "#c9a45c",
              padding: "5px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            ? guide
          </button>
          <button
            onClick={() => setShowPrivacy(true)}
            title="Privacy"
            style={{
              background: "none",
              border: "none",
              color: "#8a6d3b",
              fontSize: "12px",
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            privacy
          </button>
        </div>
      </div>

      <div
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent, #8a6d3b, transparent)",
          marginBottom: "22px",
        }}
      />

      {/* History drawer */}
      {showHistory && (
        <div
          style={{
            background: "#0d2b1e",
            border: "1px solid #8a6d3b",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "13px",
            maxHeight: "140px",
            overflowY: "auto",
          }}
          className="asas-scrollbar"
        >
          <div style={{ color: "#c9a45c", marginBottom: "6px", fontSize: "11px", letterSpacing: "1px" }}>
            THIS IS SESSION ONLY — IT CLEARS WHEN YOU LEAVE
          </div>
          {history.length === 0 && <div style={{ color: "#6b6250" }}>No runs yet.</div>}
          {history.map((h, idx) => (
            <div key={idx} style={{ display: "flex", gap: "10px", padding: "3px 0", color: h.status === "error" ? "#c97757" : "#a8c9a4" }}>
              <span style={{ color: "#6b6250" }}>{h.time}</span>
              <span>{h.status === "error" ? "✕ error" : "✓ ran"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Privacy modal */}
      {showPrivacy && (
        <div
          onClick={() => setShowPrivacy(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d2b1e",
              border: "1px solid #c9a45c",
              borderRadius: "10px",
              padding: "22px 26px",
              maxWidth: "380px",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "16px",
              lineHeight: 1.5,
            }}
          >
            <div style={{ color: "#d4b06a", fontSize: "20px", marginBottom: "8px" }}>Privacy</div>
            <p style={{ margin: "0 0 10px" }}>
              Asas runs entirely in your browser. Your code is never sent to a server, stored in a database, or logged anywhere.
            </p>
            <p style={{ margin: 0 }}>
              Run history is kept only for this session and disappears the moment you close or leave the page.
            </p>
            <button
              onClick={() => setShowPrivacy(false)}
              style={{
                marginTop: "14px",
                background: "none",
                border: "1px solid #8a6d3b",
                borderRadius: "6px",
                color: "#c9a45c",
                padding: "5px 14px",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
              }}
            >
              close
            </button>
          </div>
        </div>
      )}

      {/* Docs modal */}
      {showDocs && (
        <div
          onClick={() => setShowDocs(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d2b1e",
              border: "1px solid #c9a45c",
              borderRadius: "10px",
              padding: "26px 30px",
              maxWidth: "460px",
              maxHeight: "80vh",
              overflowY: "auto",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
            className="asas-scrollbar"
          >
            <div
              style={{
                fontFamily: "'Tangerine', cursive",
                fontSize: "36px",
                color: "#d4b06a",
                marginBottom: "2px",
              }}
            >
              Guide
            </div>
            <div style={{ color: "#8a6d3b", fontSize: "11px", letterSpacing: "1px", marginBottom: "18px", textTransform: "uppercase" }}>
              everything Asas understands right now
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Variables</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              let x = 5
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Declares a variable and assigns it a value. Re-declaring with <span style={{ color: "#c9a45c" }}>let</span> overwrites it.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Text (strings)</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              let name = "Asas"
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Wrap text in double quotes. Use <span style={{ color: "#c9a45c" }}>+</span> to join text with other text or numbers —
              e.g. <span style={{ color: "#c9a45c" }}>"x is " + 5</span> becomes <span style={{ color: "#c9a45c" }}>"x is 5"</span>.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>True / false</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              true&nbsp;&nbsp;&nbsp;false
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              The two boolean values. Produced by comparisons and used to drive <span style={{ color: "#c9a45c" }}>if</span>.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Arithmetic</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              +&nbsp;&nbsp;-&nbsp;&nbsp;*&nbsp;&nbsp;/
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Standard precedence — <span style={{ color: "#c9a45c" }}>*</span> and <span style={{ color: "#c9a45c" }}>/</span> run
              before <span style={{ color: "#c9a45c" }}>+</span> and <span style={{ color: "#c9a45c" }}>-</span>. Use parentheses
              <span style={{ color: "#c9a45c" }}> ( ) </span> to control order.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Comparisons</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              ==&nbsp;&nbsp;!=&nbsp;&nbsp;&lt;&nbsp;&nbsp;&gt;&nbsp;&nbsp;&lt;=&nbsp;&nbsp;&gt;=
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Compare two values and produce <span style={{ color: "#c9a45c" }}>true</span> or <span style={{ color: "#c9a45c" }}>false</span>.
              Ordering (<span style={{ color: "#c9a45c" }}>&lt; &gt; &lt;= &gt;=</span>) only works between numbers.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Logic</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              and&nbsp;&nbsp;or&nbsp;&nbsp;not
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Combine or invert true/false values — e.g. <span style={{ color: "#c9a45c" }}>x &gt; 0 and x &lt; 10</span>.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Conditionals</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4", whiteSpace: "pre" }}>
{`if (x > 5) {
  print("big")
} else {
  print("small")
}`}
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Runs one block or the other depending on the condition. The <span style={{ color: "#c9a45c" }}>else</span> is optional,
              and can chain into another <span style={{ color: "#c9a45c" }}>if</span> for else-if behavior.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Comments</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              # this is ignored by Asas
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Anything after <span style={{ color: "#c9a45c" }}>#</span> on a line is ignored.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Printing output</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "8px 10px", marginBottom: "4px", color: "#a8c9a4" }}>
              print(x)
            </div>
            <div style={{ color: "#8b9a8d", marginBottom: "16px" }}>
              Evaluates the expression inside and sends the result to the terminal pane.
            </div>

            <div style={{ color: "#c9a45c", marginBottom: "6px" }}>Full example</div>
            <div style={{ background: "#081712", borderRadius: "6px", padding: "10px 12px", marginBottom: "16px", color: "#a8c9a4", whiteSpace: "pre" }}>
{`# a small example
let x = 5 + 3 * 2
let name = "Asas"

if (x > 10) {
  print(name + " says x is big: " + x)
} else {
  print(name + " says x is small: " + x)
}`}
            </div>

            <div style={{ color: "#6b6250", fontSize: "12px", borderTop: "1px solid #2a3f30", paddingTop: "12px" }}>
              Not supported yet: loops, functions, arrays/lists. Coming as Asas grows.
            </div>

            <button
              onClick={() => setShowDocs(false)}
              style={{
                marginTop: "16px",
                background: "none",
                border: "1px solid #8a6d3b",
                borderRadius: "6px",
                color: "#c9a45c",
                padding: "5px 14px",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
              }}
            >
              close
            </button>
          </div>
        </div>
      )}

      {/* Split panes */}
      <div style={{ display: "flex", gap: "0", alignItems: "stretch", position: "relative" }}>
        {/* Code pane */}
        <div
          style={{
            flex: 1,
            background: "#0d2b1e",
            border: "1px solid #8a6d3b",
            borderRadius: "10px 0 0 10px",
            display: "flex",
            flexDirection: "column",
            minHeight: "360px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px",
              borderBottom: "1px solid #2a3f30",
              fontSize: "13px",
              color: "#c9a45c",
            }}
          >
            <span>{"</> "} code.asas</span>
            <button
              onClick={handleRun}
              style={{
                background: "#c9a45c",
                color: "#0a1f16",
                border: "none",
                borderRadius: "5px",
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ▶ run
            </button>
          </div>
          <div style={{ display: "flex", flex: 1 }}>
            <div
              style={{
                padding: "12px 8px",
                textAlign: "right",
                color: "#4d5c4f",
                fontSize: "13px",
                userSelect: "none",
                lineHeight: "20px",
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="asas-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={'let x = 5\nprint(x)'}
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                color: "#eee6d3",
                fontSize: "13px",
                lineHeight: "20px",
                fontFamily: "'JetBrains Mono', monospace",
                padding: "12px 10px",
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            width: "1px",
            background: "#8a6d3b",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              background: "#0a1f16",
              padding: "4px",
              borderRadius: "50%",
            }}
          >
            <StarDivider />
          </div>
        </div>

        {/* Terminal pane */}
        <div
          style={{
            flex: 1,
            background: "#081712",
            border: "1px solid #8a6d3b",
            borderRadius: "0 10px 10px 0",
            display: "flex",
            flexDirection: "column",
            minHeight: "360px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px",
              borderBottom: "1px solid #2a3f30",
              fontSize: "13px",
              color: "#c9a45c",
            }}
          >
            <span>{">_"} terminal</span>
            <button
              onClick={handleClear}
              style={{
                background: "none",
                border: "1px solid #8a6d3b",
                borderRadius: "5px",
                color: "#8a6d3b",
                padding: "4px 10px",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              clear
            </button>
          </div>
          <div
            className="asas-scrollbar"
            style={{
              flex: 1,
              padding: "12px 14px",
              fontSize: "13px",
              lineHeight: "20px",
              overflowY: "auto",
            }}
          >
            {lines.length === 0 && (
              <div style={{ color: "#4d5c4f" }}>{">"} press run to execute your Asas code</div>
            )}
            {lines.map((l, idx) =>
              l.type === "divider" ? (
                <div
                  key={idx}
                  style={{
                    borderTop: "1px dashed #2a3f30",
                    margin: "8px 0",
                  }}
                />
              ) : (
                <div
                  key={idx}
                  style={{
                    color: l.type === "err" ? "#e08a6d" : l.type === "info" ? "#6b6250" : "#a8c9a4",
                  }}
                >
                  {l.type === "err" ? `✕ ${l.text}` : l.text}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Feedback panel — appears only when Asas has something to say */}
      {feedback && (
        <div
          style={{
            marginTop: "14px",
            background: feedback.type === "error" ? "#2b1410" : "#0d2b1e",
            border: `1px solid ${feedback.type === "error" ? "#c97757" : "#8a6d3b"}`,
            borderRadius: "10px",
            padding: "14px 18px",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              color: feedback.type === "error" ? "#e08a6d" : "#c9a45c",
              fontSize: "11px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            {feedback.type === "error" ? "what went wrong" : "worth knowing"}
          </div>
          {feedback.items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: idx === feedback.items.length - 1 ? 0 : "10px" }}>
              <div style={{ color: "#eee6d3" }}>
                {item.line ? <span style={{ color: "#6b6250" }}>line {item.line} — </span> : null}
                {item.message}
              </div>
              {item.hint && <div style={{ color: "#8b9a8d", marginTop: "3px" }}>{item.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}