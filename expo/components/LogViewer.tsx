import React, { useState, useEffect } from 'react';
import { SafeAreaView, FlatList, Text } from 'react-native';
import { LogPersist, LogLine } from '../helpers/storage';
import { useStateNoCmp } from '../helpers/hooks';
import { OrderedSet } from '../helpers/data';
import { ChipPicker } from './ChipPicker';
import { styles } from '../styles';

export function LogViewer() {
  const levels = [
    { name: 'INFO', styles: [] },
    { name: 'WARNING', styles: [styles.bgAmber200] },
    { name: 'ERROR', styles: [styles.textRed] },
  ];
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [included, setIncluded] = useStateNoCmp(
    new OrderedSet().extend(['INFO', 'WARNING', 'ERROR'])
  );

  useEffect(() => {
    LogPersist.readLogs().then((theLogs) => setLogs(theLogs));
  }, []);

  const logsToShow = logs.filter(([_, line]) => {
    const spaceIdx = line.indexOf(' ');
    return spaceIdx > 0 && included.has(line.slice(0, spaceIdx));
  });
  return (
    <SafeAreaView style={styles.topContainer}>
      <ChipPicker
        style={[
          styles.row,
          styles.mt4,
          styles.mx4,
          styles.startAll,
          styles.flexWrap,
        ]}
        data={levels}
        keySelector={(item) => `toggle-${item.name}`}
        onPress={({ item }) => setIncluded(included.toggle(item.name))}
        chipStyle={({ item }) => [
          styles.mb1,
          included.has(item.name)
            ? [styles.bgPurple300, styles.borderPurpleAccent]
            : [styles.bgPaperDarker],
        ]}
      >
        {({ item, index }) => (
          <Text style={[styles.textMd, styles.fontBold]}>
            {index === 0 ? 'show ' : ''}
            {item.name.toLowerCase()}
          </Text>
        )}
      </ChipPicker>
      <FlatList
        style={[styles.mt4, styles.px4]}
        data={logsToShow}
        keyExtractor={(_, index) => `${index}`}
        renderItem={({ item }) => {
          const [timestamp, line] = item;
          const style = levels.find((lvl) => line.startsWith(lvl.name))?.styles;
          return (
            <Text style={style}>
              {timestamp} {line}
            </Text>
          );
        }}
      />
    </SafeAreaView>
  );
}
