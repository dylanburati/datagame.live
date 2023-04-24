import React from 'react';
import { Text, TextProps } from 'react-native';
import { styles } from '../styles';

export function indexEncircled(index: number | undefined, width: number) {
  const styleArr: TextProps['style'] = [styles.textLg, { width }];
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

export function heart() {
  return require('../assets/emoji/black_heart_suit24.png');
}

export function paintings() {
  return [
    require('../assets/paintings/michelangelo_the_creation_of_adam.jpg'),
    require('../assets/paintings/vermeer_girl_with_a_pearl_earring.jpg'),
    require('../assets/paintings/friedrich_wandering_above_a_sea_of_fog.jpg'),
    require('../assets/paintings/hokusai_the_great_wave_off_kanagawa.png'),
    require('../assets/paintings/van_gogh_the_starry_night.jpg'),
    require('../assets/paintings/munch_the_scream.jpg'),
    require('../assets/paintings/monet_water_lilies.jpg'),
    require('../assets/paintings/dali_the_persistence_of_memory.jpg'),
  ];
}
