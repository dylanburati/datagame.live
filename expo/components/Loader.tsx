import React, { useEffect, useState, useRef } from 'react';
import { Svg, Path } from 'react-native-svg';

export type LoaderProps = {
  height?: number;
};

function stair(h: number, w: number, startFrac: number, endFrac: number) {
  const res = [];
  let offset;
  if (startFrac < 0.5) {
    const x1 = 2 * startFrac * w;
    const x2 = 2 * Math.min(endFrac, 0.5) * w;
    res.push(`l${x2 - x1},0`);
    offset = [x1, 0];
  } else {
    offset = [w, 2 * (startFrac - 0.5) * h];
  }

  if (endFrac > 0.5) {
    const y1 = 2 * Math.max(0, startFrac - 0.5) * h;
    const y2 = 2 * (endFrac - 0.5) * h;
    res.push(`l0,${y2 - y1}`);
  }

  return { offset, path: res.join(' ') };
}

function getFrame(fr: number, bottom: number, x0: number, y0: number) {
  const stairTime = 24;
  const stairWidth = 50;
  const stairHeight = 51;

  const numStairs = Math.ceil((bottom - y0) / stairHeight);
  const cycle = (fr / stairTime) % (2 * numStairs);
  const stairs = new Array(numStairs)
    .fill(0)
    .map((_, i) => i)
    .map((n) => {
      const startFrac = Math.max(n, cycle - numStairs) - n;
      if (startFrac > 1) {
        return { offset: null, path: '' };
      }
      const endFrac = Math.min(n + 1, cycle) - n;
      if (endFrac < startFrac) {
        return { offset: null, path: '' };
      }
      return stair(stairHeight, stairWidth, startFrac, endFrac);
    });
  const idx = stairs.findIndex((e) => e.offset != null);
  if (idx === -1) {
    return '';
  }
  let [x1, y1] = stairs[idx].offset as [number, number];
  x1 += x0 + idx * stairWidth;
  y1 += y0 + idx * stairHeight;
  return `M${x1},${y1} ${stairs.map((e) => e.path).join(' ')}`;
}

export function Loader({ height = 300 }) {
  const ref = useRef<number>();
  const [frame, setFrame] = useState(12);
  useEffect(() => {
    ref.current = setInterval(() => setFrame((n) => n + 1), 16) as any;

    return () => {
      clearInterval(ref.current);
    };
  }, []);

  return (
    <Svg width="100%" height={height}>
      <Path
        d={getFrame(frame + 24, height + 52, -148, 8)}
        strokeWidth={2}
        strokeLinecap="square"
        stroke="#000"
      />

      <Path
        d={getFrame(frame, height + 42, 0, -2)}
        strokeWidth={2}
        strokeLinecap="square"
        stroke="#000"
      />

      <Path
        d={getFrame(frame - 24, height + 32, 148, -12)}
        strokeWidth={2}
        strokeLinecap="square"
        stroke="#000"
      />

      <Path
        d={getFrame(frame - 48, height + 22, 296, -22)}
        strokeWidth={2}
        strokeLinecap="square"
        stroke="#000"
      />
    </Svg>
  );
}
