import { Presence } from 'phoenix';
import { TextProps, ViewProps } from 'react-native';
import { Trivia } from './api';
import { OrderedSet } from './data';
import { styles } from '../styles';
import { acceptableOrders } from './math';

export enum RoomStage {
  LOBBY,
  UNKNOWN_TURN,
  SELF_TURN,
  FEEDBACK,
  SPECTATOR,
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
  receivedAnswers?: number[];
};

export function shouldShowAdvanceButton(state: RoomState) {
  return (
    state.stage === RoomStage.SELF_TURN ||
    (state.stage === RoomStage.FEEDBACK &&
      state.selfId === state.players.activeId)
  );
}

export function shouldShowTrivia(stage: RoomStage) {
  return (
    stage === RoomStage.SELF_TURN ||
    stage === RoomStage.FEEDBACK ||
    stage === RoomStage.SPECTATOR
  );
}

function hasSelectionOrder(trivia: Trivia) {
  const { answerType } = trivia;
  return answerType === 'stat.asc' || answerType === 'stat.desc';
}

export function shouldShowSelectionOrder(state: RoomState) {
  return (
    state.stage === RoomStage.SELF_TURN &&
    state.trivia &&
    hasSelectionOrder(state.trivia)
  );
}

export function statToNumber(
  statDef: Trivia['statDef'],
  value: string | string[],
  _default = NaN
) {
  if (Array.isArray(value) || !statDef || statDef.type === 'string') {
    return _default;
  }
  switch (statDef.type) {
    case 'dollar_amount':
      return parseFloat(value.slice(1).replace(/,/g, ''));
    case 'number':
      return parseFloat(value.replace(/,/g, ''));
    case 'date':
      return new Date(value).getTime();
    default:
      throw new Error('Unhandled stat type');
  }
}

type TriviaOptionStyle = {
  chip: ViewProps['style'];
  selectionOrderDisp?: TextProps['style'];
  barGraph?: ViewProps['style'];
};

export function getOptionStyles(
  state: RoomState,
  answers: OrderedSet<number>
): TriviaOptionStyle[] {
  const { stage, trivia } = state;
  if (!trivia) {
    return [];
  }
  const { statDef, options } = trivia;
  if (stage !== RoomStage.FEEDBACK) {
    return trivia.options.map((_, index) => ({
      chip: answers.has(index)
        ? [styles.bgPurple300, styles.borderPurpleAccent]
        : [styles.bgPaperDarker],
      selectionOrderDisp: hasSelectionOrder(trivia) ? [] : undefined,
    }));
  }
  const showIncorrect = true; // state.players.activeId === state.selfId;
  if (hasSelectionOrder(trivia)) {
    if (!statDef || statDef.type === 'string') {
      return [];
    }
    const numeric = options.map((opt) =>
      statToNumber(statDef, opt.questionValue, 0)
    );
    const order = acceptableOrders(
      numeric,
      (a, b) => (a - b) * (trivia.answerType === 'stat.desc' ? -1 : 1)
    );

    let max = Math.max(...numeric);
    let min = Math.min(...numeric);
    const padding = Math.max((max - min) / 6, 0.01);
    if (statDef.type === 'dollar_amount' || statDef.type === 'number') {
      min = Math.min(0, min);
    } else {
      min -= padding;
    }
    max += padding;
    return numeric.map((num, whichOption) => {
      const frac = (num - min) / (max - min);
      const isCorrect = order[whichOption].has(
        answers.getIndex(whichOption) ?? -1
      );
      console.log(answers.toList());
      console.log(order);
      return {
        chip: [
          styles.bgPaperDarker,
          isCorrect
            ? [styles.borderGreenAccent]
            : showIncorrect
            ? [styles.borderRedAccent]
            : [],
        ],
        barGraph: [
          !showIncorrect || isCorrect ? styles.bgSeaGreen300 : styles.bgRed300,
          {
            width: `${Math.round(100 * frac)}%`,
          },
        ],
        selectionOrderDisp: isCorrect ? [styles.textEmerald] : [styles.textRed],
      };
    });
  } else {
    return options.map(({ inSelection }, whichOption) => ({
      chip: inSelection
        ? [styles.borderGreenAccent, styles.bgSeaGreen300]
        : showIncorrect && answers.has(whichOption)
        ? [styles.borderRedAccent, styles.bgRed300]
        : [styles.bgPaperDarker],
    }));
  }
}
