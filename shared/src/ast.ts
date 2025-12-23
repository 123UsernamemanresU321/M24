export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | 'concat';
export type UnaryOperator = '!' | 'sqrt';

export type AstNode =
  | { type: 'number'; value: number }
  | { type: 'binary'; op: BinaryOperator; left: AstNode; right: AstNode }
  | { type: 'unary'; op: UnaryOperator; operand: AstNode };

export function astToString(node: AstNode): string {
  if (node.type === 'number') {
    return String(node.value);
  }
  if (node.type === 'unary') {
    if (node.op === '!') {
      return `${astToString(node.operand)}!`;
    }
    return `sqrt(${astToString(node.operand)})`;
  }
  if (node.op === 'concat') {
    return `concat(${astToString(node.left)},${astToString(node.right)})`;
  }
  return `(${astToString(node.left)}${node.op}${astToString(node.right)})`;
}

export function astDepth(node: AstNode): number {
  if (node.type === 'number') {
    return 1;
  }
  if (node.type === 'unary') {
    return astDepth(node.operand) + 1;
  }
  const leftDepth = astDepth(node.left);
  const rightDepth = astDepth(node.right);
  return Math.max(leftDepth, rightDepth) + 1;
}
