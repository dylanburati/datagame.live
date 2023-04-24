import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { RoomPhase, RoomState } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type RoomCreatorControlsProps = {
  roomState: RoomState;
  canCancel: boolean;
  doCancel: () => void;
  doBegin: (playerOrder: number[]) => void;
};

const soloGamePermitted = __DEV__;

export function RoomCreatorControls({
  roomState,
  canCancel,
  doCancel,
  doBegin,
}: RoomCreatorControlsProps) {
  const players =
    roomState.phase === RoomPhase.NOT_REGISTERED ? [] : roomState.players.array;
  const canBegin = soloGamePermitted || players.length >= 2;

  const btnColor = canBegin ? [styles.bgGreen] : [styles.bgGray300];
  const textColor = canBegin ? [styles.textWhite] : [styles.textPenFaint];
  return (
    <>
      <View style={[styles.row, styles.mt8, styles.mx4]}>
        <Text style={styles.textLg}>Customize game</Text>
      </View>
      <View
        style={[
          styles.row,
          styles.bgPaperDarker,
          styles.justifyCenter,
          styles.mt4,
          styles.mx6,
        ]}
      >
        <Text style={styles.p1}>No sliders yet</Text>
      </View>
      <View style={[styles.row, styles.mx6, styles.mt4]}>
        <TouchableOpacity
          style={[btnColor, styles.roundedLg, styles.flexGrow, styles.p4]}
          disabled={!canBegin}
          onPress={() => doBegin(players.map((pl) => pl.id))}
        >
          <Text style={[textColor, styles.textCenter]}>BEGIN</Text>
        </TouchableOpacity>
        {canCancel && (
          <TouchableOpacity
            style={[
              styles.bgBlue300,
              styles.roundedLg,
              styles.flexGrow,
              styles.p4,
              styles.ml4,
            ]}
            onPress={doCancel}
          >
            <Text style={[styles.textCenter]}>CANCEL</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}
