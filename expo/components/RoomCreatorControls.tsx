import React, { useEffect } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { ChipPicker } from './ChipPicker';
import { OrderedSet } from '../helpers/data';
import { useStateNoCmp } from '../helpers/hooks';
import { RoomState } from '../helpers/nplayerLogic';
import { styles } from '../styles';
import { indexEncircled } from '../helpers/iconography';

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
  const [draftOrder, setDraftOrder] = useStateNoCmp(new OrderedSet<number>());
  const canBegin =
    roomState.selfId !== undefined &&
    draftOrder.has(roomState.selfId) &&
    (soloGamePermitted || draftOrder.size >= 2);

  useEffect(() => {
    if (roomState.selfId) {
      setDraftOrder(draftOrder.append(roomState.selfId));
    }
  }, [draftOrder, roomState.selfId, setDraftOrder]);

  const btnColor = canBegin ? [styles.bgGreen] : [styles.bgGray300];
  const textColor = canBegin ? [styles.textWhite] : [styles.textPenFaint];
  return (
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
        data={roomState.players.array}
        keySelector={(pl) => `player-${pl.id}`}
        onPress={({ item }) => setDraftOrder(draftOrder.toggle(item.id))}
        chipStyle={({ item }) => [
          styles.mb1,
          draftOrder.has(item.id)
            ? [styles.bgPurple300, styles.borderPurpleAccent]
            : [styles.bgPaperDarker],
        ]}
      >
        {({ item }) => (
          <>
            {indexEncircled(draftOrder.getIndex(item.id), 24)}
            <Text style={[styles.textMd, styles.fontBold]}>{item.name}</Text>
          </>
        )}
      </ChipPicker>
      <View style={[styles.row, styles.mx6, styles.mt8]}>
        <TouchableOpacity
          style={[btnColor, styles.roundedLg, styles.flexGrow, styles.p4]}
          disabled={!canBegin}
          onPress={() => doBegin(draftOrder.toList())}
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
