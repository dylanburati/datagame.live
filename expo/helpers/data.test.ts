import { describe, expect, it } from '@jest/globals';
import { Card } from './api';
import { OrderedSet } from './data';

const CARDS: Card[] = [
  { title: 'Ghostbusters (1984)', id: 1, tags: {} },
  { title: 'Die Hard (1988)\n???', id: 2, tags: {} },
  { title: 'The Godfather: Part II (1974)', id: 3, tags: {} },
  { title: 'Dead Poets Society (1989)', id: 4, tags: {} },
];

describe('OrderedSet', () => {
  it('append', () => {
    const set = OrderedSet.empty<number>();
    set.append(1).append(2).append(3);
    expect(set.toList()).toEqual([1, 2, 3]);
  });

  it('extend', () => {
    const set = OrderedSet.empty<number>();
    set.extend([1, 2, 3]);
    expect(set.toList()).toEqual([1, 2, 3]);
  });

  it('has scalar', () => {
    const set = OrderedSet.empty<number>();
    expect(set.has(1)).toBe(false);
    set.append(1);
    expect(set.has(1)).toBe(true);
  });

  it('getIndex scalar', () => {
    const set = OrderedSet.from([1, 2, 3]);
    expect(set.getIndex(1)).toBe(0);
    expect(set.getIndex(2)).toBe(1);
    expect(set.getIndex(3)).toBe(2);
  });

  it('has complex', () => {
    const set = new OrderedSet((item: Card) => item.id);
    expect(set.has(CARDS[0])).toBe(false);
    set.extend(CARDS);
    expect(set.has(CARDS[0])).toBe(true);
  });

  it('getIndex complex', () => {
    const set = new OrderedSet((item: Card) => item.id).extend(CARDS);
    expect(set.getIndex(CARDS[0])).toBe(0);
    expect(set.getIndex(CARDS[1])).toBe(1);
    expect(set.getIndex(CARDS[2])).toBe(2);
  });

  it('remove', () => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8];
    const set = OrderedSet.from(nums);
    expect(set.remove(1).toList()).toEqual(nums.slice(1));
    expect(set.remove(2).remove(3).remove(4).toList()).toEqual(nums.slice(4));
    expect(set.remove(5).remove(6).remove(7).toList()).toEqual([8]);
    expect(set.remove(10).remove(11).remove(8).toList()).toEqual([]);
  });

  it('insertAt', () => {
    const set = OrderedSet.from([1, 3, 5, 7]);
    expect(set.insertAt(1, 2).toList()).toEqual([1, 2, 3, 5, 7]);
    expect(set.insertAt(5, 0).toList()).toEqual([1, 2, 3, 5, 7, 0]);
    expect(() => set.insertAt(7, 2).toList()).toThrowError();
    // no duplicate
    expect(set.insertAt(1, 0).toList()).toEqual([1, 2, 3, 5, 7, 0]);
  });

  it('takeRight', () => {
    const set = OrderedSet.from([1, 2, 3, 4]);
    expect(set.takeRight(3).toList()).toEqual([2, 3, 4]);
    expect(set.append(5).takeRight(3).toList()).toEqual([3, 4, 5]);
  });

  it('reinsertAt', () => {
    const set = OrderedSet.from([1, 2, 3, 4]);
    expect(set.reinsertAt(0, 1).toList()).toEqual([2, 1, 3, 4]);
    expect(set.reinsertAt(0, 2).toList()).toEqual([1, 3, 2, 4]);
    expect(set.reinsertAt(0, 3).toList()).toEqual([3, 2, 4, 1]);
    expect(set.reinsertAt(1, 2).toList()).toEqual([3, 4, 2, 1]);
    expect(set.reinsertAt(1, 3).toList()).toEqual([3, 2, 1, 4]);
    expect(set.reinsertAt(1, 0).toList()).toEqual([2, 3, 1, 4]);
    expect(set.reinsertAt(2, 3).toList()).toEqual([2, 3, 4, 1]);
    expect(set.reinsertAt(2, 0).toList()).toEqual([4, 2, 3, 1]);
    expect(set.reinsertAt(2, 1).toList()).toEqual([4, 3, 2, 1]);
    expect(set.reinsertAt(3, 0).toList()).toEqual([1, 4, 3, 2]);
    expect(set.reinsertAt(3, 1).toList()).toEqual([1, 2, 4, 3]);
    expect(set.reinsertAt(3, 2).toList()).toEqual([1, 2, 3, 4]);
  });

  it('dropExcluded', () => {
    const set = OrderedSet.from([1, 2, 3, 4, 5]);
    set.dropExcluded([1, 3, 7]);
    expect(set.toList()).toEqual([1, 3]);
  });
});
