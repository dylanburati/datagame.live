import { Presence } from 'phoenix';
import { ViewProps } from 'react-native';
import {
  LazyTriviaExpectation,
  RoomScoreEntry,
  Trivia,
  TriviaExpectation,
  TriviaOption,
  TriviaStatDef,
} from './api';
import { OrderedSet } from './data';

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
  scoreMap = new Map<number, number>();

  constructor(array: RoomPlayer[]) {
    this.array = array;
    this.playerOrder = [];
    this.playerIndex = -1;
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
    this.playerIndex = -1;
    return this;
  }

  endTurn(): RoomPlayerList {
    this.playerIndex = -1;
    return this;
  }

  startTurn(playerId: number): RoomPlayerList {
    const indexGoing = this.playerOrder.indexOf(playerId);
    if (indexGoing >= 0) {
      this.playerIndex = indexGoing;
    }
    return this;
  }

  updateScores(scoreChanges: RoomScoreEntry[]) {
    scoreChanges.forEach(({ userId, score }) => {
      this.scoreMap.set(userId, score);
    });
    return this;
  }

  getPlayerName(id: number) {
    return this.array.find((item) => item.id === id)?.name;
  }

  get activeId() {
    return this.playerIndex >= 0
      ? this.playerOrder[this.playerIndex]
      : undefined;
  }

  get activeName() {
    const activeId = this.activeId;
    return activeId !== undefined ? this.getPlayerName(activeId) : undefined;
  }

  othersPresent(selfId: number): RoomPlayer[] {
    return this.array.filter((item) => item.id !== selfId && item.isPresent);
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
  participantId?: number;
  trivia?: Trivia;
  expectedAnswers?: LazyTriviaExpectation[];
  triviaStats?: {
    values: Map<number, number>;
    definition: TriviaStatDef;
  };
  receivedAnswers: Map<number, number[]>;
};

export type RoomStateWithTrivia = RoomState & {
  trivia: NonNullable<RoomState['trivia']>;
};

export type StyledTriviaOption = {
  option: TriviaOption;
  chipStyle: ViewProps['style'];
  barGraph?: ViewProps['style'];
  directionIndicator?: string;
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

function evaluateExpectations(
  expectations: TriviaExpectation[],
  answers: OrderedSet<number>,
  optionIds: number[]
) {
  const minimumPositions = new Map(optionIds.map((k) => [k, -1]));
  const maximumPositions = new Map(optionIds.map((k) => [k, -1]));
  for (const expObject of expectations) {
    const { kind, group } = expObject;
    if (kind === 'all') {
      const minPos = expObject.minPos ?? 0;
      const maxPos =
        expObject.minPos !== undefined
          ? minPos + group.length - 1
          : optionIds.length - 1;
      group.forEach((id) => {
        minimumPositions.set(id, minPos);
        maximumPositions.set(id, maxPos);
      });
    } else if (kind === 'any') {
      group.forEach((id) => {
        minimumPositions.set(id, -1);
        maximumPositions.set(id, 0);
      });
    }
  }

  return optionIds.map((id) => {
    const pos = answers.getIndex(id) ?? -1;
    const minPos = minimumPositions.get(id) as number;
    const maxPos = maximumPositions.get(id) as number;
    if (minPos <= pos && pos <= maxPos) {
      return maxPos >= 0 ? true : undefined;
    }
    if (minPos >= 0 && pos === -1) {
      return true; // incorrect, but should be colored green to differentiate
    }
    return false;
  });
}

function getChangeInRanking(
  expectations: TriviaExpectation[],
  answers: OrderedSet<number>,
  optionIds: number[]
) {
  const bestOrder = expectations
    .flatMap((expObject) =>
      expObject.kind === 'all' && expObject.minPos !== undefined
        ? [{ group: expObject.group, minPos: expObject.minPos }]
        : []
    )
    .sort((a, b) => a.minPos - b.minPos)
    .flatMap(({ group }) =>
      group.sort(
        (idA, idB) => (answers.get(idA) ?? -1) - (answers.get(idB) ?? -1)
      )
    );
  const bestOrderSet = OrderedSet.from(bestOrder);

  return optionIds.map((id) => {
    const pos = answers.getIndex(id) ?? -1;
    return (bestOrderSet.getIndex(id) ?? -1) - pos;
  });
}

export function getCorrectArray(state: RoomState) {
  const { trivia, expectedAnswers, participantId } = state;
  if (trivia === undefined || expectedAnswers === undefined) {
    return { correctArray: [] };
  }
  if (state.players.activeId === undefined) {
    return { correctArray: [] };
  }
  const answerList = state.receivedAnswers.get(state.players.activeId);
  if (answerList === undefined) {
    return { correctArray: [] };
  }
  const answers = OrderedSet.from(answerList);
  const expectations: TriviaExpectation[] = expectedAnswers.flatMap(
    (expObject) => {
      if (expObject.kind === 'matchrank') {
        if (participantId === undefined) {
          return [];
        }
        const answers2 = state.receivedAnswers.get(participantId);
        if (answers2 === undefined) {
          return [];
        }
        return answers2.map((id, index) => ({
          kind: 'all',
          group: [id],
          minPos: index,
        }));
      }
      return [expObject];
    }
  );
  const optionIds = trivia.options.map((o) => o.id);
  const correctArray = evaluateExpectations(expectations, answers, optionIds);
  if (hasNumericSelectionOrder(trivia)) {
    return {
      correctArray,
      changeInRanking: getChangeInRanking(expectations, answers, optionIds),
    };
  }
  return { correctArray };
}
