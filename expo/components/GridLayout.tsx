import React from 'react';
import { useWindowDimensions, View, ViewProps } from 'react-native';
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
  maxColumnCount?: number;
  gridMaxWidth?: number;
  horizontalInset: number;
  data: T[];
  children: (props: GridLayoutProvidedProps<T>) => React.ReactElement | null;
};

function chunk<T>(arr: T[], n: number): T[][] {
  const result = [];
  const tail = [];
  for (let i = 0; i < arr.length; i++) {
    tail.push(arr[i]);
    if (i === arr.length - 1 || (i + 1) % n === 0) {
      result.push(tail.splice(0));
    }
  }
  return result;
}

export function GridLayout<T>({
  style,
  minColumnWidth,
  maxColumnCount = 12,
  gridMaxWidth,
  data,
  horizontalInset,
  children,
}: GridLayoutProps<T>) {
  const { width: windowWidth } = useWindowDimensions();
  let containerWidth = windowWidth - horizontalInset;
  if (gridMaxWidth != null && gridMaxWidth < windowWidth) {
    containerWidth = gridMaxWidth - horizontalInset;
  }

  const denominators = intRange(maxColumnCount, 0, -1);
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
