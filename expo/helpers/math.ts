const lutDeg: number[] = [];
const lutTan: number[] = [];
for (let i = 0; i < 90; i++) {
  lutTan.push(Math.tan((Math.PI * i) / 180));
  lutDeg.push(i);
}

export function intRange(start: number, end: number, step: number) {
  const len = Math.floor((end - start - 1) / step);
  return new Array(len).fill(start).map((n, i) => n + step * i);
}

export function binarySearch(
  array: number[],
  key: number,
  missBehavior: 'roll-forward' | 'roll-backward' = 'roll-forward'
) {
  let left = 0;
  let right = array.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const midEl = array[mid];
    if (key < midEl) {
      right = mid - 1;
    } else if (key > midEl) {
      left = mid + 1;
    } else {
      return mid;
    }
  }
  // left and right crossed over.
  // left is guaranteed to be the lowest index with value > key
  if (missBehavior === 'roll-forward') {
    return Math.min(left, array.length - 1);
  } else {
    return Math.max(left - 1, 0);
  }
}

export function fastAtan(y: number, x: number) {
  if (x === 0) {
    return Math.sign(y) * 90;
  }
  const ratio = y / x;
  return Math.sign(ratio) * lutDeg[binarySearch(lutTan, Math.abs(ratio))];
}
