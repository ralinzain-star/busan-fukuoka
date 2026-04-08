import { interpolate, useCurrentFrame } from 'remotion';

const CAT_COLORS: Record<string, string> = {
  attraction: '#e8664a',
  food: '#4aad5b',
  cafe: '#9b6ad4',
  shopping: '#e8964a',
  transport: '#4ab8c9',
  hotel: '#4a7ce8',
  work: '#6a6ad4',
};

export const POIMarker: React.FC<{
  x: number;
  y: number;
  name: string;
  cat: string;
  appearFrame: number;
  index: number;
}> = ({ x, y, name, cat, appearFrame, index }) => {
  const frame = useCurrentFrame();
  const color = CAT_COLORS[cat] || '#888';

  const dotProgress = interpolate(frame, [appearFrame, appearFrame + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const labelProgress = interpolate(frame, [appearFrame + 5, appearFrame + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (dotProgress <= 0) return null;

  // Alternate label position to avoid overlap
  const labelSide = index % 2 === 0 ? 'right' : 'left';
  const labelOffset = labelSide === 'right' ? 14 : -14;

  return (
    <>
      {/* Circle marker */}
      <div
        style={{
          position: 'absolute',
          left: x - 6,
          top: y - 6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: color,
          border: '2px solid #fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transform: `scale(${interpolate(dotProgress, [0, 1], [0, 1])})`,
          zIndex: 10 + index,
        }}
      />
      {/* Label */}
      <div
        style={{
          position: 'absolute',
          left: labelSide === 'right' ? x + labelOffset : undefined,
          right: labelSide === 'left' ? 960 - x + 14 : undefined,
          top: y - 8,
          fontFamily: "'Caveat', cursive",
          fontSize: 13,
          color: '#444',
          opacity: labelProgress,
          whiteSpace: 'nowrap',
          zIndex: 10 + index,
          textShadow: '0 0 4px #f5f0e8, 0 0 4px #f5f0e8, 0 0 4px #f5f0e8',
        }}
      >
        {name}
      </div>
    </>
  );
};
