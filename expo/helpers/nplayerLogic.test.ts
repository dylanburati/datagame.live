import { describe, expect, it } from '@jest/globals';
import { TriviaExpectation } from './api';
import { OrderedSet } from './data';
import { getChangeInRanking } from './nplayerLogic';

const OPTION_IDS = [0, 1, 2];

describe('Functions', () => {
  it('getChangeInRanking', () => {
    const expectations: TriviaExpectation[] = [
      { kind: 'all', group: [0], minPos: 0 }, // 100
      { kind: 'all', group: [1], minPos: 1 }, // 75
      { kind: 'all', group: [2], minPos: 2 }, // 50
    ];
    expect(
      getChangeInRanking(expectations, OrderedSet.from([0, 1, 2]), OPTION_IDS)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([0, 2, 1]), OPTION_IDS)
    ).toEqual([0, -1, 1]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([1, 0, 2]), OPTION_IDS)
    ).toEqual([-1, 1, 0]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([1, 2, 0]), OPTION_IDS)
    ).toEqual([-2, 1, 1]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([2, 0, 1]), OPTION_IDS)
    ).toEqual([-1, -1, 2]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([2, 1, 0]), OPTION_IDS)
    ).toEqual([-2, 0, 2]);
  });

  it('getChangeInRanking (ties)', () => {
    const expectations: TriviaExpectation[] = [
      { kind: 'all', group: [0, 1], minPos: 0 }, // 100, 100
      { kind: 'all', group: [2], minPos: 2 }, // 50
    ];
    expect(
      getChangeInRanking(expectations, OrderedSet.from([0, 1, 2]), OPTION_IDS)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([0, 2, 1]), OPTION_IDS)
    ).toEqual([0, -1, 1]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([1, 0, 2]), OPTION_IDS)
    ).toEqual([0, 0, 0]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([1, 2, 0]), OPTION_IDS)
    ).toEqual([-2, 1, 1]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([2, 0, 1]), OPTION_IDS)
    ).toEqual([0, -2, 2]);
    expect(
      getChangeInRanking(expectations, OrderedSet.from([2, 1, 0]), OPTION_IDS)
    ).toEqual([-1, -1, 2]);
  });
});
