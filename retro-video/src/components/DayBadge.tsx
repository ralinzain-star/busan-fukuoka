import { interpolate, useCurrentFrame } from 'remotion';

export const DayBadge: React.FC<{ day: number; x: number; y: number; appearFrame: number }> = ({
  day, x, y, appearFrame,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [appearFrame, appearFrame + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (progress <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - 24,
        top: y - 28,
        background: '#222',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontFamily: "'Noto Sans TC', sans-serif",
        fontWeight: 600,
        opacity: progress,
        transform: `scale(${interpolate(progress, [0, 1], [0.5, 1])})`,
        whiteSpace: 'nowrap',
        zIndex: 5,
      }}
    >
      Day {day}
    </div>
  );
};
