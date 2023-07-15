import { ColorValue } from 'react-native';
import config from '../config';
import { AsyncStorageLogger } from './logging';

export type Deck = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
  imageDominantColor?: ColorValue;
  numEnabledCards: number;
  canSelectDifficulty: boolean;
  canSelectCategories: boolean;
  categoryCounts?: {
    name: string;
    count: number;
  }[];
  tagDefinitions?: {
    id: number;
    label: string;
    valueCounts: {
      value: string;
      count: number;
    }[];
  };
};

export type Card = {
  id: number;
  title: string;
  category?: string;
  popularity?: number;
  tags: {
    [key: string]: string[];
  };
};

export type Game = {
  deck: Deck;
  cards: Card[];
};

export type RoomAndSelf = {
  roomId: string;
  createdAt: string;
  userId: number;
  displayName: string;
};

export type RoomUser = {
  userId: number;
  displayName: string;
};

export type TriviaOption<T> = {
  id: number;
  answer: string;
  questionValue: T;
};

export type TaggedTriviaOption =
  | { kind: 'date' } & TriviaOption<string>
  | { kind: 'number' } & TriviaOption<number>
  | { kind: 'number[]' } & TriviaOption<number[]>
  | { kind: 'string' } & TriviaOption<string>
  | { kind: 'string[]' } & TriviaOption<string[]>


type TriviaOptionLists<T> = {
  options: TriviaOption<T>[];
  prefilledAnswers: TriviaOption<T>[];
}

// export type TriviaStatType =
//   | 'number'
//   | 'string'
//   | 'date'
//   | 'dollar_amount'
//   | 'km_distance'
//   | 'lat_lon';

// export type TriviaQuestionValueType = 'string' | 'string[]' | 'number';

export type Trivia = {
  question: string;
  answerType: string;
  minAnswers: number;
  maxAnswers: number;
} & (
  | { questionValueType: 'date' } & TriviaOptionLists<string>
  | { questionValueType: 'number' } & TriviaOptionLists<number>
  | { questionValueType: 'number[]' } & TriviaOptionLists<number[]>
  | { questionValueType: 'string' } & TriviaOptionLists<string>
  | { questionValueType: 'string[]' } & TriviaOptionLists<string[]>
)

export type TriviaStatAnnotation = {
  axisMod?: string;
  axisMin?: number;
  axisMax?: number;
};
export type RoomScoreEntry = {
  userId: number;
  score: number;
  turnGrade: boolean | null;
};

export type RoomAnswersEntry = {
  userId: number;
  answered: number[];
};

export type TriviaExpectation =
  | { kind: 'all'; ids: number[] }
  | { kind: 'none'; ids: number[] }
  | { kind: 'none_lenient'; ids: number[]; max: number }
  | { kind: 'any'; ids: number[] }
  | {
      kind: 'all_pos';
      ids: number[];
      minPos: number;
    };

export type LazyTriviaExpectation = TriviaExpectation | { kind: 'matchrank' };

export type RoomIncomingMessage =
  | {
      event: 'clock';
      timestamp: number;
    }
  | {
      event: 'join';
      creatorId: number;
      createdAt: string;
      userId: number;
      displayName: string;
      users: {
        userId: number;
        displayName: string;
        isPresent: boolean;
      }[];
      roundMessages: RoomIncomingMessage[];
    }
  | {
      event: 'user:change';
      userId: number;
      displayName: string;
      isPresent: boolean;
    }
  | {
      event: 'turn:start';
      turnId: number;
      trivia: Trivia;
      participantId?: number;
      deadline: number;
      durationMillis: number;
    }
  | {
      event: 'turn:progress';
      turnId: number;
      scores: RoomScoreEntry[];
    }
  | {
      event: 'turn:feedback';
      turnId: number;
      isFinal: boolean;
      scores: RoomScoreEntry[];
      answers: RoomAnswersEntry[];
      expectedAnswers: LazyTriviaExpectation[];
      statAnnotation?: TriviaStatAnnotation;
      deadline: number;
      durationMillis: number;
    }
  | {
      event: 'round:scores';
      scores: RoomScoreEntry[];
    };

export type RoomOutgoingMessage =
  | {
      event: 'user:change';
      displayName: string;
    }
  | {
      event: 'round:start';
    }
  | {
      event: 'turn:feedback';
      turnId: number;
      answered: number[];
    }
  | {
      event: 'turn:end';
      fromTurnId: number;
    };

export class RestClient {
  logger: AsyncStorageLogger;

  constructor(logger: AsyncStorageLogger) {
    this.logger = logger;
  }

  async getJson(url: string) {
    this.logger.info({ called: 'getJson', url });
    const resp = await fetch(url);
    if (resp.ok) {
      return await resp.json();
    } else if (
      /\bapplication\/json\b/.test(resp.headers.get('Content-Type') || '')
    ) {
      const err = await resp.json();
      this.logger.error(err);
      throw new Error(err);
    } else {
      const err = await resp.text();
      this.logger.error(err);
      throw new Error(err);
    }
  }

  async postJson(url: string, body: any) {
    this.logger.info({ called: 'postJson', url, body });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      return await resp.json();
    } else if (
      /\bapplication\/json\b/.test(resp.headers.get('Content-Type') || '')
    ) {
      let content = await resp.json();
      this.logger.error(content);
      if (typeof content === 'object' && content?.error) {
        content = content.error;
      }
      throw new Error(content);
    } else {
      const err = await resp.text();
      this.logger.error(err);
      throw new Error(err);
    }
  }

  async listDecks() {
    return (await this.getJson(`${config.baseUrl}/api/decks`)) as Deck[];
  }

  async inspectADeck(id: number) {
    return (await this.getJson(`${config.baseUrl}/api/decks/${id}`)) as Deck;
  }

  async createGame(
    deckId: number,
    difficulty: number,
    categoryFrequencies: Record<string, number>
  ) {
    const diffQ = difficulty.toFixed(1);
    let categoryQ = Object.entries(categoryFrequencies)
      .flatMap(([name, lvl]) => [name, lvl.toFixed(1)])
      .join(',');
    categoryQ = encodeURIComponent(categoryQ);
    return (await this.getJson(
      `${config.baseUrl}/api/game/new/${deckId}` +
        `?difficulty=${diffQ}&categoryFreqs=${categoryQ}`
    )) as Game;
  }

  async createRoom(hostNickname: string) {
    return (await this.postJson(`${config.baseUrl}/api/room`, {
      hostNickname,
      version: config.ROOM_API_VERSION,
    })) as RoomAndSelf;
  }
}
