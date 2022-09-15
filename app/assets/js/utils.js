function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function alignLeftVectorSum(arr) {
  if (arr.length === 0) return [];
  const result = new Array(Math.max(...arr.map(a => a.length))).fill(0);
  for (const v of arr) {
    for (let i = 0; i < v.length; i++) result[i] += v[i];
  }
  return result;
}

function prettyAST(obj) {
  if (typeof obj !== 'object' || obj === null) {
    const json = JSON.stringify(obj)
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
      columns: sum(arr.map(e => e.columns)) + 2 * arr.length - 2,
      depth: alignLeftVectorSum(arr.map(e => e.depth)),
    };
  }
  const pairs = Object.entries(obj)
    .map(([k, v]) => {
      const key = JSON.stringify(k);
      const value = prettyAST(v);
      return {
        kind: 'pair',
        key,
        value,
        columns: key.length + 2 + value.columns,
        depth: [1, ...value.depth],
      }
    });
  return {
    kind: 'object',
    children: pairs,
    columns: sum(pairs.map(e => e.columns)) + 2 * pairs.length - 2,
    depth: alignLeftVectorSum(pairs.map(e => e.depth)),
  };
}

function prettyRecur(node, indent) {
  const strings = [];
  if (node.kind === 'object' || node.kind === 'array') {
    strings.push(node.kind === 'object' ? '{' : '[');
    const last = node.children.length - 1;
    const complexity = Math.max(...node.depth.map((n, i) => (n + i) * (i + 1)));
    const cIndent = (node.columns > (80 - indent) || complexity > 8) ? indent + 2 : 0;
    const inner = node.children.flatMap((c, i) => {
      const childStrings = [];
      if (cIndent) childStrings.push('\n' + ' '.repeat(cIndent));
      childStrings.push(...prettyRecur(c, cIndent));
      if (i !== last) childStrings.push(cIndent ? ',' : ', ');
      else if (cIndent) childStrings.push('\n' + ' '.repeat(indent));
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

export function prettyPrint(obj) {
  const ast = prettyAST(obj);
  return prettyRecur(ast, 0).join('');
}

export class EffectList {
  constructor() {
    this.effects = [];
  }

  checkEffects() {
    this.effects.forEach(effect => {
      const { func, depFunc, last } = effect;
      const deps = depFunc();
      let mismatch = !last || deps.length !== last.length;
      for (let i = 0; !mismatch && i < deps.length; i++) {
        mismatch = mismatch || deps[i] !== last[i];
      }
      if (mismatch) {
        effect.last = deps;
        func();
      }
    })
  }

  register(func, depFunc) {
    this.effects.push({ func, depFunc, last: undefined });
    this.checkEffects();
  }

  setter(setState) {
    const _this = this;
    return x => {
      setState(x);
      _this.checkEffects();
    };
  }
}

export function modify(el, removeChildren, attrs, children) {
  if (removeChildren) {
    Array.from(el.childNodes).forEach(c => c.remove());
  }
  if (attrs.style) {
    Object.assign(el.style, attrs.style);
  }
  if (attrs.className != null) {
    el.className = attrs.className;
  }
  for (const k in attrs) {
    if (k.startsWith('on')) {
      el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    } else if (k !== 'style' && k !== 'className') {
      if (attrs[k] === true) el.setAttribute(k, '');
      else if (attrs[k] !== false) el.setAttribute(k, attrs[k]);
    }
  }
  for (let child of children) {
    if (typeof child === 'string' || typeof child === 'number') {
      el.insertAdjacentText('beforeend', String(child));
    } else {
      el.appendChild(child);
    }
  }
  return el;
}

export function h(tagName, attrs, ...children) {
  const el = document.createElement(tagName);
  const childArr = [];
  children.forEach(item => {
    if (Array.isArray(item)) {
      childArr.push(...item);
    } else {
      childArr.push(item);
    }
  });
  return modify(el, false, attrs, childArr);
}
