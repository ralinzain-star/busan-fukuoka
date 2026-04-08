export const MapBackground: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: '#f5f0e8',
      backgroundImage: `
        radial-gradient(circle at 20% 80%, rgba(200,180,160,0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(180,200,180,0.1) 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, rgba(210,195,175,0.08) 0%, transparent 70%)
      `,
      zIndex: 0,
    }}
  >
    {/* Subtle paper texture via noise */}
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.03 }}>
      <filter id="noise">
        <feTurbulence baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </div>
);
