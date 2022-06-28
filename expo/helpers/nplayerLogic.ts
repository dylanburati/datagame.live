import { Presence } from 'phoenix';
import { ViewProps } from 'react-native';
import { RoomScoreEntry, Trivia } from './api';
import { OrderedSet } from './data';
import { styles } from '../styles';
import { argsort, relativeDeltaToNow } from './math';

export enum RoomStage {
  LOBBY,
  WAITING_ROOM,
  UNKNOWN_TURN,
  SELF_TURN,
  PARTICIPANT,
  SPECTATOR,
  FEEDBACK_SELF_TURN,
  FEEDBACK_PARTICIPANT,
  FEEDBACK_SPECTATOR,
  RESULTS,
}

export type RoomPlayer = {
  id: number;
  name: string;
  isPresent: boolean;
};

export class RoomPlayerList {
  array: RoomPlayer[];
  presentIds = new Set<number>();
  playerOrder: number[];
  playerIndex: number;
  startedPlayerIndex: number;
  scoreMap = new Map<number, number>();

  constructor(array: RoomPlayer[]) {
    this.array = array;
    this.playerOrder = [];
    this.playerIndex = -1;
    this.startedPlayerIndex = -1;
  }

  upsert(id: number, name: string, isPresent: boolean | null): RoomPlayerList {
    const index = this.array.findIndex((item) => item.id === id);
    const newItem = {
      id,
      name,
      isPresent: isPresent ?? this.presentIds.has(id),
    };
    if (index === -1) {
      this.array.push(newItem);
    } else {
      this.array[index] = {
        ...newItem,
        isPresent: this.array[index].isPresent,
      };
    }
    return this;
  }

  updatePresences(presence: Presence): RoomPlayerList {
    this.presentIds.clear();
    presence.list((userId, _metas) => {
      const numId = Number(userId);
      this.presentIds.add(numId);
    });
    this.array = this.array.map((item) => ({
      ...item,
      isPresent: this.presentIds.has(item.id),
    }));
    return this;
  }

  setOrder(order: number[]): RoomPlayerList {
    this.playerOrder = order;
    this.playerIndex = Math.min(0, order.length - 1);
    this.startedPlayerIndex = -1;
    return this;
  }

  endTurn(playerId: number): RoomPlayerList {
    const indexWent = this.playerOrder.indexOf(playerId);
    if (indexWent >= 0) {
      this.playerIndex = (indexWent + 1) % this.playerOrder.length;
    }
    return this;
  }

  startTurn(playerId: number): RoomPlayerList {
    const indexGoing = this.playerOrder.indexOf(playerId);
    if (indexGoing >= 0) {
      this.startedPlayerIndex = indexGoing;
    }
    return this;
  }

  updateScores(scoreChanges: RoomScoreEntry[]) {
    scoreChanges.forEach(({ userId, score }) => {
      this.scoreMap.set(userId, score);
    });
    return this;
  }

  get activeId() {
    return this.startedPlayerIndex >= 0
      ? this.playerOrder[this.startedPlayerIndex]
      : undefined;
  }

  get activeName() {
    const activeId = this.activeId;
    return activeId !== undefined
      ? this.array.find((item) => item.id === activeId)?.name
      : undefined;
  }

  othersPresent(selfId: number): RoomPlayer[] {
    return this.array.filter((item) => item.id !== selfId && item.isPresent);
  }

  turnsUntil(playerId: number): number {
    let index = this.playerOrder.indexOf(playerId);
    if (index === -1) {
      return -1;
    }
    if (index < this.playerIndex) {
      index += this.playerOrder.length;
    }
    return index - this.playerIndex;
  }

  getScore(playerId: number) {
    return this.scoreMap.get(playerId);
  }

  scoresWithUpdates(scoreChanges: RoomScoreEntry[]) {
    return scoreChanges.map((e) => ({
      ...e,
      score: e.score + (this.scoreMap.get(e.userId) ?? 0),
    }));
  }
}

export type RoomState = {
  stage: RoomStage;
  roomId: string;
  creatorId?: number;
  createdAt?: string;
  selfId?: number;
  selfName?: string;
  players: RoomPlayerList;
  turnId: number;
  trivia?: Trivia;
  participantId?: number;
  receivedAnswers: Map<number, number[]>;
};

export type RoomStateWithTrivia = RoomState & {
  trivia: NonNullable<RoomState['trivia']>;
};

export function shouldShowLobby(stage: RoomStage) {
  return stage === RoomStage.LOBBY || stage === RoomStage.WAITING_ROOM;
}

export function feedbackFor(stage: RoomStage) {
  const lut: Partial<Record<RoomStage, RoomStage>> = {
    [RoomStage.SELF_TURN]: RoomStage.FEEDBACK_SELF_TURN,
    [RoomStage.PARTICIPANT]: RoomStage.FEEDBACK_PARTICIPANT,
    [RoomStage.SPECTATOR]: RoomStage.FEEDBACK_SPECTATOR,
  };
  return lut[stage] || stage;
}

export function isFeedbackStage(stage: RoomStage) {
  return (
    stage === RoomStage.FEEDBACK_SELF_TURN ||
    stage === RoomStage.FEEDBACK_PARTICIPANT ||
    stage === RoomStage.FEEDBACK_SPECTATOR
  );
}

export function shouldShowAdvanceButton(state: RoomState) {
  return (
    state.stage === RoomStage.SELF_TURN ||
    state.stage === RoomStage.PARTICIPANT ||
    state.stage === RoomStage.FEEDBACK_SELF_TURN
  );
}

export function triviaIsPresent(
  state: RoomState
): state is RoomStateWithTrivia {
  return !!state.trivia;
}

export function shouldShowTrivia(stage: RoomStage) {
  return (
    stage === RoomStage.SELF_TURN ||
    stage === RoomStage.PARTICIPANT ||
    isFeedbackStage(stage) ||
    stage === RoomStage.SPECTATOR
  );
}

export function shouldShowBottomPanel(stage: RoomStage) {
  return (
    stage !== RoomStage.LOBBY &&
    stage !== RoomStage.WAITING_ROOM &&
    stage !== RoomStage.RESULTS
  );
}

export function triviaRequiredAnswers(state: RoomState) {
  if (state.trivia && state.trivia.answerType === 'matchrank') {
    return 2;
  }
  return 1;
}

export function hasNumericSelectionOrder(trivia: Trivia) {
  const { answerType } = trivia;
  return answerType === 'stat.asc' || answerType === 'stat.desc';
}

function hasSelectionOrder(trivia: Trivia) {
  const { answerType } = trivia;
  return (
    answerType === 'stat.asc' ||
    answerType === 'stat.desc' ||
    answerType === 'matchrank'
  );
}

export function canAnswerTrivia(stage: RoomStage) {
  return stage === RoomStage.SELF_TURN || stage === RoomStage.PARTICIPANT;
}

export function shouldShowSelectionOrder(state: RoomState) {
  return (
    canAnswerTrivia(state.stage) &&
    state.trivia &&
    hasSelectionOrder(state.trivia)
  );
}

export function statToNumber(
  statDef: Trivia['statDef'],
  value: string | string[],
  _default = NaN
) {
  if (
    Array.isArray(value) ||
    !statDef ||
    statDef.type === 'string' ||
    statDef.type === 'lat_lon'
  ) {
    return _default;
  }
  switch (statDef.type) {
    case 'dollar_amount':
      return parseFloat(value.slice(1).replace(/,/g, ''));
    case 'number':
    case 'km_distance':
      return parseFloat(value.replace(/,/g, ''));
    case 'date':
      if (statDef.axisMod === 'age') {
        const [years, ms] = relativeDeltaToNow(new Date(value));
        return years + ms / 365 / 24 / 3600 / 1000;
      }
      return new Date(value).getTime();
    default:
      throw new Error('Unhandled stat type');
  }
}

export type TriviaOptionStyle = {
  chip: ViewProps['style'];
  barGraph?: ViewProps['style'];
  directionIndicator?: string;
};

export type RightWrongUnmarked = boolean | undefined;

export function getChangeInRanking(
  rankIndices: OrderedSet<number>,
  values: number[],
  ascending: boolean
) {
  const mult = ascending ? 1 : -1;
  const getRank = (index: number) => rankIndices.getIndex(index) as number;
  const valuesWithIndex = values.map((value, index) => ({ index, value }));
  const bestCorrectOrder = argsort(valuesWithIndex, (a, b) => {
    const diff = mult * (a.value - b.value);
    if (diff !== 0) {
      return diff;
    }
    return getRank(a.index) - getRank(b.index);
  });
  const correctIndexToOrder = new Map(
    bestCorrectOrder.map((index, pos) => [index, pos])
  );
  return values.map(
    (_, index) => (correctIndexToOrder.get(index) ?? -1) - getRank(index)
  );
}

export function getCorrectArray(state: RoomState, answers: OrderedSet<number>) {
  const { trivia } = state;
  if (!trivia) {
    return [];
  }
  const { statDef, options, answerType } = trivia;
  if (answerType === 'matchrank') {
    const otherId =
      state.stage === RoomStage.FEEDBACK_PARTICIPANT
        ? state.players.activeId
        : state.participantId;
    const recvArray = state.receivedAnswers.get(otherId ?? -1);
    if (!recvArray) {
      return [];
    }
    const order = argsort(recvArray, (a, b) => a - b);
    return options.map(
      (_, index) => order[index] === (answers.getIndex(index) ?? -1)
    );
  }
  if (answerType === 'selection') {
    // true for (correct, selected) and (incorrect, not selected).
    return options.map(
      ({ inSelection }, whichOption) => inSelection === answers.has(whichOption)
    );
  }
  if (!statDef || statDef.type === 'string') {
    return [];
  }
  const numeric = options.map((opt) =>
    statToNumber(statDef, opt.questionValue, 0)
  );
  if (answerType === 'stat.min') {
    const idxOfMin = argsort(numeric, (a, b) => a - b)[0];
    return numeric.map((x, whichOption) =>
      answers.has(whichOption) ? whichOption === idxOfMin : undefined
    );
  }
  if (answerType === 'stat.max') {
    const idxOfMax = argsort(numeric, (a, b) => -a + b)[0];
    return numeric.map((x, whichOption) =>
      answers.has(whichOption) ? whichOption === idxOfMax : undefined
    );
  }
  if (hasSelectionOrder(trivia)) {
    return getChangeInRanking(answers, numeric, answerType === 'stat.asc').map(
      (change) => change === 0
    );
  }
  return [];
}

export function allCorrect(state: RoomState, answers: OrderedSet<number>) {
  return getCorrectArray(state, answers).every((e) => e !== false);
}

export function getOptionStyles(
  state: RoomState,
  answers: OrderedSet<number>,
  splitView: boolean
): TriviaOptionStyle[] {
  const { stage, trivia } = state;
  if (!trivia) {
    return [];
  }
  const selfTurn =
    state.selfId !== undefined && state.selfId === state.players.activeId;
  const defaultBg =
    canAnswerTrivia(stage) || selfTurn
      ? styles.bgPaperDarker
      : styles.bgGray350;
  const { statDef, options } = trivia;
  if (!isFeedbackStage(stage)) {
    return trivia.options.map((_, index) => ({
      chip:
        !splitView && answers.has(index)
          ? [styles.bgPurple300, styles.borderPurpleAccent]
          : [defaultBg],
    }));
  }
  if (trivia.answerType === 'matchrank') {
    const correctArr = getCorrectArray(state, answers);
    return correctArr.map((isCorrect) => ({
      chip:
        isCorrect === true
          ? [styles.borderGreenAccent, styles.bgSeaGreen300]
          : isCorrect === false
          ? [styles.borderRedAccent, styles.bgRed300]
          : [defaultBg],
    }));
  } else if (trivia.answerType === 'selection') {
    return options.map(({ inSelection }, whichOption) => ({
      chip: inSelection
        ? [styles.borderGreenAccent, styles.bgSeaGreen300]
        : answers.has(whichOption)
        ? [styles.borderRedAccent, styles.bgRed300]
        : [defaultBg],
    }));
  } else {
    if (!statDef || statDef.type === 'string') {
      return [];
    }
    const numeric = options.map((opt) =>
      statToNumber(statDef, opt.questionValue, 0)
    );
    const correctArr = getCorrectArray(state, answers);

    const axisConsideredVals = [
      ...numeric,
      ...(statDef.axisMin != null ? [statDef.axisMin] : []),
      ...(statDef.axisMax != null ? [statDef.axisMax] : []),
    ];
    let max = Math.max(...axisConsideredVals);
    let min = Math.min(...axisConsideredVals);
    const padding = Math.max((max - min) / 6, 0.01);
    if (min !== statDef.axisMin) {
      if (['dollar_amount', 'number', 'km_distance'].includes(statDef.type)) {
        min = Math.min(0, min);
      } else {
        min -= padding;
      }
    }
    if (max !== statDef.axisMax) {
      max += padding;
    }
    const changeInRanking = hasNumericSelectionOrder(trivia)
      ? getChangeInRanking(answers, numeric, trivia.answerType === 'stat.asc')
      : undefined;
    const changeSignToIndicator = new Map([
      [-1, '▲'],
      [1, '▼'],
    ]);
    return numeric.map((num, i) => {
      const frac = (num - min) / (max - min);
      const isCorrect = correctArr[i];
      return {
        chip: [
          styles.bgPaperDarker,
          isCorrect === true
            ? [styles.borderGreenAccent]
            : isCorrect === false
            ? [styles.borderRedAccent]
            : [styles.borderGray400],
        ],
        barGraph: [
          isCorrect === true
            ? styles.bgSeaGreen300
            : isCorrect === false
            ? styles.bgRed300
            : styles.bgGray350,
          {
            width: `${Math.round(100 * frac)}%`,
          },
        ],
        directionIndicator:
          changeInRanking &&
          changeSignToIndicator.get(Math.sign(changeInRanking[i])),
      };
    });
  }
}
