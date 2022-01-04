import React from 'react';
import { Text, View } from 'react-native';
import { GridLayout } from './GridLayout';
import { RoomPlayerList } from '../helpers/nplayerLogic';
import { styleConfig, styles } from '../styles';

export type RoomLeaderboardProps = {
  selfId: number | undefined;
  players: RoomPlayerList;
};

export function RoomLeaderboard({ selfId, players }: RoomLeaderboardProps) {
  const array = players.array.map((pl) => ({
    player: pl,
    score: players.getScore(pl.id) ?? 0,
  }));
  array.sort((a, b) => -a.score + b.score);
  const rowStyles = [styles.row, styles.flex1, styles.mx6, styles.p1];
  return (
    <GridLayout
      gridMaxWidth={styleConfig.topMaxWidth}
      horizontalInset={0}
      minColumnWidth={1}
      maxColumnCount={1}
      style={styles.mt4}
      data={array}
    >
      {({ item }) => (
        <View
          key={item.player.id}
          style={
            item.player.id === selfId
              ? [...rowStyles, styles.bgBlue100]
              : rowStyles
          }
        >
          <Text>
            {item.player.name}
            {item.player.isPresent ? '' : ' (offline)'}
          </Text>
          <Text>{item.score}</Text>
        </View>
      )}
    </GridLayout>
  );
}
