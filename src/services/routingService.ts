import { RouteInfo } from "../types";

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
    
    // Determine traffic conditions
    let multiplier = 1.0;
    let condition: 'Light' | 'Moderate' | 'Heavy' = forcedCondition || 'Light';
    
    if (forcedCondition) {
      if (forcedCondition === 'Heavy') multiplier = 2.0;
      else if (forcedCondition === 'Moderate') multiplier = 1.4;
      else multiplier = 1.05;
    } else {
      const trafficRands = Math.random();
      if (trafficRands > 0.8) {
        multiplier = 1.8 + Math.random() * 0.4;
        condition = 'Heavy';
      } else if (trafficRands > 0.4) {
        multiplier = 1.3 + Math.random() * 0.3;
        condition = 'Moderate';
      } else {
        multiplier = 1.0 + Math.random() * 0.15;
        condition = 'Light';
      }
    }

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
