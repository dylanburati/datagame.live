export type StatArray =
  | {
      kind: "Number";
      unit: "Dollar" | "Kilometer" | null;
      values: (number | null)[];
    }
  | {
      kind: "LatLng";
      values: ([number, number] | null)[];
    }
  | {
      kind: "Date";
      values: (string | null)[];
    }
  | {
      kind: "String";
      values: (string | null)[];
    };

export type CardTable = {
  cards: {
    title: string;
    unique_id: string | null;
    is_disabled: boolean;
    notes: string | null;
    popularity: number;
    category: string | null;
  }[];
  tag_defs: {
    label: string;
    values: string[][];
  }[];
  stat_defs: {
    label: string;
    data: StatArray;
  }[];
};

export type Deck = {
  id: number;
  revision: number;
  title: string;
  spreadsheet_id: string;
  data: CardTable;
};

export type DeckAndCallouts = {
  callouts: (
    | { kind: "Warning"; message: string }
    | { kind: "Error"; message: string }
  )[];
  deck: Deck;
}

export type Spreadsheet = DeckAndCallouts[];

export type ApiRoutes = {
  show: string;
  create: string;
};

export declare class RestClient {
  routes: ApiRoutes;
  constructor(routes: ApiRoutes);
  getSpreadsheet(id: string): Promise<Spreadsheet>;
}

export {};
