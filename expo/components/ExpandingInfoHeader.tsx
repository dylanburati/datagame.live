import React from 'react';
import { Text, TouchableOpacity, View, ViewProps } from 'react-native';
import { styles } from '../styles';

export type ExpandingInfoHeaderProps = {
  style?: ViewProps['style'];
  infoContainerStyle?: ViewProps['style'];
  onPress: () => void;
  infoVisible: boolean;
  title: string;
};

export const defaultInfoContainerStyle = [
  styles.roundedLg,
  styles.mx4,
  styles.p4,
  styles.mb4,
  styles.bgPaperDarker,
];

export function ExpandingInfoHeader({
  style,
  infoContainerStyle,
  onPress,
  infoVisible,
  title,
  children,
}: React.PropsWithChildren<ExpandingInfoHeaderProps>) {
  style = style || [styles.row, styles.m4];
  infoContainerStyle = infoContainerStyle || defaultInfoContainerStyle;
  return (
    <>
      <View style={style}>
        <Text style={[styles.textLg, styles.fontWeightBold]}>{title}</Text>
        <TouchableOpacity
          style={[styles.bgBlue, styles.iconBtn]}
          onPress={onPress}
        >
          <Text style={[styles.textCenter, styles.textWhite]}>i</Text>
        </TouchableOpacity>
      </View>
      {infoVisible && (
        <View style={infoContainerStyle}>
          <Text>{children}</Text>
        </View>
      )}
    </>
  );
}
