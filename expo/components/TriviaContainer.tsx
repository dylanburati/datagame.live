import React from 'react';
import { View, ViewProps } from 'react-native';
import { RoomStateWithTrivia } from '../helpers/nplayerLogic';

export type TriviaContainerProps = {
  state: RoomStateWithTrivia;
  disabled: boolean;
  style: ViewProps['style'];
};

// const BoxedDisplay: React.FC<React.PropsWithChildren<{ boxed: boolean }>> = ({
//   boxed,
//   children,
// }) => {
//   return boxed ? (
//     <View
//       style={[
//         styles.m4,
//         styles.pt2,
//         styles.pb8,
//         styles.zMinusTwo,
//         styles.bgPaperDarker,
//         styles.roundedLg,
//       ]}
//     >
//       {children}
//     </View>
//   ) : (
//     <>{children}</>
//   );
// };

export function TriviaContainer({
  disabled,
  style,
  children,
}: React.PropsWithChildren<TriviaContainerProps>) {
  if (disabled) {
    return null;
  }

  return <View style={style}>{children}</View>;
}
