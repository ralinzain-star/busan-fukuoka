import { interpolate, useCurrentFrame } from 'remotion';

export const CityTitle: React.FC<{ name: string; flag: string }> = ({ name, flag }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(frame, [0, 20], [-10, 0], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: "'Caveat', cursive",
        fontSize: 36,
        fontWeight: 700,
        color: '#333',
        zIndex: 10,
      }}
    >
      {flag} {name}
    </div>
  );
};
