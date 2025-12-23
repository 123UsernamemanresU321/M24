import type { AstNode } from './ast.js';

export type ShapeConstraint = 'shapeA' | 'shapeB';

function unwrapUnary(node: AstNode): AstNode {
  let current = node;
  while (current.type === 'unary') {
    current = current.operand;
  }
  return current;
}

function isLeaf(node: AstNode): boolean {
  return unwrapUnary(node).type === 'number';
}

function isBinary(node: AstNode): node is Extract<AstNode, { type: 'binary' }> {
  return node.type === 'binary';
}

export function matchesShapeConstraint(node: AstNode, shape: ShapeConstraint): boolean {
  if (!isBinary(node)) {
    return false;
  }

  if (shape === 'shapeA') {
    if (!isBinary(node.left) || !isBinary(node.right)) {
      return false;
    }
    return (
      isLeaf(node.left.left)
      && isLeaf(node.left.right)
      && isLeaf(node.right.left)
      && isLeaf(node.right.right)
    );
  }

  if (!isLeaf(node.left)) {
    return false;
  }
  if (!isBinary(node.right)) {
    return false;
  }
  if (!isLeaf(node.right.left)) {
    return false;
  }
  if (!isBinary(node.right.right)) {
    return false;
  }
  return isLeaf(node.right.right.left) && isLeaf(node.right.right.right);
}

