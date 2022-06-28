import { describe, expect, it } from '@jest/globals';
import { OrderedSet } from './data';
import { getChangeInRanking } from './nplayerLogic';

describe('Functions', () => {
  it('getChangeInRanking', () => {
    const numeric = [100, 75, 50];
    expect(
      getChangeInRanking(OrderedSet.from([0, 1, 2]), numeric, false)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(OrderedSet.from([0, 2, 1]), numeric, false)
    ).toEqual([0, -1, 1]);
    expect(
      getChangeInRanking(OrderedSet.from([1, 0, 2]), numeric, false)
    ).toEqual([-1, 1, 0]);
    expect(
      getChangeInRanking(OrderedSet.from([1, 2, 0]), numeric, false)
    ).toEqual([-2, 1, 1]);
    expect(
      getChangeInRanking(OrderedSet.from([2, 0, 1]), numeric, false)
    ).toEqual([-1, -1, 2]);
    expect(
      getChangeInRanking(OrderedSet.from([2, 1, 0]), numeric, false)
    ).toEqual([-2, 0, 2]);
  });

  it('getChangeInRanking (ties)', () => {
    const numeric = [100, 100, 50];
    expect(
      getChangeInRanking(OrderedSet.from([0, 1, 2]), numeric, false)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(OrderedSet.from([0, 2, 1]), numeric, false)
    ).toEqual([0, -1, 1]);
    expect(
      getChangeInRanking(OrderedSet.from([1, 0, 2]), numeric, false)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(OrderedSet.from([1, 2, 0]), numeric, false)
    ).toEqual([-1, 0, 1]);
    expect(
      getChangeInRanking(OrderedSet.from([2, 0, 1]), numeric, false)
    ).toEqual([-1, -1, 2]);
    expect(
      getChangeInRanking(OrderedSet.from([2, 1, 0]), numeric, false)
    ).toEqual([-1, -1, 2]);
  });
});
