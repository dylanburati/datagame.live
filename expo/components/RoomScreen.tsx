import React, { useState, useEffect } from 'react';
import { Presence } from 'phoenix';
import { styles } from '../styles';
import { useRouteTyped } from '../helpers/navigation';
import { RoomStage } from '../helpers/nplayerLogic';
import { useChannel, useStateNoCmp } from '../helpers/hooks';
import { RoomIncomingMessage, RoomOutgoingMessage } from '../helpers/api';
import {
  ScrollView,
  Text,
  TextProps,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { roomStorageKey, storeJson } from '../helpers/storage';
import { FormattedRelativeDate } from './FormattedRelativeDate';
import { ChipPicker } from './ChipPicker';
import { OrderedSet } from '../helpers/data';

function indexToEmoji(index: number | undefined, width: number) {
  let styleArr: TextProps['style'] = [styles.textLg, { width }];
  let content = '';
  if (index === undefined) {
    content = '+';
    styleArr.push({ transform: [{ translateX: 3 }, { translateY: -1 }] });
  } else if (index < 20) {
    content = String.fromCharCode(0x2460 + index);
  } else if (index < 35) {
    content = String.fromCharCode(0x3251 + index);
  }

  return <Text style={styleArr}>{content}</Text>;
}

type RoomPlayer = {
  id: number;
  name: string;
  isPresent: boolean;
};

class RoomPlayerList {
  array: RoomPlayer[];
  presentIds = new Set<number>();

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

  othersPresent(selfId: number): RoomPlayer[] {
    return this.array.filter((item) => item.id !== selfId && item.isPresent);
  }
}

type RoomState = {
  stage: RoomStage;
  roomId: string;
  creatorId?: number;
  createdAt?: string;
  selfId?: number;
  selfName?: string;
  players: RoomPlayerList;
};

function roomReducer(state: RoomState, message: RoomIncomingMessage) {
  if (message.event === 'join') {
    storeJson(roomStorageKey(state.roomId), message);
    return {
      ...state,
      creatorId: message.creatorId,
      createdAt: message.createdAt,
      selfId: message.userId,
      selfName: message.displayName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
  }
  if (message.event === 'user:new') {
    return {
      ...state,
      players: state.players.upsert(
        message.userId,
        message.displayName,
        message.isNow ? true : null
      ),
    };
  }
  if (message.event === 'user:change') {
    if (message.userId === state.selfId) {
      storeJson(roomStorageKey(state.roomId), message);
    }
    return {
      ...state,
      selfName:
        message.userId === state.selfId ? message.displayName : state.selfName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
  }
  if (message.event === 'presence') {
    return {
      ...state,
      players: state.players.updatePresences(message.presence),
    };
  }

  return state;
}

export function RoomScreen() {
  const {
    params: { roomId, savedSession },
  } = useRouteTyped<'Room'>();
  const [nameOnJoin, setNameOnJoin] = useState('');
  const [draftName, setDraftName] = useState({
    name: '',
    error: undefined as string | undefined,
  });
  const [draftOrder, setDraftOrder] = useStateNoCmp(new OrderedSet<number>());

  const room = useChannel<RoomOutgoingMessage, RoomState, RoomIncomingMessage>({
    topic: `room:${roomId}`,
    joinParams: (state) => {
      if (state.selfId != null) {
        return { userId: state.selfId, displayName: state.selfName };
      }
      return { displayName: nameOnJoin };
    },
    disable: !nameOnJoin && !savedSession,
    reducer: roomReducer,
    initialState: {
      roomId,
      selfId: savedSession?.userId,
      selfName: savedSession?.displayName,
      stage: RoomStage.LOBBY,
      players: new RoomPlayerList([]),
    },
  });

  useEffect(() => {
    if (room.error) {
      setDraftName((prev) => ({
        ...prev,
        error: room.error,
      }));
      setNameOnJoin('');
    }
  }, [room.error]);

  useEffect(() => {
    if (room.state.selfName && room.connected) {
      console.log(room.state.selfName, room.connected);
      setDraftName({
        name: room.state.selfName,
        error: undefined,
      });
    }
  }, [room.connected, room.state.selfName]);

  const onSubmit = () => {
    if (!draftName) {
      return;
    }
    if (!room.connected) {
      setNameOnJoin(draftName.name);
    } else {
      room.broadcast(
        { event: 'user:change', displayName: draftName.name },
        (errorMsg) =>
          setDraftName((prev) => {
            if (prev.name === draftName.name) {
              return {
                name: draftName.name,
                error: errorMsg,
              };
            }
            return prev;
          })
      );
    }
  };

  const otherNames = room.state.selfId
    ? room.state.players
        .othersPresent(room.state.selfId)
        .map((pl) => pl.name)
        .join(', ')
    : '';
  const isCreator =
    room.state.selfId != null && room.state.selfId === room.state.creatorId;

  useEffect(() => {
    if (isCreator && room.state.selfId != null) {
      draftOrder.append(room.state.selfId);
    }
  }, [room.state.selfId, isCreator, draftOrder]);

  return (
    <View style={styles.topContainer}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.m4]}>
          <Text style={[styles.textXl, styles.fontWeightBold]}>{roomId}</Text>
          {room.state.createdAt && (
            <Text>
              Created{' '}
              <FormattedRelativeDate dateString={room.state.createdAt + 'Z'} />
            </Text>
          )}
          {room.state.selfId && (
            <Text>
              Here now: {otherNames ? `You + ${otherNames}` : 'Just you'}
            </Text>
          )}
        </View>
        <TextInput
          style={[
            styles.mx6,
            styles.p2,
            styles.bgPaperDarker,
            styles.textMd,
            styles.roundedLg,
          ]}
          placeholder="Enter name"
          value={draftName.name}
          onChangeText={(text) =>
            setDraftName({ name: text, error: undefined })
          }
        />
        {draftName.error && (
          <Text style={[styles.mx6, styles.textRed]}>{draftName.error}</Text>
        )}
        <View style={[styles.row, styles.mx6, styles.mt2]}>
          <TouchableOpacity
            style={[
              styles.bgBlue900,
              styles.roundedLg,
              styles.flexGrow,
              styles.p4,
            ]}
            onPress={onSubmit}
          >
            <Text style={[styles.textWhite, styles.textCenter]}>
              {room.connected ? 'CHANGE' : 'SET NAME'}
            </Text>
          </TouchableOpacity>
        </View>
        {isCreator && (
          <>
            <View style={[styles.row, styles.mt8, styles.mx4]}>
              <Text style={styles.textLg}>Select player order</Text>
              <TouchableOpacity
                style={[styles.bgRed, styles.p1, styles.px2, styles.roundedMd]}
                onPress={() => setDraftOrder(draftOrder.clear())}
              >
                <Text style={[styles.textCenter, styles.textWhite]}>reset</Text>
              </TouchableOpacity>
            </View>
            <ChipPicker
              style={[
                styles.row,
                styles.mt4,
                styles.mx6,
                styles.startAll,
                styles.flexWrap,
              ]}
              data={room.state.players.array}
              keySelector={(pl) => `player-${pl.id}`}
              onPress={(pl) => setDraftOrder(draftOrder.toggle(pl.id))}
              chipStyle={({ item }) =>
                draftOrder.has(item.id)
                  ? [styles.bgPurple300, styles.borderPurpleAccent]
                  : [styles.bgPaperDarker]
              }
            >
              {({ item }) => (
                <>
                  {indexToEmoji(draftOrder.getIndex(item.id), 24)}
                  <Text style={[styles.textMd, styles.fontWeightBold]}>
                    {item.name}
                  </Text>
                </>
              )}
            </ChipPicker>
            <View style={[styles.row, styles.mx6, styles.mt8]}>
              <TouchableOpacity
                style={[
                  styles.bgGreen,
                  styles.roundedLg,
                  styles.flexGrow,
                  styles.p4,
                ]}
                onPress={() => console.log('TODO begin')}
              >
                <Text style={[styles.textWhite, styles.textCenter]}>BEGIN</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
