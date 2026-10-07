// Tiny expression language used by data/rules ("8 + prof + mod.con",
// "col.fury", "level>=17 ? 60 : 30", "ceil(prof/2) + 'd6'"). Parsed, never eval'd.
import type { BreakdownLine } from './types';

export type ExprValue = number | string | boolean;
export interface ExprScope {
  [name: string]: ExprValue | ExprScope;
}

type Node =
  | { t: 'lit'; v: ExprValue }
  | { t: 'ref'; path: string[] }
  | { t: 'call'; fn: string; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node };

const TOKEN = /\s*(\d+(?:\.\d+)?|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|>=|<=|==|!=|&&|\|\||[-+*/()?:.,<>!])/y;

function tokenize(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) {
      if (src.slice(at).trim() === '') break;
      throw new Error(`Bad expression "${src}" at position ${at}`);
    }
    out.push(m[1]!);
  }
  return out;
}

const FUNCTIONS: Record<string, (...n: number[]) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  min: Math.min,
  max: Math.max,
};

export function parse(src: string): Node {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const eat = (tok: string) => {
    if (toks[i] !== tok) throw new Error(`Bad expression "${src}": expected "${tok}", got "${toks[i] ?? 'end'}"`);
    i++;
  };
  const binary = (next: () => Node, ops: string[], chain = true) => (): Node => {
    let a = next();
    while (ops.includes(peek() ?? '')) {
      a = { t: 'bin', op: toks[i++]!, a, b: next() };
      if (!chain) break;
    }
    return a;
  };

  const primary = (): Node => {
    const tok = toks[i++];
    if (tok === undefined) throw new Error(`Bad expression "${src}": unexpected end`);
    if (tok === '(') {
      const inner = ternary();
      eat(')');
      return inner;
    }
    if (/^\d/.test(tok)) return { t: 'lit', v: Number(tok) };
    if (tok.startsWith("'")) return { t: 'lit', v: tok.slice(1, -1) };
    if (!/^[A-Za-z_]/.test(tok)) throw new Error(`Bad expression "${src}": unexpected "${tok}"`);
    if (tok === 'true' || tok === 'false') return { t: 'lit', v: tok === 'true' };
    if (peek() === '(') {
      i++;
      const args: Node[] = [];
      while (peek() !== ')') {
        args.push(ternary());
        if (peek() === ',') i++;
        else break;
      }
      eat(')');
      return { t: 'call', fn: tok, args };
    }
    const path = [tok];
    while (peek() === '.') {
      i++;
      path.push(toks[i++] ?? '');
    }
    return { t: 'ref', path };
  };
  const unary = (): Node => {
    if (peek() === '!' || peek() === '-') return { t: 'un', op: toks[i++]!, a: unary() };
    return primary();
  };
  const mul = binary(unary, ['*', '/']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['>=', '<=', '>', '<', '==', '!='], false);
  const and = binary(cmp, ['&&']);
  const or = binary(and, ['||']);
  function ternary(): Node {
    const c = or();
    if (peek() !== '?') return c;
    i++;
    const a = ternary();
    eat(':');
    return { t: 'cond', c, a, b: ternary() };
  }

  const node = ternary();
  if (i < toks.length) throw new Error(`Bad expression "${src}": unexpected "${toks[i]}"`);
  return node;
}

function num(v: ExprValue, what: string): number {
  if (typeof v !== 'number') throw new Error(`Expected a number for ${what}, got ${JSON.stringify(v)}`);
  return v;
}

function evalNode(n: Node, scope: ExprScope): ExprValue {
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'ref': {
      let cur: ExprValue | ExprScope | undefined = scope;
      for (const key of n.path) {
        cur = typeof cur === 'object' ? cur[key] : undefined;
      }
      if (cur === undefined || typeof cur === 'object') throw new Error(`Unknown value "${n.path.join('.')}"`);
      return cur;
    }
    case 'call': {
      const fn = FUNCTIONS[n.fn];
      if (!fn) throw new Error(`Unknown function "${n.fn}"`);
      return fn(...n.args.map((a) => num(evalNode(a, scope), n.fn)));
    }
    case 'un': {
      const a = evalNode(n.a, scope);
      return n.op === '!' ? !a : -num(a, 'negation');
    }
    case 'cond':
      return evalNode(n.c, scope) ? evalNode(n.a, scope) : evalNode(n.b, scope);
    case 'bin': {
      if (n.op === '&&') return Boolean(evalNode(n.a, scope)) && Boolean(evalNode(n.b, scope));
      if (n.op === '||') return Boolean(evalNode(n.a, scope)) || Boolean(evalNode(n.b, scope));
      const a = evalNode(n.a, scope);
      const b = evalNode(n.b, scope);
      if (n.op === '==') return a === b;
      if (n.op === '!=') return a !== b;
      if (n.op === '+' && (typeof a === 'string' || typeof b === 'string')) return `${a}${b}`;
      const x = num(a, n.op);
      const y = num(b, n.op);
      switch (n.op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return x / y;
        case '>=': return x >= y;
        case '<=': return x <= y;
        case '>': return x > y;
        default: return x < y;
      }
    }
  }
}

export function evaluate(expr: string | number, scope: ExprScope = {}): ExprValue {
  return typeof expr === 'number' ? expr : evalNode(parse(expr), scope);
}

export function evaluateNumber(expr: string | number, scope: ExprScope = {}): number {
  return num(evaluate(expr, scope), `"${expr}"`);
}

const ABILITY_LABELS: Record<string, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

function show(n: Node): string {
  switch (n.t) {
    case 'lit': return String(n.v);
    case 'ref': return n.path.join('.');
    case 'call': return `${n.fn}(${n.args.map(show).join(', ')})`;
    case 'un': return `${n.op}${show(n.a)}`;
    case 'bin': return `${show(n.a)} ${n.op} ${show(n.b)}`;
    case 'cond': return `${show(n.c)} ? ${show(n.a)} : ${show(n.b)}`;
  }
}

function label(n: Node): string {
  if (n.t === 'lit') return 'Base';
  if (n.t === 'ref') {
    const [head, key] = n.path;
    if (head === 'prof') return 'Proficiency bonus';
    if (head === 'level') return 'Level';
    if (head === 'mod' && key && ABILITY_LABELS[key]) return `${ABILITY_LABELS[key]} modifier`;
  }
  return show(n);
}

/** Evaluates a numeric expression and lists each top-level term of the sum. */
export function explain(expr: string | number, scope: ExprScope = {}): { value: number; lines: BreakdownLine[] } {
  if (typeof expr === 'number') return { value: expr, lines: [{ label: 'Base', value: expr }] };
  const terms: { node: Node; sign: 1 | -1 }[] = [];
  const collect = (n: Node, sign: 1 | -1) => {
    if (n.t === 'bin' && (n.op === '+' || n.op === '-')) {
      collect(n.a, sign);
      collect(n.b, n.op === '+' ? sign : (-sign as 1 | -1));
    } else {
      terms.push({ node: n, sign });
    }
  };
  collect(parse(expr), 1);
  const lines = terms.map(({ node, sign }) => ({
    label: label(node),
    value: sign * num(evalNode(node, scope), `"${expr}"`),
  }));
  return { value: lines.reduce((sum, l) => sum + l.value, 0), lines };
}
