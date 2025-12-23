import type { AstNode, BinaryOperator } from './ast.js';

export type ParseErrorCode = 'DISALLOWED_TOKEN' | 'SYNTAX_ERROR' | 'SYNTAX_ERROR_UNARY_MINUS';

export type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: BinaryOperator | '^' | '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' }
  | { type: 'postfix'; value: '!' }
  | { type: 'unary'; value: 'sqrt' }
  | { type: 'func'; value: 'concat' };

export type TokenizeResult =
  | { ok: true; tokens: Token[]; numbers: number[] }
  | { ok: false; errorCode: ParseErrorCode };

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  const numbers: number[] = [];

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') {
        j += 1;
      }
      const raw = input.slice(i, j);
      const value = Number(raw);
      tokens.push({ type: 'number', value });
      numbers.push(value);
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '×' || ch === '÷') {
      const op = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
      tokens.push({ type: 'op', value: op as BinaryOperator });
      i += 1;
      continue;
    }
    if (ch === '!') {
      tokens.push({ type: 'postfix', value: '!' });
      i += 1;
      continue;
    }
    if (ch === '√') {
      tokens.push({ type: 'unary', value: 'sqrt' });
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let j = i + 1;
      while (j < input.length) {
        const c = input[j];
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
          j += 1;
          continue;
        }
        break;
      }
      const word = input.slice(i, j).toLowerCase();
      if (word === 'concat') {
        tokens.push({ type: 'func', value: 'concat' });
      } else if (word === 'sqrt') {
        tokens.push({ type: 'unary', value: 'sqrt' });
      } else {
        return { ok: false, errorCode: 'DISALLOWED_TOKEN' };
      }
      i = j;
      continue;
    }
    return { ok: false, errorCode: 'DISALLOWED_TOKEN' };
  }

  return { ok: true, tokens, numbers };
}

type ParseResult =
  | { ok: true; ast: AstNode; tokens: Token[]; numbers: number[] }
  | { ok: false; errorCode: ParseErrorCode };

export function parseExpression(input: string): ParseResult {
  const tokenResult = tokenize(input);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const { tokens, numbers } = tokenResult;

  let index = 0;
  let unaryMinusUsed = false;
  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  const parsePrimary = (): AstNode | null => {
    const token = peek();
    if (!token) {
      return null;
    }
    if (token.type === 'number') {
      consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'func' && token.value === 'concat') {
      consume();
      const open = peek();
      if (!open || open.type !== 'paren' || open.value !== '(') {
        return null;
      }
      consume();
      const left = parseExpressionInternal();
      if (!left) {
        return null;
      }
      const comma = peek();
      if (!comma || comma.type !== 'comma') {
        return null;
      }
      consume();
      const right = parseExpressionInternal();
      if (!right) {
        return null;
      }
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') {
        return null;
      }
      consume();
      return { type: 'binary', op: 'concat', left, right };
    }
    if (token.type === 'paren' && token.value === '(') {
      consume();
      const expr = parseExpressionInternal();
      const close = peek();
      if (!expr || !close || close.type !== 'paren' || close.value !== ')') {
        return null;
      }
      consume();
      return expr;
    }
    return null;
  };

  const parsePostfix = (): AstNode | null => {
    let node = parsePrimary();
    if (!node) {
      return null;
    }
    while (true) {
      const token = peek();
      if (token && token.type === 'postfix' && token.value === '!') {
        consume();
        node = { type: 'unary', op: '!', operand: node };
        continue;
      }
      break;
    }
    return node;
  };

  const parseUnary = (): AstNode | null => {
    const token = peek();
    if (token && token.type === 'op' && token.value === '-') {
      unaryMinusUsed = true;
      return null;
    }
    if (token && token.type === 'unary' && token.value === 'sqrt') {
      consume();
      const operand = parseUnary();
      if (!operand) {
        return null;
      }
      return { type: 'unary', op: 'sqrt', operand };
    }
    return parsePostfix();
  };

  const parsePower = (): AstNode | null => {
    let node = parseUnary();
    if (!node) {
      return null;
    }
    const token = peek();
    if (token && token.type === 'op' && token.value === '^') {
      consume();
      const right = parsePower();
      if (!right) {
        return null;
      }
      node = { type: 'binary', op: '^', left: node, right };
    }
    return node;
  };

  const parseMulDiv = (): AstNode | null => {
    let node = parsePower();
    if (!node) {
      return null;
    }
    while (true) {
      const token = peek();
      if (token && token.type === 'op' && (token.value === '*' || token.value === '/')) {
        consume();
        const right = parsePower();
        if (!right) {
          return null;
        }
        node = { type: 'binary', op: token.value, left: node, right };
        continue;
      }
      break;
    }
    return node;
  };

  const parseAddSub = (): AstNode | null => {
    let node = parseMulDiv();
    if (!node) {
      return null;
    }
    while (true) {
      const token = peek();
      if (token && token.type === 'op' && (token.value === '+' || token.value === '-')) {
        consume();
        const right = parseMulDiv();
        if (!right) {
          return null;
        }
        node = { type: 'binary', op: token.value, left: node, right };
        continue;
      }
      break;
    }
    return node;
  };

  const parseExpressionInternal = (): AstNode | null => parseAddSub();

  const ast = parseExpressionInternal();
  if (!ast || index !== tokens.length) {
    if (unaryMinusUsed) {
      return { ok: false, errorCode: 'SYNTAX_ERROR_UNARY_MINUS' };
    }
    return { ok: false, errorCode: 'SYNTAX_ERROR' };
  }

  return { ok: true, ast, tokens, numbers };
}
