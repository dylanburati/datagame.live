function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function alignLeftVectorSum(arr: number[][]): number[] {
  if (arr.length === 0) {
    return [];
  }
  const result = new Array(Math.max(...arr.map((a) => a.length))).fill(0);
  for (const v of arr) {
    for (let i = 0; i < v.length; i++) {
      result[i] += v[i];
    }
  }
  return result;
}

type PrettyNode = {
  columns: number;
  depth: number[];
} & (
  | { kind: 'lit'; string: string }
  | { kind: 'array'; children: PrettyNode[] }
  | { kind: 'pair'; key: string; value: PrettyNode }
  | { kind: 'object'; children: PrettyNode[] }
);

function prettyAST(obj: any): PrettyNode {
  if (typeof obj !== 'object' || obj === null) {
    const json = JSON.stringify(obj);
    return {
      kind: 'lit',
      string: json,
      columns: json.length,
      depth: [1],
    };
  }
  if (Array.isArray(obj)) {
    const arr = obj.map(prettyAST);
    return {
      kind: 'array',
      children: arr,
      columns: sum(arr.map((e) => e.columns)) + 2 * arr.length - 2,
      depth: alignLeftVectorSum(arr.map((e) => e.depth)),
    };
  }
  const pairs: PrettyNode[] = Object.entries(obj).map(([k, v]) => {
    const key = JSON.stringify(k);
    const value = prettyAST(v);
    return {
      kind: 'pair',
      key,
      value,
      columns: key.length + 2 + value.columns,
      depth: [1, ...value.depth],
    };
  });
  return {
    kind: 'object',
    children: pairs,
    columns: sum(pairs.map((e) => e.columns)) + 2 * pairs.length - 2,
    depth: alignLeftVectorSum(pairs.map((e) => e.depth)),
  };
}

function prettyRecur(node: PrettyNode, indent: number): string[] {
  const strings = [];
  if (node.kind === 'object' || node.kind === 'array') {
    strings.push(node.kind === 'object' ? '{' : '[');
    const last = node.children.length - 1;
    const complexity = Math.max(...node.depth.map((n, i) => (n + i) * (i + 1)));
    const cIndent =
      node.columns > 80 - indent || complexity > 8 ? indent + 2 : 0;
    const inner = node.children.flatMap((c, i) => {
      const childStrings = [];
      if (cIndent) {
        childStrings.push('\n' + ' '.repeat(cIndent));
      }
      childStrings.push(...prettyRecur(c, cIndent));
      if (i !== last) {
        childStrings.push(cIndent ? ',' : ', ');
      } else if (cIndent) {
        childStrings.push('\n' + ' '.repeat(indent));
      }
      return childStrings;
    });
    strings.push(...inner);
    strings.push(node.kind === 'object' ? '}' : ']');
  }
  if (node.kind === 'pair') {
    strings.push(node.key);
    strings.push(': ');
    strings.push(...prettyRecur(node.value, indent));
  }
  if (node.kind === 'lit') {
    strings.push(node.string);
  }
  return strings;
}

export function prettyPrint(obj: any): string {
  const ast = prettyAST(obj);
  return prettyRecur(ast, 0).join('');
}
