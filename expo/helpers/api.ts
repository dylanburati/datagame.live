import config from '../config';

export type Deck = {
  id: number;
  title: string;
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

export async function listDecks() {
  return (await getJson(`${config.baseUrl}/api/decks`)) as Deck[];
}

export async function inspectADeck(id: number) {
  return (await getJson(`${config.baseUrl}/api/decks/${id}`)) as Deck;
}

export async function createGame(deckId: number, difficulty: number) {
  return (await getJson(
    `${config.baseUrl}/api/game/new/${deckId}` + `?difficulty=${difficulty}`
  )) as Deck;
}
