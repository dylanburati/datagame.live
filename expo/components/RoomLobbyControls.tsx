import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { FormattedRelativeDate } from './FormattedRelativeDate';
import { RoomState } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type RoomLobbyControlsProps = {
  roomState: RoomState;
  roomError: string | undefined;
  renameError?: [string, string] | undefined;
  connected: boolean;
  doNameChange: (name: string) => void;
};

export function RoomLobbyControls({
  roomState,
  roomError,
  renameError,
  connected,
  doNameChange,
}: RoomLobbyControlsProps) {
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (roomState.selfName && connected) {
      setDraftName(roomState.selfName);
    }
  }, [connected, roomState.selfName]);

  const otherNames = roomState.selfId
    ? roomState.players
        .othersPresent(roomState.selfId)
        .map((pl) => pl.name)
        .join(', ')
    : '';
  const dispError =
    roomError ||
    (renameError && renameError[0] === draftName ? renameError[1] : undefined);
  const canChangeName = draftName.length && /^[^\s].*[^\s]$/.test(draftName);
  const btnColor = canChangeName ? [styles.bgBlue900] : [styles.bgGray300];
  const textColor = canChangeName ? [styles.textWhite] : [styles.textPenFaint];
  return (
    <>
      <View style={[styles.m4]}>
        <Text style={[styles.textXl, styles.fontBold]}>
          {roomState.roomId}
        </Text>
        {roomState.createdAt && (
          <Text>
            Created{' '}
            <FormattedRelativeDate dateString={roomState.createdAt + 'Z'} />
          </Text>
        )}
        {roomState.selfId && (
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
        value={draftName}
        onChangeText={setDraftName}
      />
      {dispError && (
        <Text style={[styles.mx6, styles.textRed]}>{dispError}</Text>
      )}
      <View style={[styles.row, styles.mx6, styles.mt2]}>
        <TouchableOpacity
          style={[btnColor, styles.roundedLg, styles.flexGrow, styles.p4]}
          disabled={!canChangeName}
          onPress={() => {
            if (canChangeName) {
              doNameChange(draftName);
            }
          }}
        >
          <Text style={[textColor, styles.textCenter]}>
            {connected ? 'CHANGE' : 'SET NAME'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
