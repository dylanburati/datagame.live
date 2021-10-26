import React from 'react';
import { TouchableOpacity, View, ViewProps } from 'react-native';
import { styles } from '../styles';

export type ChipPickerProvidedProps<T> = {
  item: T;
  index: number;
};

export type ChipPickerProps<T> = {
  style?: ViewProps['style'];
  data: T[];
  disabled?: boolean;
  keySelector?: (data: T) => string;
  onPress: (props: ChipPickerProvidedProps<T>) => void;
  chipStyle?: (props: ChipPickerProvidedProps<T>) => ViewProps['style'];
  children: (props: ChipPickerProvidedProps<T>) => React.ReactElement | null;
};

export function ChipPicker<T>({
  style,
  data,
  disabled = false,
  onPress,
  chipStyle,
  keySelector,
  children,
}: ChipPickerProps<T>) {
  return (
    <View style={style}>
      {data.map((item, index) => {
        const styleModifier = chipStyle ? chipStyle({ item, index }) : [];
        const key = keySelector ? keySelector(item) : String(index);
        return (
          <TouchableOpacity
            style={[
              styles.roundedFull,
              styles.mr2,
              styles.border,
              styles.borderGray300,
              styles.p1,
              styles.px2,
              styles.flexInitial,
              styles.row,
              styleModifier,
            ]}
            disabled={disabled}
            key={key}
            onPress={() => onPress({ item, index })}
          >
            {children({
              item,
              index,
            })}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
