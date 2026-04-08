import { Player } from '@remotion/player';
import { useEffect, useState } from 'react';
import { CityMap, getDuration, type CityMapProps } from './CityMap';
import { getCityData, getAllCityIds } from './data/trip-retro';
import { projectPOIs } from './utils/geo';

const WIDTH = 960;
const HEIGHT = 540;
const FPS = 30;

export function App() {
  const params = new URLSearchParams(window.location.search);
  const cityId = params.get('city') || getAllCityIds()[0] || 'busan';

  const [data, setData] = useState<CityMapProps | null>(null);

  useEffect(() => {
    const cityData = getCityData(cityId);
    if (!cityData) return;

    const projected = projectPOIs(
      cityData.pois.map((p) => ({
        ...p,
        nameLocal: p.nameLocal || '',
      })),
      WIDTH,
      HEIGHT
    );

    setData({
      cityName: cityData.name,
      flag: cityData.flag,
      pois: projected,
    });
  }, [cityId]);

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#999' }}>
        Loading...
      </div>
    );
  }

  const duration = getDuration(data.pois.length);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0e8' }}>
      <Player
        component={CityMap}
        inputProps={data}
        durationInFrames={duration}
        fps={FPS}
        compositionWidth={WIDTH}
        compositionHeight={HEIGHT}
        style={{ width: '100%', maxWidth: WIDTH, aspectRatio: `${WIDTH}/${HEIGHT}` }}
        controls
        autoPlay
        loop
      />
    </div>
  );
}
