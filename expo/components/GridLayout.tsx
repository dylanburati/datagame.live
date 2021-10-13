import React from 'react';
import { View, ViewProps } from 'react-native';
import { chunk } from 'lodash';
import { useWindowWidth } from '../helpers/hooks';
import { intRange } from '../helpers/math';
import { styles } from '../styles';

export type GridLayoutProvidedProps<T> = {
  item: T;
  index: number;
  rowIndex: number;
  columnIndex: number;
  columnCount: number;
  width: number;
};

export type GridLayoutProps<T> = {
  style?: ViewProps['style'];
  minColumnWidth: number;
  horizontalInset: number;
  data: T[];
  children: (props: GridLayoutProvidedProps<T>) => React.ReactElement | null;
};

export function GridLayout<T>({
  style,
  minColumnWidth,
  data,
  horizontalInset,
  children,
}: GridLayoutProps<T>) {
  const windowWidth = useWindowWidth();
  const containerWidth = windowWidth - horizontalInset;

  const denominators = intRange(12, 0, -1);
  const columnCount =
    denominators.find((num) => containerWidth / num >= minColumnWidth) || 1;
  const width = containerWidth / columnCount;

  return (
    <View style={style}>
      {chunk(data, columnCount).map((row, rowIndex) => (
        <View style={[styles.row, styles.startAll]} key={`row${rowIndex}`}>
          {row.map((item, columnIndex) =>
            children({
              item,
              index: rowIndex * columnCount + columnIndex,
              width,
              rowIndex,
              columnIndex,
              columnCount,
            })
          )}
        </View>
      ))}
    </View>
  );
}
