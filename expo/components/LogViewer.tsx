import React, { useState, useEffect, useContext } from 'react';
import { SafeAreaView, FlatList, Text } from 'react-native';
import { useStateNoCmp } from '../helpers/hooks';
import { OrderedSet } from '../helpers/data';
import { LogLine } from '../helpers/logging';
import { ChipPicker } from './ChipPicker';
import { styles } from '../styles';
import { RestClientContext } from './RestClientProvider';

export function LogViewer() {
  const levels = [
    { name: 'INFO', styles: [] },
    { name: 'WARNING', styles: [styles.bgAmber200] },
    { name: 'ERROR', styles: [styles.textRed] },
  ];
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [included, setIncluded] = useStateNoCmp(
    OrderedSet.from(['INFO', 'WARNING', 'ERROR', 'new→old'])
  );
  const { logger } = useContext(RestClientContext);

  useEffect(() => {
    logger.readLogs().then((theLogs) => setLogs(theLogs));
  }, [logger]);

  const logsToShow = logs.filter(([_, line]) => {
    const spaceIdx = line.indexOf(' ');
    return spaceIdx > 0 && included.has(line.slice(0, spaceIdx));
  });
  if (included.has('new→old')) {
    logsToShow.reverse();
  }
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
        data={[...levels, { name: 'new→old' }]}
        keySelector={(item) => `toggle-${item.name}`}
        onPress={({ item }) => setIncluded(included.toggle(item.name))}
        chipStyle={({ item }) => [
          styles.mb1,
          styles.mr2,
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
