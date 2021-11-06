import React from 'react';
import { Text, TextProps } from 'react-native';
import { styles } from '../styles';

export function indexEncircled(index: number | undefined, width: number) {
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

export function medals() {
  return [
    require('../assets/emoji/first_place_medal24.png'),
    require('../assets/emoji/second_place_medal24.png'),
    require('../assets/emoji/third_place_medal24.png'),
  ];
}

export function kissMarryShoot() {
  return [
    require('../assets/emoji/kiss_mark24.png'),
    require('../assets/emoji/bride_with_veil24.png'),
    require('../assets/emoji/skull24.png'),
  ];
}
