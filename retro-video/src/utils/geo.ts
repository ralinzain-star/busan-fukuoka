export interface POIPosition {
  x: number;
  y: number;
  name: string;
  nameLocal: string;
  cat: string;
  day: number;
  id: string;
}

interface LatLngPOI {
  lat: number;
  lng: number;
  name: string;
  nameLocal?: string;
  cat: string;
  day: number;
  id: string;
}

const PADDING = 0.08;

export function projectPOIs(
  pois: LatLngPOI[],
  canvasW: number,
  canvasH: number
): POIPosition[] {
  if (!pois.length) return [];

  const lats = pois.map((p) => p.lat);
  const lngs = pois.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const padX = canvasW * PADDING;
  const padY = canvasH * PADDING;
  const drawW = canvasW - padX * 2;
  const drawH = canvasH - padY * 2 - 40; // leave room for title

  return pois.map((p) => ({
    x: padX + ((p.lng - minLng) / lngRange) * drawW,
    y: padY + 40 + (1 - (p.lat - minLat) / latRange) * drawH, // invert Y
    name: p.name,
    nameLocal: p.nameLocal || '',
    cat: p.cat,
    day: p.day,
    id: p.id,
  }));
}
