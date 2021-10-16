import React from 'react';
import { Text, TextProps } from 'react-native';
import { styles } from '../styles';

export function indexToEmoji(index: number | undefined, width: number) {
  let styleArr: TextProps['style'] = [styles.textLg, { width }];
  let content = '';
  if (index === undefined) {
    content = '+';
    styleArr.push({ transform: [{ translateX: 3 }, { translateY: -1 }] });
  } else if (index < 20) {
    content = String.fromCharCode(0x2460 + index);
  } else if (index < 35) {
    content = String.fromCharCode(0x3251 + index);
  }

  return <Text style={styleArr}>{content}</Text>;
}
