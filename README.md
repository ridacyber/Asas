# Asas

*Asas* means "foundation" — a small programming language built from scratch, with a hand-written lexer, parser, and evaluator. No parsing libraries, no dependencies doing the heavy lifting. Just the actual thing.

**Live demo:** [asas-navy.vercel.app](https://asas-navy.vercel.app/)

## What is this?

Asas is an interpreted language and browser-based IDE. Write code on the left, run it, see the output on the right. Everything executes client-side — nothing is sent to a server, nothing is logged.

It currently supports:

- **Variables** — `let x = 5`
- **Arithmetic** — `+ - * /` with standard precedence (`*` and `/` before `+` and `-`), and parentheses to control order
- **Output** — `print(x)` evaluates an expression and prints the result

let x = 5 + 3 * 2
let y = (x - 1) / 2
print(x)
print(y)
print(x + y)


Not supported yet: conditionals, loops, functions, strings, comments. Coming as Asas grows.

## Features

- **Built-in guide** — a syntax reference lives inside the IDE itself, so you don't need to leave the page or remember the rules to try it.
- **Session-only history** — every run is logged for as long as you're in the session, and cleared the moment you leave. Nothing is stored beyond that.
- **Instant feedback** — errors surface immediately in the terminal pane, with clear messages instead of silent failures.

## Tech stack

- **React** — UI and state management
- **Hand-written interpreter** — lexer → parser (recursive descent) → tree-walking evaluator, all in plain JavaScript
- **Vite** — build tooling
- **Vercel** — deployment

## Running locally

```bash
git clone https://github.com/ridacyber/Asas.git
cd Asas
npm install
npm run dev
```

## How it works

Asas processes code in three stages:

1. **Lexer** — turns raw source text into a stream of tokens (numbers, identifiers, keywords, operators)
2. **Parser** — a recursive descent parser builds an abstract syntax tree from those tokens, respecting operator precedence
3. **Evaluator** — walks the syntax tree and computes the result, maintaining variable state in an environment object

## Roadmap

- Conditionals (`if` / `else`)
- Loops (`while` / `for`)
- Functions
- Strings
- Comments

## License

All rights reserved. This code is publicly visible for portfolio and demonstration purposes only. No permission is granted to copy, modify, distribute, or use this code without explicit written consent.
