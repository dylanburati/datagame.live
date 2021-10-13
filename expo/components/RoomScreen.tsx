import React, { useRef, useState, useEffect, useCallback } from 'react';
import { styles } from '../styles';
import { useNavigationTyped, useRouteTyped } from '../helpers/navigation';
import { RoomStage } from '../helpers/nplayerLogic';
import { useChannel } from '../helpers/hooks';
import { RoomIncomingMessage, RoomOutgoingMessage } from '../helpers/api';
import { omit } from 'lodash';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { loadJson, roomStorageKey, storeJson } from '../helpers/storage';

type RoomPlayer = {
  id: number;
  name: string;
  isPresent: boolean;
};

class RoomPlayerList {
  array: RoomPlayer[];

  constructor(array: RoomPlayer[]) {
    this.array = array;
  }

  upsert(id: number, name: string, isPresent: boolean): RoomPlayerList {
    const index = this.array.findIndex(item => item.id === id);
    const newItem = {
      id,
      name,
      isPresent,
    };
    if (index === -1) {
      this.array.push(newItem);
    } else {
      this.array[index] = newItem;
    }
    return this;
  }
}

type RoomState = {
  stage: RoomStage;
  roomId: string;
  creatorId?: number;
  selfId?: number;
  selfName?: string;
  players: RoomPlayerList;
};

function roomReducer(state: RoomState, message: RoomIncomingMessage) {
  console.log(message);
  if (message.event === 'join') {
    storeJson(roomStorageKey(state.roomId), message);
    return {
      ...state,
      creatorId: message.creatorId,
      selfId: message.userId,
      selfName: message.displayName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
  }
  if (message.event === 'user:new') {
    return {
      ...state,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
  }
  if (message.event === 'user:change') {
    storeJson(roomStorageKey(state.roomId), message);
    return {
      ...state,
      selfName:
        message.userId === state.selfId ? message.displayName : state.selfName,
      players: state.players.upsert(message.userId, message.displayName, true),
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
  return (
    <View style={styles.topContainer}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextInput
          style={[
            styles.mx6,
            styles.mb2,
            styles.p2,
            styles.bgPaperDarker,
            styles.textMd,
            styles.roundedLg,
          ]}
          placeholder="Enter name"
          editable={savedSession !== undefined}
          value={draftName.name}
          onChangeText={(text) =>
            setDraftName({ name: text, error: undefined })
          }
        />
        <View style={[styles.row, styles.mx4]}>
          <TouchableOpacity
            style={[
              styles.bgBlue900,
              styles.roundedLg,
              styles.flexGrow,
              styles.m2,
              styles.p4,
            ]}
            onPress={onSubmit}
          >
            <Text style={[styles.textWhite, styles.textCenter]}>
              {room.connected ? 'CHANGE' : 'SET NAME'}
            </Text>
          </TouchableOpacity>
        </View>
        {draftName.error && (
          <Text style={[styles.mx6, styles.textRed]}>{draftName.error}</Text>
        )}
        <Text style={{ fontFamily: 'Menlo-Regular' }}>
          {JSON.stringify(room.state, null, 2)}
        </Text>
      </ScrollView>
    </View>
  );
}
