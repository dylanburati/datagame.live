export class OrderedSet<T> {
  map = new Map<T, number>();
  reverseMap: T[] = [];

  append(item: T) {
    if (!this.map.has(item)) {
      this.map.set(item, this.reverseMap.length);
      this.reverseMap.push(item);
    }
    return this;
  }

  extend(array: T[]) {
    array.forEach((item) => this.append(item));
    return this;
  }

  has(item: T) {
    return this.map.has(item);
  }

  getIndex(item: T) {
    return this.map.get(item);
  }

  isEmpty() {
    return this.map.size === 0;
  }

  get size() {
    return this.map.size;
  }

  remove(item: T) {
    const index = this.map.get(item);
    if (index !== undefined) {
      this.map.delete(item);
      this.reverseMap.splice(index, 1);
      for (let j = index; j < this.reverseMap.length; j++) {
        this.map.set(this.reverseMap[j], j);
      }
    }
    return this;
  }

  toggle(item: T) {
    if (this.map.has(item)) {
      return this.remove(item);
    }
    return this.append(item);
  }

  takeRight(count: number) {
    if (count < this.size) {
      const dropSize = this.size - count;
      this.reverseMap.splice(0, dropSize).forEach((item) => {
        this.map.delete(item);
      });
      for (let j = 0; j < this.reverseMap.length; j++) {
        this.map.set(this.reverseMap[j], j);
      }
    }
    return this;
  }

  dropExcluded(allowedItems: T[]) {
    const set = new Set(this.map.keys());
    allowedItems.forEach((item) => set.delete(item));
    set.forEach((item) => this.remove(item));
    return this;
  }

  clear() {
    this.map.clear();
    this.reverseMap = [];
    return this;
  }

  toList() {
    return [...this.map.keys()];
  }
}
