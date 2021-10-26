import React, { useMemo } from 'react';
import { Animated } from 'react-native';
import {
  GestureEvent,
  PanGestureHandler,
  PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

export type SwipeUpHandleProps = {
  onSwipe: () => void;
  threshold?: number;
};

export function SwipeUpHandle({
  onSwipe,
  threshold = 20,
  children,
}: React.PropsWithChildren<SwipeUpHandleProps>) {
  const { dragY, translateY, opacity } = useMemo(() => {
    const _dragY = new Animated.Value(0);
    const _translateY = Animated.diffClamp(_dragY, -100, 0);
    return {
      dragY: _dragY,
      translateY: _translateY,
      opacity: _translateY.interpolate({
        inputRange: [-threshold, 0],
        outputRange: [0, 1],
      }),
    };
  }, [threshold]);
  const onGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationY: dragY } }], {
        useNativeDriver: true,
        listener: (evt: GestureEvent<PanGestureHandlerEventPayload>) => {
          if (evt.nativeEvent.translationY < -threshold) {
            onSwipe();
          }
        },
      }),
    [dragY, onSwipe, threshold]
  );
  return (
    <PanGestureHandler
      activeOffsetY={[-threshold, 10]}
      onGestureEvent={onGestureEvent}
      onEnded={() => dragY.setValue(0)}
    >
      <Animated.View style={{ transform: [{ translateY }], opacity }}>
        {children}
      </Animated.View>
    </PanGestureHandler>
  );
}
