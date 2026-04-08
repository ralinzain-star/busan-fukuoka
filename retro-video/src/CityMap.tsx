import { AbsoluteFill } from 'remotion';
import { MapBackground } from './components/MapBackground';
import { CityTitle } from './components/CityTitle';
import { POIMarker } from './components/POIMarker';
import { RouteLine } from './components/RouteLine';
import { DayBadge } from './components/DayBadge';
import type { POIPosition } from './utils/geo';

export interface CityMapProps {
  cityName: string;
  flag: string;
  pois: POIPosition[];
}

const TITLE_FRAMES = 25;
const POI_STAGGER = 12;
const HOLD_FRAMES = 90;

export function getDuration(poiCount: number): number {
  return TITLE_FRAMES + poiCount * POI_STAGGER + HOLD_FRAMES;
}

export const CityMap: React.FC<CityMapProps> = ({ cityName, flag, pois }) => {
  // Track day changes for badges
  let lastDay = -1;
  const dayBadges: { day: number; x: number; y: number; frame: number }[] = [];

  pois.forEach((p, i) => {
    if (p.day !== lastDay) {
      dayBadges.push({
        day: p.day,
        x: p.x,
        y: p.y,
        frame: TITLE_FRAMES + i * POI_STAGGER,
      });
      lastDay = p.day;
    }
  });

  const routeStartFrame = TITLE_FRAMES;
  const routeEndFrame = TITLE_FRAMES + pois.length * POI_STAGGER;

  return (
    <AbsoluteFill>
      <MapBackground />
      <CityTitle name={cityName} flag={flag} />

      <RouteLine pois={pois} startFrame={routeStartFrame} endFrame={routeEndFrame} />

      {dayBadges.map((b, i) => (
        <DayBadge key={`day-${i}`} day={b.day} x={b.x} y={b.y} appearFrame={b.frame} />
      ))}

      {pois.map((p, i) => (
        <POIMarker
          key={p.id}
          x={p.x}
          y={p.y}
          name={p.name}
          cat={p.cat}
          appearFrame={TITLE_FRAMES + i * POI_STAGGER}
          index={i}
        />
      ))}
    </AbsoluteFill>
  );
};
