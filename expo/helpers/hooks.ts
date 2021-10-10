import { addOrientationChangeListener } from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import { Dimensions } from 'react-native';

export function useWindowWidth() {
  const [width, setWidth] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const subscription = addOrientationChangeListener(() => {
      const d = Dimensions.get('window');
      setWidth(d.width);
    });

    return () => {
      subscription.remove();
    };
  });

  return width;
}

export function useSet<T>(initialValue: Set<T>) {
  const set = useRef(initialValue).current;
  const [, setCounter] = useState(0);
  return {
    set,
    add: (item: T) => {
      const changed = !set.has(item);
      set.add(item);
      if (changed) {
        setCounter((n) => n + 1);
      }
    },
    clear: () => {
      const changed = set.size > 0;
      set.clear();
      if (changed) {
        setCounter((n) => n + 1);
      }
    },
  };
}
