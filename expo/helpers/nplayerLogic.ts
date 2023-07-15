import { ViewProps } from 'react-native';
import {
  LazyTriviaExpectation,
  RoomScoreEntry,
  Trivia,
  TriviaExpectation,
  TriviaStatAnnotation,
} from './api';
import { OrderedSet } from './data';

export enum RoomPhase {
  NOT_REGISTERED,
  LOBBY,
  QUESTION,
  DIRECT_FEEDBACK,
  ROOM_FEEDBACK,
  RESULTS,
}

export const ROOM_PHASE_LABELS = {
  [RoomPhase.NOT_REGISTERED]: 'NOT_REGISTERED',
  [RoomPhase.LOBBY]: 'LOBBY',
  [RoomPhase.QUESTION]: 'QUESTION',
  [RoomPhase.DIRECT_FEEDBACK]: 'DIRECT_FEEDBACK',
  [RoomPhase.ROOM_FEEDBACK]: 'ROOM_FEEDBACK',
  [RoomPhase.RESULTS]: 'RESULTS',
};

export type RoomPlayer = {
  id: number;
  name: string;
  isPresent: boolean;
  lastGrade?: {
    turnId: number;
    value: boolean;
  };
};

export class RoomPlayerList {
  array: RoomPlayer[];
  presentIds = new Set<number>();
  scoreMap = new Map<number, number>();

  constructor(array: RoomPlayer[]) {
    this.array = array;
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
      this.array[index] = newItem;
    }
    return this;
  }

  updateScores(scoreChanges: RoomScoreEntry[], turnId: number) {
    scoreChanges.forEach(({ userId, score, turnGrade }) => {
      this.scoreMap.set(userId, score);
      if (turnGrade !== null) {
        const index = this.array.findIndex((item) => item.id === userId);
        if (index !== -1) {
          this.array[index] = {
            ...this.array[index],
            lastGrade: {
              turnId,
              value: turnGrade,
            },
          };
        }
      }
    });
    return this;
  }

  getPlayerName(id: number) {
    return this.array.find((item) => item.id === id)?.name;
  }

  othersPresent(selfId: number): RoomPlayer[] {
    return this.array.filter((item) => item.id !== selfId && item.isPresent);
  }

  getScore(playerId: number) {
    return this.scoreMap.get(playerId);
  }

  getGrade(playerId: number, turnId: number): boolean | null {
    const entry = this.array.find((item) => item.id === playerId);
    if (entry === undefined || entry.lastGrade?.turnId !== turnId) {
      return null;
    }
    return entry.lastGrade.value;
  }

  scoresWithUpdates(scoreChanges: RoomScoreEntry[]) {
    return scoreChanges.map((e) => ({
      ...e,
      score: e.score + (this.scoreMap.get(e.userId) ?? 0),
    }));
  }
}

export type RoomZeroState = {
  roomId: string;
  clockDiffMs: number;
};

export type RoomLobbyState = RoomZeroState & {
  creatorId: number;
  createdAt: string;
  selfId: number;
  selfName: string;
  players: RoomPlayerList;
};

export type RoomQuestionState = RoomLobbyState & {
  trivia: Trivia;
  turnId: number;
  participantId?: number;
  statAnnotation?: TriviaStatAnnotation;
  receivedAnswers: Map<number, number[]>;
  deadline: number;
  durationMillis: number;
};

export type RoomFeedbackState = RoomQuestionState & {
  expectedAnswers: LazyTriviaExpectation[];
};

export type RoomStateWithTrivia =
  | ({ phase: RoomPhase.QUESTION } & RoomQuestionState)
  | ({ phase: RoomPhase.DIRECT_FEEDBACK } & RoomFeedbackState)
  | ({ phase: RoomPhase.ROOM_FEEDBACK } & RoomFeedbackState);

export type RoomState =
  | RoomStateWithTrivia
  | ({ phase: RoomPhase.NOT_REGISTERED } & RoomZeroState)
  | ({ phase: RoomPhase.LOBBY } & RoomLobbyState);

export type StyledTriviaOption = {
  option: Trivia['options'][0];
  chipStyle: ViewProps['style'];
  barGraph?: ViewProps['style'];
  directionIndicator?: string;
  numericValue?: number;
};

export function isFeedbackStage(phase: RoomPhase) {
  return (
    phase === RoomPhase.DIRECT_FEEDBACK || phase === RoomPhase.ROOM_FEEDBACK
  );
}

export function triviaIsPresent(
  state: RoomState
): state is RoomStateWithTrivia {
  return (
    state.phase === RoomPhase.QUESTION ||
    state.phase === RoomPhase.DIRECT_FEEDBACK ||
    state.phase === RoomPhase.ROOM_FEEDBACK
  );
}

export function expectedAnswersArePresent(state: RoomState): state is {
  phase: RoomPhase.DIRECT_FEEDBACK | RoomPhase.ROOM_FEEDBACK;
} & RoomFeedbackState {
  return isFeedbackStage(state.phase);
}

export function shouldShowBottomPanel(phase: RoomPhase) {
  return phase !== RoomPhase.LOBBY && phase !== RoomPhase.RESULTS;
}

export function hasNumericSelectionOrder(trivia: Trivia) {
  const { answerType } = trivia;
  return answerType === 'stat.asc' || answerType === 'stat.desc';
}

function evaluateExpectations(
  expectations: TriviaExpectation[],
  answers: OrderedSet<number>,
  optionIds: number[]
) {
  const minimumPositions = new Map(optionIds.map((k) => [k, -1]));
  const maximumPositions = new Map(optionIds.map((k) => [k, -1]));
  for (const exp of expectations) {
    if (exp.kind === 'all') {
      exp.ids.forEach((id) => {
        minimumPositions.set(id, 0);
        maximumPositions.set(id, optionIds.length - 1);
      });
    } else if (exp.kind === 'all_pos') {
      exp.ids.forEach((id) => {
        minimumPositions.set(id, exp.minPos);
        maximumPositions.set(id, exp.minPos + exp.ids.length - 1);
      });
    } else if (exp.kind === 'any') {
      exp.ids.forEach((id) => {
        minimumPositions.set(id, -1);
        maximumPositions.set(id, 0);
      });
    }
  }

  const expInclusionPairs = optionIds.map(
    (id): [boolean, boolean | undefined] => {
      // -> [expected to be included, included ? in correct place : undefined]
      const pos = answers.getIndex(id) ?? -1;
      const minPos = minimumPositions.get(id) as number;
      const maxPos = maximumPositions.get(id) as number;
      if (minPos <= pos && pos <= maxPos) {
        return maxPos >= 0 ? [true, true] : [false, undefined];
      }
      if (minPos >= 0 && pos === -1) {
        return [true, undefined];
      }
      return [minPos >= 0, false];
    }
  );
  const includedWrongCount = expInclusionPairs.filter(
    ([a, b]) => a && b === false
  ).length;
  return expInclusionPairs.map(([a, b]) => {
    if (a && b === undefined && includedWrongCount > 0) {
      return true; // incorrect, but should be colored green to differentiate
    }
    return b;
  });
}

export function getChangeInRanking(
  expectations: TriviaExpectation[],
  answers: OrderedSet<number>,
  optionIds: number[]
): (number | undefined)[] {
  const bestOrder = expectations
    .flatMap((expObject) =>
      expObject.kind === 'all_pos' && expObject.minPos !== undefined
        ? [{ ids: expObject.ids, minPos: expObject.minPos }]
        : []
    )
    .sort((a, b) => a.minPos - b.minPos)
    .flatMap(({ ids }) =>
      ids.sort(
        (idA, idB) => (answers.get(idA) ?? -1) - (answers.get(idB) ?? -1)
      )
    );
  const bestOrderSet = OrderedSet.from(bestOrder);

  return optionIds.map((id) => {
    const pos = answers.getIndex(id);
    if (pos === undefined) {
      return undefined;
    }
    return (bestOrderSet.getIndex(id) ?? -1) - pos;
  });
}

export function getCorrectArray(state: RoomFeedbackState) {
  const { trivia, expectedAnswers, participantId } = state;
  const answerList = state.receivedAnswers.get(state.selfId) || [];
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
          ids: [id],
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
