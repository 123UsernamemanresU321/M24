import type { AstNode } from './ast.js';

function normalizeNode(node: AstNode): string {
  if (node.type === 'number') {
    return `n:${node.value}`;
  }
  if (node.type === 'unary') {
    return `u:${node.op}(${normalizeNode(node.operand)})`;
  }
  const left = normalizeNode(node.left);
  const right = normalizeNode(node.right);
  if (node.op === '+' || node.op === '*') {
    const [a, b] = [left, right].sort();
    return `b:${node.op}(${a},${b})`;
  }
  return `b:${node.op}(${left},${right})`;
}

export function astSignature(node: AstNode): string {
  return normalizeNode(node);
}

