export function argsort<T>(array: T[], sorter: (e1: T, e2: T) => number) {
  return array
    .map((e, i): [number, T] => [i, e])
    .sort((pair1, pair2) => sorter(pair1[1], pair2[1]))
    .map(([i]) => i);
}

const ACCEPTABLE_ORDERS_SENTINEL = Symbol('ACCEPTABLE_ORDERS_SENTINEL');
export function acceptableOrders<T>(
  array: T[],
  sorter: (e1: T, e2: T) => number
) {
  if (array.length === 0) {
    return [];
  }
  const order = argsort(array, sorter);
  const positionsForIndex = new Array(array.length)
    .fill(0)
    .map(() => new Set<number>());
  const indices = [order[0]];
  let position = 0;
  let val = array[order[0]];
  for (let j = 1; j <= order.length; j++) {
    const val2 =
      j === order.length ? ACCEPTABLE_ORDERS_SENTINEL : array[order[j]];
    if (val2 !== ACCEPTABLE_ORDERS_SENTINEL && sorter(val, val2) === 0) {
      indices.push(order[j]);
    } else {
      const nextPos = position + indices.length;
      while (position < nextPos) {
        indices.forEach((index) => positionsForIndex[index].add(position));
        position += 1;
      }
      indices.splice(0, indices.length, order[j]);
      val = val2 as T;
    }
  }
  return positionsForIndex;
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
