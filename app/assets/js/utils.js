function pretty(obj) {
  if (Array.isArray(obj)) {
    const arr = obj.map(pretty);
    return {
      breakLines: arr.length > 1 || !arr.every(e => e.breakLines),
      isArray: true,
      strings: arr,
    };
  }
  const strings = [];
  let breakLines = false;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    let sk;
    if (typeof v !== 'object') {
      sk = typeof v === 'string' ? JSON.stringify(v) : v.toString();
    } else if (v === null) {
      sk = 'null';
    } else {
      sk = pretty(v);
      breakLines = breakLines || sk.breakLines;
      if (!breakLines) {
        if (Array.isArray(v))
          breakLines = breakLines || v.length > 2;
        else
          breakLines = breakLines || (Object.keys(v).length > 1);
      }
    }
    if (typeof sk === 'string') {
      strings.push(JSON.stringify(k) + ': ' + sk);
    } else {
      strings.push({ ...sk, key: k })
    }
    breakLines = breakLines || (strings.length > 3);
  }

  return { breakLines, isArray: false, strings };
}

export function prettyPrint(obj, info = null, currentIndent = 0) {
  if (info == null) {
    info = pretty(obj);
  }
  if (typeof info !== 'object') return ' '.repeat(currentIndent) + info;
  const { breakLines, isArray, strings } = info;
  const nextIndent = breakLines ? currentIndent + 2 : 0;
  const joiner = breakLines ? ',\n' : ', ';
  const content = strings.map(child => prettyPrint(null, child, nextIndent)).join(joiner);
  const cs = isArray ? '[' : '{';
  const ce = isArray ? ']' : '}';
  let start = cs;
  let end = ce;
  if (info.key !== undefined) {
    start = `${JSON.stringify(info.key)}: ${cs}`;
  }
  start = ' '.repeat(currentIndent) + `${start}`;
  if (breakLines) {
    start += '\n';
    end = '\n' + ' '.repeat(currentIndent) + `${end}`;
  }
  return start + content + end;
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
    } else if (k !== 'style' && k !== 'class') {
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
