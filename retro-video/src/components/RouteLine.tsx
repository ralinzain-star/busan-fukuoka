import { interpolate, useCurrentFrame } from 'remotion';
import type { POIPosition } from '../utils/geo';

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
}

function pathLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

export const RouteLine: React.FC<{
  pois: POIPosition[];
  startFrame: number;
  endFrame: number;
}> = ({ pois, startFrame, endFrame }) => {
  const frame = useCurrentFrame();

  if (pois.length < 2) return null;

  const totalLen = pathLength(pois);
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const dashOffset = totalLen * (1 - progress);

  return (
    <svg
      width={960}
      height={540}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}
    >
      <path
        d={buildPath(pois)}
        fill="none"
        stroke="#888"
        strokeWidth={1.5}
        strokeDasharray={`6,6`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        opacity={0.5}
      />
    </svg>
  );
};
