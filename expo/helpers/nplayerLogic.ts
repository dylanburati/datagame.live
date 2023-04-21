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

export enum RoomPhase {
  NOT_REGISTERED,
  LOBBY,
  QUESTION,
  FEEDBACK,
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

  updateScores(scoreChanges: RoomScoreEntry[]) {
    scoreChanges.forEach(({ userId, score }) => {
      this.scoreMap.set(userId, score);
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

  scoresWithUpdates(scoreChanges: RoomScoreEntry[]) {
    return scoreChanges.map((e) => ({
      ...e,
      score: e.score + (this.scoreMap.get(e.userId) ?? 0),
    }));
  }
}

export type RoomZeroState = {
  roomId: string;
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
  triviaStats?: {
    values: Map<number, number>;
    definition: TriviaStatDef;
  };
  receivedAnswers: Map<number, number[]>;
  deadline: number;
  durationMillis: number;
};

export type RoomFeedbackState = RoomQuestionState & {
  expectedAnswers: LazyTriviaExpectation[];
};

export type RoomStateWithTrivia =
  | ({ phase: RoomPhase.QUESTION } & RoomQuestionState)
  | ({ phase: RoomPhase.FEEDBACK } & RoomFeedbackState);

export type RoomState =
  | RoomStateWithTrivia
  | ({ phase: RoomPhase.NOT_REGISTERED } & RoomZeroState)
  | ({ phase: RoomPhase.LOBBY } & RoomLobbyState);

export type StyledTriviaOption = {
  option: TriviaOption;
  chipStyle: ViewProps['style'];
  barGraph?: ViewProps['style'];
  directionIndicator?: string;
};

export function isFeedbackStage(phase: RoomPhase) {
  return phase === RoomPhase.FEEDBACK;
}

export function triviaIsPresent(
  state: RoomState
): state is RoomStateWithTrivia {
  return (
    state.phase === RoomPhase.QUESTION || state.phase === RoomPhase.FEEDBACK
  );
}

export function expectedAnswersArePresent(
  state: RoomState
): state is { phase: RoomPhase.FEEDBACK } & RoomFeedbackState {
  return state.phase === RoomPhase.FEEDBACK;
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

export function getCorrectArray(state: RoomFeedbackState) {
  const { trivia, expectedAnswers, participantId } = state;
  const answerList = state.receivedAnswers.get(state.selfId);
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
