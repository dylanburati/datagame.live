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
  console.log(strings);
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