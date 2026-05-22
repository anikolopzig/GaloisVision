// Parser for polynomials in a single variable (default 'x') with rational coefficients.
// Accepts: "x^4 - 2", "2x^3 + x/2 - 1", "(1/2)x^2 - 3", "x^4 + 8x + 12".
// Implicit multiplication ("2x", "3x^2") is allowed. Parentheses allowed.

import { ONE, ZERO, div, rat } from "./rational";
import type { Polynomial } from "./polynomial";
import { addP, mulP, scaleP, negP } from "./polynomial";

type Token =
  | { kind: "num"; value: bigint }
  | { kind: "var" }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string, varName: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
      tokens.push({ kind: "num", value: BigInt(s.slice(i, j)) });
      i = j;
    } else if (c === varName) {
      tokens.push({ kind: "var" });
      i++;
    } else if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      tokens.push({ kind: "op", op: c });
      i++;
    } else if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
    } else if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
    } else {
      throw new Error(`Unexpected character '${c}' at position ${i}`);
    }
  }
  return tokens;
}

// Expressions can evaluate to a polynomial (Polynomial) or a scalar (Rational).
// We'll just always carry polynomials; a scalar is a degree-0 polynomial.
class Parser {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Polynomial {
    const p = this.parseExpr();
    if (this.pos !== this.tokens.length) {
      throw new Error("Unexpected trailing input");
    }
    return p;
  }

  // expr := term (('+' | '-') term)*
  private parseExpr(): Polynomial {
    let left = this.parseTerm();
    while (this.peek()?.kind === "op" && (this.peek() as any).op !== "*" && (this.peek() as any).op !== "/" && (this.peek() as any).op !== "^") {
      const op = (this.consume() as any).op as "+" | "-";
      const right = this.parseTerm();
      left = op === "+" ? addP(left, right) : addP(left, negP(right));
    }
    return left;
  }

  // term := factor (('*' | '/') factor | factor)*
  // (implicit multiplication allowed, e.g. "2x", "x(x+1)")
  private parseTerm(): Polynomial {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.kind === "op" && (t.op === "*" || t.op === "/")) {
        const op = (this.consume() as any).op as "*" | "/";
        const right = this.parseUnary();
        if (op === "*") {
          left = mulP(left, right);
        } else {
          // Division only makes sense when divisor is a scalar polynomial.
          if (right.length > 1) {
            throw new Error("Cannot divide by a non-constant polynomial");
          }
          if (right.length === 0) throw new Error("Division by zero");
          left = scaleP(left, div(ONE, right[0]));
        }
      } else if (t.kind === "num" || t.kind === "var" || t.kind === "lparen") {
        // Implicit multiplication.
        const right = this.parseUnary();
        left = mulP(left, right);
      } else {
        break;
      }
    }
    return left;
  }

  // unary := '-' unary | '+' unary | power
  private parseUnary(): Polynomial {
    const t = this.peek();
    if (t?.kind === "op" && t.op === "-") {
      this.consume();
      return negP(this.parseUnary());
    }
    if (t?.kind === "op" && t.op === "+") {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  // power := atom ('^' atom)?
  private parsePower(): Polynomial {
    const base = this.parseAtom();
    const t = this.peek();
    if (t?.kind === "op" && t.op === "^") {
      this.consume();
      const exp = this.parseAtom();
      // Exponent must be a non-negative integer constant.
      if (exp.length !== 1 || exp[0].d !== 1n || exp[0].n < 0n) {
        throw new Error("Exponent must be a non-negative integer");
      }
      const n = Number(exp[0].n);
      let result: Polynomial = [ONE];
      for (let i = 0; i < n; i++) result = mulP(result, base);
      return result;
    }
    return base;
  }

  // atom := number | var | '(' expr ')'
  private parseAtom(): Polynomial {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of input");
    if (t.kind === "num") {
      this.consume();
      // Followed by '/' and another number? Only as a literal rational at top level.
      // We treat division uniformly in parseTerm, so a literal "1/2" is handled there.
      return [rat(t.value, 1n)];
    }
    if (t.kind === "var") {
      this.consume();
      return [ZERO, ONE];
    }
    if (t.kind === "lparen") {
      this.consume();
      const inner = this.parseExpr();
      const close = this.consume();
      if (close?.kind !== "rparen") throw new Error("Missing ')'");
      return inner;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }
}

export function parsePolynomial(input: string, varName = "x"): Polynomial {
  if (!input.trim()) throw new Error("Empty input");
  const tokens = tokenize(input, varName);
  return new Parser(tokens).parse();
}
