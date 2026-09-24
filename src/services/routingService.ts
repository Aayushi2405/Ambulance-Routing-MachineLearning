import { RouteInfo } from "../types";

/**
 * Calculates compass bearing (heading angle 0-360 deg) between two lat/lng coordinates.
 */
export function calculateBearing(startLat: number, startLng: number, destLat: number, destLng: number): number {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const destLatRad = (destLat * Math.PI) / 180;
  const destLngRad = (destLng * Math.PI) / 180;

  const dLng = destLngRad - startLngRad;

  const y = Math.sin(dLng) * Math.cos(destLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(dLng);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Computes realistic traffic conditions using time-of-day peak hours or forced mode.
 */
function getTrafficConditions(forcedCondition?: 'Light' | 'Moderate' | 'Heavy'): {
  multiplier: number;
  condition: 'Light' | 'Moderate' | 'Heavy';
} {
  if (forcedCondition) {
    if (forcedCondition === 'Heavy') return { multiplier: 2.1, condition: 'Heavy' };
    if (forcedCondition === 'Moderate') return { multiplier: 1.45, condition: 'Moderate' };
    return { multiplier: 1.08, condition: 'Light' };
  }

  // Time-of-day dynamic traffic calculation
  const currentHour = new Date().getHours();
  const isMorningPeak = currentHour >= 8 && currentHour <= 10;
  const isEveningPeak = currentHour >= 17 && currentHour <= 19;
  const isMidDay = currentHour >= 11 && currentHour <= 16;

  if (isMorningPeak || isEveningPeak) {
    return { multiplier: 1.85, condition: 'Heavy' };
  } else if (isMidDay) {
    return { multiplier: 1.35, condition: 'Moderate' };
  } else {
    return { multiplier: 1.08, condition: 'Light' };
  }
}

export async function getRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  forcedCondition?: 'Light' | 'Moderate' | 'Heavy'
): Promise<RouteInfo | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=polyline&steps=true`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== "Ok" || !data.routes[0]) return null;
    
    const { multiplier, condition } = getTrafficConditions(forcedCondition);

    const route = data.routes[0];
    const steps = route.legs[0].steps.map((s: any) => ({
      instruction: s.maneuver.type + (s.maneuver.modifier ? ` ${s.maneuver.modifier}` : ''),
      distance: s.distance,
      type: s.maneuver.type,
      modifier: s.maneuver.modifier,
      location: [s.maneuver.location[1], s.maneuver.location[0]]
    }));

    return {
      distance: route.distance,
      duration: Math.round(route.duration * multiplier),
      geometry: route.geometry,
      trafficMultiplier: multiplier,
      trafficCondition: condition,
      steps
    };
  } catch (error) {
    console.error("Routing Error:", error);
    return null;
  }
}
