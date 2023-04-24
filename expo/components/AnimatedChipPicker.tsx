import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import {
  PanGestureHandler,
  PanGestureHandlerStateChangeEvent,
  PanGestureHandlerGestureEvent,
  State as GestureState,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { isAndroid, isIOS, isWeb } from '../constants';
import { DataStatus, overwriteMap } from '../helpers/data';
import {
  FieldReference,
  useAnimatedValue as useValue,
  useReference,
} from '../helpers/hooks';
import {
  midpoint,
  Rect,
  rectAbove,
  rectBelow,
  rectCenter,
} from '../helpers/math';
import { styleConfig, styles } from '../styles';

export type AnimatedChipPickerProvidedProps<T> = {
  item: T;
  index: number;
};

export type AnimatedChipPickerProps<T> = {
  style?: ViewProps['style'];
  data: T[];
  disabled?: boolean;
  showSorted?: boolean;
  sorter?: (left: T, right: T) => number;
  keySelector: (data: T) => string;
  onDragEnd: (from: number, to: number) => void;
  chipStyle?: (props: AnimatedChipPickerProvidedProps<T>) => ViewProps['style'];
  children: (
    props: AnimatedChipPickerProvidedProps<T>
  ) => React.ReactElement | null;
};

const ZERO_ANIM = new Animated.Value(0);

type AnimContext = {
  anyActiveAnim: Animated.Value;
  touchInit: FieldReference<number>;
  touchInitAnim: Animated.Value;
  touchAbsolute: Animated.Value;
  panGestureState: FieldReference<GestureState>;
  cellLayoutChangeListener: FieldReference<{
    handleEvent(): void;
  }>;
  cellLayouts: Map<string, Rect>;
  keyToIndex: Map<string, number>;
  keyToSortedIndex: Map<string, number>;
  indexToKey: Map<number, string>;
};

function useAnimatedValues(): AnimContext {
  const anyActiveAnim = useValue(0);
  const touchInit = useReference(0);
  const touchInitAnim = useValue(0);
  const touchAbsolute = useValue(0);
  const panGestureState = useReference<GestureState>(GestureState.UNDETERMINED);
  const [cellLayouts] = useState(new Map<string, Rect>());
  const cellLayoutChangeListener = useReference({
    handleEvent: () => {},
  });
  const [keyToIndex] = useState(new Map<string, number>());
  const [keyToSortedIndex] = useState(new Map<string, number>());
  const [indexToKey] = useState(new Map<number, string>());
  return {
    anyActiveAnim,
    touchInit,
    touchInitAnim,
    touchAbsolute,
    panGestureState,
    cellLayouts,
    cellLayoutChangeListener,
    keyToIndex,
    keyToSortedIndex,
    indexToKey,
  };
}

type CellProps = React.PropsWithChildren<{
  context: AnimContext;
  cellKey: string;
  containerRef: React.RefObject<any>;
  index: number;
  activeKey: string | undefined;
  sortTranslation: Animated.Value | undefined;
  horizontalInset?: number;
}>;

function Cell({
  context,
  containerRef,
  cellKey,
  index,
  activeKey,
  sortTranslation,
  horizontalInset = styleConfig.marginPx(6),
  children,
}: CellProps) {
  const { cellLayouts, cellLayoutChangeListener, keyToIndex } = context;
  const viewRef = useRef<View>(null);
  const ownCenter = useValue(0);
  const ownWidth = useReference(0);
  const ownHeight = useReference(0);
  const activeCenter = useValue(0);
  const scale = useValue(1);
  const scaleAnimStarted = useReference(false);
  const opacity = useValue(0);
  const opacityAnimStarted = useReference(false);
  let activeHeight = 0;
  if (activeKey !== undefined && cellLayouts.has(activeKey)) {
    const rect = cellLayouts.get(activeKey) as Rect;
    activeCenter.setValue(rectCenter(rect).y);
    activeHeight = rect.height;
  }
  const updateCellMeasurements = useCallback(() => {
    if (viewRef.current && containerRef.current) {
      viewRef.current.measureLayout(
        containerRef.current,
        (x: number, y: number, width: number, height: number) => {
          const rect = { x, y, width, height };
          cellLayouts.set(cellKey, rect);
          cellLayoutChangeListener.get().handleEvent();
          ownCenter.setValue(rectCenter(rect).y);
          ownWidth.set(width);
          ownHeight.set(height);
        },
        () => {}
      );
    }
  }, [
    cellKey,
    cellLayoutChangeListener,
    cellLayouts,
    containerRef,
    ownCenter,
    ownHeight,
    ownWidth,
  ]);

  useEffect(() => {
    if (isWeb) {
      // onLayout isn't called on web when the index changes
      updateCellMeasurements();
    }
  }, [index, updateCellMeasurements]);

  let translateY: Animated.AnimatedInterpolation<number>;
  if (sortTranslation) {
    translateY = sortTranslation;
  } else if (cellKey === activeKey) {
    translateY = Animated.subtract(
      context.touchAbsolute,
      context.touchInitAnim
    );
    if (!scaleAnimStarted.get()) {
      scaleAnimStarted.set(true);
      Animated.timing(scale, {
        toValue: 1 + horizontalInset / ownWidth.get(),
        useNativeDriver: false,
        duration: 200,
        easing: Easing.bezier(0.2, 0, 0.2, 1),
      }).start();
    }
  } else {
    if (scaleAnimStarted.get()) {
      scaleAnimStarted.set(false);
      Animated.timing(scale, {
        toValue: 1,
        useNativeDriver: false,
        duration: 150,
        easing: Easing.out(Easing.bezier(0.2, 0, 0.2, 1)),
      }).start();
    }
    if (activeKey !== undefined) {
      const activeIndex = keyToIndex.get(activeKey) as number;
      const dragCenter = Animated.add(
        activeCenter,
        Animated.subtract(context.touchAbsolute, context.touchInitAnim)
      );
      const centerDist = Animated.subtract(ownCenter, dragCenter);
      const minDistToOverlap = 0.5 * ownHeight.get() + 0.5 * activeHeight;
      if (index < activeIndex) {
        translateY = centerDist.interpolate({
          inputRange: [-minDistToOverlap, 0],
          outputRange: [0, activeHeight],
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          extrapolate: 'clamp',
        });
      } else {
        translateY = centerDist.interpolate({
          inputRange: [0, minDistToOverlap],
          outputRange: [-activeHeight, 0],
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          extrapolate: 'clamp',
        });
      }
    } else {
      translateY = ZERO_ANIM;
    }
  }
  translateY = Animated.multiply(context.anyActiveAnim, translateY);

  if (!opacityAnimStarted.get()) {
    opacityAnimStarted.set(true);
    Animated.timing(opacity, {
      toValue: 1,
      useNativeDriver: false,
      duration: 200,
      easing: Easing.linear,
    }).start();
  }

  return (
    <Animated.View
      ref={viewRef}
      onLayout={updateCellMeasurements}
      style={[
        isAndroid && cellKey === activeKey && styles.elevation1,
        (isWeb || isIOS) && cellKey === activeKey && styles.z999,
      ]}
      pointerEvents={activeKey ? 'none' : 'auto'}
    >
      <Animated.View
        style={{ opacity, transform: [{ translateY }, { scale }] }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

function landingIndex(
  endY: number,
  activeIndex: number,
  layouts: Rect[]
): number {
  const active = layouts[activeIndex];
  // upward
  //   position A = [i] [active]
  //   position B = [active] [i]
  //   threshold = midpoint of center_loc(active) in A and B
  for (let i = 0; i < activeIndex; i++) {
    const rect = layouts[i];
    const center1 = rectCenter(rect);
    const center2 = rectCenter(rectBelow(active, rect));
    if (endY < midpoint(center1, center2).y) {
      return i;
    }
  }
  // downward
  for (let i = layouts.length - 1; i > activeIndex; i--) {
    const rect = layouts[i];
    const center1 = rectCenter(rect);
    const center2 = rectCenter(rectAbove(active, rect));
    if (endY > midpoint(center1, center2).y) {
      return i;
    }
  }
  return activeIndex;
}

export function AnimatedChipPicker<T>({
  style,
  data,
  disabled = false,
  showSorted = false,
  sorter,
  onDragEnd,
  chipStyle,
  keySelector,
  children,
}: AnimatedChipPickerProps<T>) {
  const [activeKey, setActiveKey] = useState<string>();
  const context = useAnimatedValues();
  const {
    anyActiveAnim,
    touchInit,
    touchInitAnim,
    touchAbsolute,
    panGestureState,
    keyToIndex,
    keyToSortedIndex,
    indexToKey,
    cellLayouts,
    cellLayoutChangeListener,
  } = context;
  const endCallbackRef = useRef(onDragEnd);
  endCallbackRef.current = onDragEnd;
  const dataRef = useRef(data);
  dataRef.current = data;
  const containerRef = useRef<View>(null);
  const [sortIdReflected, setSortIdReflected] = useState(-1);
  const [sortIdInData, onSortOrderChanged] = useReducer((n) => n + 1, 1);
  const [cellLayoutMapSize, setCellLayoutMapSize] = useState(0);
  const sortStatus =
    sortIdReflected === sortIdInData ? DataStatus.COMPLETED : DataStatus.STALE;
  useEffect(() => {
    cellLayoutChangeListener.set({
      handleEvent: () => setCellLayoutMapSize(cellLayouts.size),
    });
    return () => {
      cellLayoutChangeListener.set({
        handleEvent: () => {},
      });
    };
  }, [cellLayoutChangeListener, cellLayouts]);
  const onGestureRelease = useCallback(
    (endY: number) => {
      if (activeKey !== undefined) {
        const orderedLayouts = new Array(indexToKey.size)
          .fill(0)
          .map((_, i) => cellLayouts.get(indexToKey.get(i) || ''))
          .filter((r): r is Rect => r !== undefined);

        const activeIndex = keyToIndex.get(activeKey);
        if (
          orderedLayouts.length === indexToKey.size &&
          activeIndex !== undefined
        ) {
          const center = rectCenter(orderedLayouts[activeIndex]).y;
          const adjustedEnd = endY + center - touchInit.get();
          const toIndex = landingIndex(
            adjustedEnd,
            activeIndex,
            orderedLayouts
          );
          endCallbackRef.current(activeIndex, toIndex);
        }
      }
      setActiveKey(undefined);
      // requestAnimationFrame(() => {
      //   touchInit.set(0);
      //   touchInitAnim.setValue(0);
      //   touchAbsolute.setValue(0);
      // });
    },
    [activeKey, cellLayouts, indexToKey, keyToIndex, touchInit]
  );
  const onHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const {
        nativeEvent: { state, y },
      } = event;
      if (panGestureState.equals(state)) {
        return;
      }
      if (
        state === GestureState.BEGAN ||
        (state === GestureState.ACTIVE &&
          !panGestureState.equals(GestureState.BEGAN))
      ) {
        anyActiveAnim.setValue(1);
        touchInit.set(y);
        touchInitAnim.setValue(y);
        touchAbsolute.setValue(y);
      } else if (state === GestureState.ACTIVE) {
        touchAbsolute.setValue(y);
      } else if (
        state === GestureState.FAILED ||
        state === GestureState.CANCELLED ||
        state === GestureState.END ||
        state === GestureState.UNDETERMINED
      ) {
        anyActiveAnim.setValue(0);
        onGestureRelease(y);
      }
      panGestureState.set(state);
    },
    [
      anyActiveAnim,
      onGestureRelease,
      panGestureState,
      touchAbsolute,
      touchInit,
      touchInitAnim,
    ]
  );
  const onGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const {
        nativeEvent: { y },
      } = event;
      if (!panGestureState.equals(GestureState.ACTIVE)) {
        return;
      }
      touchAbsolute.setValue(y);
    },
    [panGestureState, touchAbsolute]
  );
  useLayoutEffect(() => {
    overwriteMap(
      keyToIndex,
      data.map((d, i) => [keySelector(d), i])
    );
    overwriteMap(
      indexToKey,
      data.map((d, i) => [i, keySelector(d)])
    );
  }, [data, indexToKey, keySelector, keyToIndex]);
  useEffect(() => {
    if (!showSorted) {
      keyToSortedIndex.clear();
    }
    if (showSorted && sorter) {
      const sorted = data.slice().sort(sorter);
      const changed =
        keyToSortedIndex.size !== data.length ||
        sorted.some((d, i) => i !== keyToSortedIndex.get(keySelector(d)));
      overwriteMap(
        keyToSortedIndex,
        sorted.map((d, i) => [keySelector(d), i])
      );
      if (changed) {
        onSortOrderChanged();
      }
    }
  }, [data, keySelector, keyToSortedIndex, showSorted, sorter]);
  const computeSortOffsets = useCallback(() => {
    const layouts = new Array(indexToKey.size)
      .fill(0)
      .map((_, i) => {
        const key = indexToKey.get(i);
        return [
          key,
          cellLayouts.get(key || ''),
          keyToSortedIndex.get(key || ''),
        ];
      })
      .filter(
        (r): r is [string, Rect, number] =>
          r[1] !== undefined && r[2] !== undefined
      );

    if (!layouts.length || layouts.length !== indexToKey.size) {
      return;
    }
    let lastYUnsorted = 0;
    for (const [_, rect] of layouts) {
      rect.y = Math.max(rect.y, lastYUnsorted);
      lastYUnsorted += rect.height;
    }
    const result = [];
    let lastY = 0;
    layouts.sort((a, b) => a[2] - b[2]);
    for (const [key, rect] of layouts) {
      result.push({ key, translateY: lastY - rect.y });
      lastY += rect.height;
    }
    return result;
  }, [cellLayouts, indexToKey, keyToSortedIndex]);
  const sortTranslations = useMemo((): Map<string, Animated.Value> => {
    if (
      !showSorted ||
      sortStatus === DataStatus.COMPLETED ||
      cellLayoutMapSize < dataRef.current.length
    ) {
      return new Map();
    }
    const offsets = computeSortOffsets();
    if (!offsets) {
      return new Map();
    }
    const nonZeroOffsets = offsets.filter((e) => e.translateY !== 0);
    if (!nonZeroOffsets.length) {
      setSortIdReflected(sortIdInData);
      return new Map();
    }
    const acc: [Animated.CompositeAnimation[], [string, Animated.Value][]] = [
      [],
      [],
    ];
    const [anims, animValues] = nonZeroOffsets.reduce(
      (
        [animLst, valLst],
        { key, translateY }
      ): [Animated.CompositeAnimation[], [string, Animated.Value][]] => {
        const val = new Animated.Value(0);
        animLst.push(
          Animated.timing(val, {
            toValue: translateY,
            useNativeDriver: false,
            duration: 400,
            easing: Easing.bezier(0.4, 0, 0.6, 1),
          })
        );
        valLst.push([key, val]);
        console.log('sortTranslation', key, translateY);
        return [animLst, valLst];
      },
      acc
    );
    anyActiveAnim.setValue(1);
    Animated.parallel(anims).start(() => {
      setSortIdReflected(sortIdInData);
      anyActiveAnim.setValue(0);
    });
    return new Map(animValues);
  }, [
    anyActiveAnim,
    cellLayoutMapSize,
    computeSortOffsets,
    showSorted,
    sortIdInData,
    sortStatus,
  ]);
  // const drag = useCallback(
  //   (n: number) => currentDragging.set(n),
  //   [currentDragging]
  // );
  let visibleData =
    showSorted && sorter && sortStatus === DataStatus.COMPLETED
      ? data.slice().sort(sorter)
      : data;
  return (
    <GestureHandlerRootView style={style}>
      <PanGestureHandler
        onHandlerStateChange={onHandlerStateChange}
        onGestureEvent={onGestureEvent}
      >
        <View ref={containerRef}>
          {visibleData.map((item, index) => {
            const styleModifier = chipStyle ? chipStyle({ item, index }) : [];
            const key = keySelector(item);
            return (
              <Cell
                cellKey={key}
                containerRef={containerRef}
                index={index}
                activeKey={activeKey}
                sortTranslation={sortTranslations.get(key)}
                context={context}
                key={key}
              >
                <TouchableOpacity
                  style={[
                    styles.roundedFull,
                    styles.border,
                    styles.borderGray300,
                    styles.p1,
                    styles.px2,
                    styles.flexInitial,
                    styles.row,
                    styleModifier,
                  ]}
                  activeOpacity={0.5}
                  disabled={disabled || showSorted}
                  onPressIn={() => setActiveKey(key)}
                  onPressOut={() => {
                    const gState = panGestureState.get();
                    if (
                      gState !== GestureState.BEGAN &&
                      gState !== GestureState.ACTIVE
                    ) {
                      setActiveKey(undefined);
                    }
                  }}
                  key={key}
                >
                  {children({
                    item,
                    index,
                  })}
                </TouchableOpacity>
              </Cell>
            );
          })}
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}
