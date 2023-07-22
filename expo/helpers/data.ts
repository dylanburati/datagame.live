export enum DataStatus {
  STALE,
  UPDATING,
  COMPLETED,
}

export function overwriteMap<K, V>(map: Map<K, V>, items: [K, V][]) {
  const keyset = new Set(map.keys());
  for (const [k, v] of items) {
    keyset.delete(k);
    map.set(k, v);
  }
  for (const k of keyset) {
    map.delete(k);
  }
  return map;
}

export class OrderedSet<T, K = T> {
  map = new Map<K, number>();
  reverseMap: T[] = [];
  hash: (item: T) => K;

  constructor(hash: (item: T) => K) {
    this.hash = hash;
  }

  static from<U>(initial: U[]) {
    return new OrderedSet<U, U>((item) => item).extend(initial);
  }

  static empty<U>() {
    return new OrderedSet<U, U>((item) => item);
  }

  append(item: T) {
    if (!this.map.has(this.hash(item))) {
      this.map.set(this.hash(item), this.reverseMap.length);
      this.reverseMap.push(item);
    }
    return this;
  }

  extend(array: T[]) {
    array.forEach((item) => this.append(item));
    return this;
  }

  has(item: T) {
    return this.map.has(this.hash(item));
  }

  get(index: number) {
    return this.reverseMap[index];
  }

  getIndex(item: T) {
    return this.map.get(this.hash(item));
  }

  isEmpty() {
    return this.map.size === 0;
  }

  get size() {
    return this.map.size;
  }

  remove(item: T) {
    this._remove(this.hash(item));
    return this;
  }

  private _remove(key: K) {
    const index = this.map.get(key);
    if (index !== undefined) {
      this.map.delete(key);
      this.reverseMap.splice(index, 1);
      for (let j = index; j < this.reverseMap.length; j++) {
        this.map.set(this.hash(this.reverseMap[j]), j);
      }
    }
  }

  insertAt(index: number, item: T) {
    if (index < 0 || index > this.size) {
      throw new Error(`Index ${index} out of range`);
    }
    if (index === this.size) {
      return this.append(item);
    }
    if (!this.map.has(this.hash(item))) {
      this.map.set(this.hash(item), index);
      this.reverseMap.splice(index, 0, item);
      for (let j = index + 1; j < this.reverseMap.length; j++) {
        this.map.set(this.hash(this.reverseMap[j]), j);
      }
    }
    return this;
  }

  reinsertAt(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex > this.size) {
      throw new Error(`Index ${fromIndex} out of range`);
    }
    if (toIndex < 0 || toIndex > this.size) {
      throw new Error(`Index ${toIndex} out of range`);
    }
    if (fromIndex !== toIndex) {
      const item = this.reverseMap[fromIndex];
      this.remove(item);
      this.insertAt(toIndex, item);
    }
    return this;
  }

  toggle(item: T) {
    if (this.has(item)) {
      return this.remove(item);
    }
    return this.append(item);
  }

  takeRight(count: number) {
    if (count < this.size) {
      const dropSize = this.size - count;
      this.reverseMap.splice(0, dropSize).forEach((item) => {
        this.map.delete(this.hash(item));
      });
      for (let j = 0; j < this.reverseMap.length; j++) {
        this.map.set(this.hash(this.reverseMap[j]), j);
      }
    }
    return this;
  }

  dropExcluded(allowedItems: T[]) {
    const set = new Set(this.map.keys());
    allowedItems.forEach((item) => set.delete(this.hash(item)));
    set.forEach((key) => this._remove(key));
    return this;
  }

  clear() {
    this.map.clear();
    this.reverseMap = [];
    return this;
  }

  toList() {
    return this.reverseMap;
  }
}
