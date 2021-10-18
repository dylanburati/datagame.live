import objectInspect from 'object-inspect';
import { Presence } from 'phoenix';
import { ColorValue } from 'react-native';
import config from '../config';

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

export type TriviaOption = {
  answer: string;
  popularity?: number;
  inSelection: boolean;
  questionValue: string | string[];
};

export type TriviaStatType = 'number' | 'string' | 'date' | 'dollar_amount';

export type Trivia = {
  question: string;
  options: TriviaOption[];
  answerType: string;
  minAnswers: number;
  maxAnswers: number;
  statDef?: {
    label: string;
    type: TriviaStatType;
  };
};

export type RoomIncomingMessage =
  | {
      event: 'join';
      creatorId: number;
      createdAt: string;
      userId: number;
      displayName: string;
    }
  | {
      event: 'user:new';
      userId: number;
      displayName: string;
      isNow: boolean;
    }
  | {
      event: 'user:change';
      userId: number;
      displayName: string;
    }
  | {
      event: 'round:start';
      playerOrder: number[];
      turnId: number;
      pointTarget: number;
    }
  | {
      event: 'turn:start';
      userId: number;
      turnId: number;
      trivia: Trivia;
    }
  | {
      event: 'turn:end';
      userId: number;
    }
  | {
      event: 'turn:feedback';
      answered: number[];
      turnId: number;
      userId: number;
    }
  | {
      event: 'presence';
      presence: Presence;
    };

export type RoomOutgoingMessage =
  | {
      event: 'user:change';
      displayName: string;
    }
  | {
      event: 'round:start';
      playerOrder: number[];
      pointTarget: number;
    }
  | {
      event: 'turn:start';
      fromTurnId: number;
    }
  | {
      event: 'turn:feedback';
      answered: number[];
    }
  | {
      event: 'turn:end';
    };

async function getJson(url: string) {
  const resp = await fetch(url);
  if (resp.ok) {
    return await resp.json();
  } else if (
    /\bapplication\/json\b/.test(resp.headers.get('Content-Type') || '')
  ) {
    throw new Error(await resp.json());
  } else {
    throw new Error(await resp.text());
  }
}

async function postJson(url: string, body: any) {
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
    console.log(objectInspect(content));
    if (typeof content === 'object' && content?.error) {
      content = content.error;
    }
    throw new Error(content);
  } else {
    throw new Error(await resp.text());
  }
}

export async function listDecks() {
  return (await getJson(`${config.baseUrl}/api/decks`)) as Deck[];
}

export async function inspectADeck(id: number) {
  return (await getJson(`${config.baseUrl}/api/decks/${id}`)) as Deck;
}

export async function createGame(
  deckId: number,
  difficulty: number,
  categoryFrequencies: Record<string, number>
) {
  const diffQ = difficulty.toFixed(1);
  let categoryQ = Object.entries(categoryFrequencies)
    .flatMap(([name, lvl]) => [name, lvl.toFixed(1)])
    .join(',');
  categoryQ = encodeURIComponent(categoryQ);
  return (await getJson(
    `${config.baseUrl}/api/game/new/${deckId}` +
      `?difficulty=${diffQ}&categoryFreqs=${categoryQ}`
  )) as Game;
}

export async function createRoom(hostNickname: string) {
  return (await postJson(`${config.baseUrl}/api/room`, {
    hostNickname,
  })) as RoomAndSelf;
}
