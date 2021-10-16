import { Presence } from 'phoenix';
import { Trivia } from './api';

export enum RoomStage {
  LOBBY,
  UNKNOWN_TURN,
  SELF_TURN,
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
    this.playerIndex = Math.min(0, order.length - 1);
    return this;
  }

  appendTurn(playerId: number): RoomPlayerList {
    const indexWent = this.playerOrder.indexOf(playerId);
    if (indexWent >= 0) {
      this.playerIndex = (indexWent + 1) % this.playerOrder.length;
    }
    return this;
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
  currentPlayerName?: string;
  turnId: number;
  trivia?: Trivia;
};

export function shouldShowTrivia(stage: RoomStage) {
  return stage === RoomStage.SELF_TURN || stage === RoomStage.SPECTATOR;
}
