export function tupleLessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] < b[i]) {
      return true;
    }
    if (a[i] > b[i]) {
      return false;
    }
  }
  return a.length < b.length;
}

export type Comparator<T> = (a: T, b: T) => number;

export function comparingBy<T>(
  keyFunc: ((el: T) => number) | ((el: T) => number[])
): Comparator<T> {
  return (a, b) => {
    const ak = keyFunc(a);
    const bk = keyFunc(b);
    if (Array.isArray(ak)) {
      return tupleLessThan(ak, bk as number[]) ? -1 : 1;
    }
    return ak - (bk as number);
  };
}
