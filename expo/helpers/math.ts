export type XY = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function rectCenter(r: Rect) {
  return {
    x: r.x + 0.5 * r.width,
    y: r.y + 0.5 * r.height,
  };
}

export function rectAbove(src: Rect, neighbor: Rect) {
  return {
    ...src,
    y: neighbor.y - src.height,
  };
}

export function rectBelow(src: Rect, neighbor: Rect) {
  return {
    ...src,
    y: neighbor.y + neighbor.height,
  };
}

export function midpoint(p1: XY, p2: XY) {
  return {
    x: 0.5 * p1.x + 0.5 * p2.x,
    y: 0.5 * p1.y + 0.5 * p2.y,
  };
}

export function argsort<T>(array: T[], sorter: (e1: T, e2: T) => number) {
  return array
    .map((e, i): [number, T] => [i, e])
    .sort((pair1, pair2) => sorter(pair1[1], pair2[1]))
    .map(([i]) => i);
}

export function intRange(start: number, end: number, step: number) {
  const result = [];
  for (let num = start; step * (num - end) < 0; num += step) {
    result.push(num);
  }
  return result;
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

const lutDeg: number[] = [];
const lutTan: number[] = [];
for (let i = 0; i < 90; i++) {
  lutTan.push(Math.tan((Math.PI * i) / 180));
  lutDeg.push(i);
}

export function fastAtan(y: number, x: number) {
  if (x === 0) {
    return Math.sign(y) * 90;
  }
  const ratio = y / x;
  return Math.sign(ratio) * lutDeg[binarySearch(lutTan, Math.abs(ratio))];
}

function lastAnniversary(date: Date, reference: Date) {
  const nonLeapYearMs = 365 * 24 * 3600 * 1000;
  // always >= actual number of years
  let guess = Math.floor(
    (reference.getTime() - date.getTime()) / nonLeapYearMs
  );
  let anniversary = new Date(date);
  anniversary.setFullYear(date.getFullYear() + guess);
  while (anniversary > reference) {
    guess--;
    // the guessed date might have gone from 02-29 to 03-01; recreating the date
    // lets it go to 02-29 of the previous year, instead of staying on 03-01.
    anniversary = new Date(date);
    anniversary.setFullYear(date.getFullYear() + guess);
  }
  return anniversary;
}

export function relativeDeltaToNow(date: Date): [number, number] {
  const now = new Date();
  const anniversary = lastAnniversary(date, now);
  const years = anniversary.getFullYear() - date.getFullYear();
  return [years, now.getTime() - anniversary.getTime()];
}
