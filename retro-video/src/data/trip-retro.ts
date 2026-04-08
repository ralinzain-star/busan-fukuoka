import tripData from '../../../data/trip.json';

export interface CityData {
  id: string;
  name: string;
  flag: string;
  pois: {
    id: string;
    lat: number;
    lng: number;
    name: string;
    nameLocal: string;
    cat: string;
    day: number;
  }[];
}

const FLAGS: Record<string, string> = { busan: '\u{1F1F0}\u{1F1F7}', aso: '\u{1F1EF}\u{1F1F5}', fukuoka: '\u{1F1EF}\u{1F1F5}' };

function getLang(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('lang') || 'zh';
}

function getFieldByLang(obj: Record<string, unknown>, field: string): string {
  const lang = getLang();
  if (lang !== 'zh') {
    const localized = obj[field + '_' + lang];
    if (localized) return String(localized);
  }
  return String(obj[field] || '');
}

export function getCityData(cityId: string): CityData | null {
  const T = tripData as any;
  const retro = T.retro;
  if (!retro) return null;

  const city = retro.cities.find((c: any) => c.id === cityId);
  if (!city) return null;

  const lang = getLang();
  const cityName = city.name[lang] || city.name.zh;

  // Map visited POI IDs to full POI data with day numbers
  const schedule = T.schedule as any[];
  const poiDayMap = new Map<string, number>();

  // Build a rough mapping: for each day, find which POIs were visited
  schedule.forEach((day: any, idx: number) => {
    const dayNum = idx + 1;
    day.events.forEach((ev: any) => {
      // Try to match event to a POI
      T.pois.forEach((p: any) => {
        const evText = (ev.name || '') + (ev.name_en || '') + (ev.restaurant || '');
        if (evText.includes(p.name) || evText.includes(p.nameLocal || '___')) {
          poiDayMap.set(p.id, dayNum);
        }
      });
    });
  });

  const pois = (city.visited_pois || [])
    .map((id: string) => {
      const p = T.pois.find((poi: any) => poi.id === id);
      if (!p) return null;
      return {
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        name: getFieldByLang(p, 'name') || p.name,
        nameLocal: p.nameLocal || '',
        cat: p.cat,
        day: poiDayMap.get(p.id) || 1,
      };
    })
    .filter(Boolean) as CityData['pois'];

  return { id: cityId, name: cityName, flag: FLAGS[cityId] || '', pois };
}

export function getAllCityIds(): string[] {
  const T = tripData as any;
  return (T.retro?.cities || []).map((c: any) => c.id);
}
