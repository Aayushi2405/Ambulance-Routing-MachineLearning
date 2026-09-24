import { Hospital } from "../types";

const OVERPASS_MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.be/api/interpreter",
];

// Persistent cache for deterministic hospital capacity metrics
const hospitalMetricsCache = new Map<string, { beds: number; availableBeds: number; doctorsCount: number }>();

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getHospitalMetrics(id: string): { beds: number; availableBeds: number; doctorsCount: number } {
  if (hospitalMetricsCache.has(id)) {
    return hospitalMetricsCache.get(id)!;
  }

  const seed = hashStringToInt(id);
  const totalBeds = (seed % 280) + 70; // Stable 70 to 350 beds
  const availableBeds = (seed % 24) + 2; // Stable 2 to 26 available beds
  const doctorsCount = ((seed >> 2) % 40) + 10; // Stable 10 to 50 doctors

  const metrics = { beds: totalBeds, availableBeds, doctorsCount };
  hospitalMetricsCache.set(id, metrics);
  return metrics;
}

/**
 * Generates mock hospitals if the real API fails.
 * Ensures data consistency across repeated renders.
 */
function getMockHospitals(lat: number, lng: number): Hospital[] {
  const mockDefs = [
    {
      id: "mock-1",
      name: "City General Hospital (Mock)",
      latOffset: 0.01,
      lngOffset: 0.01,
      address: "123 Emergency Way",
      type: "Tertiary Care"
    },
    {
      id: "mock-2",
      name: "St. Jude Medical Center (Mock)",
      latOffset: -0.015,
      lngOffset: 0.005,
      address: "456 Care Blvd",
      type: "Multi-Specialty"
    },
    {
      id: "mock-3",
      name: "Unity Health Institute (Mock)",
      latOffset: 0.005,
      lngOffset: -0.012,
      address: "789 Wellness St",
      type: "Trauma Level 1"
    }
  ];

  return mockDefs.map(m => {
    const metrics = getHospitalMetrics(m.id);
    return {
      id: m.id,
      name: m.name,
      lat: lat + m.latOffset,
      lng: lng + m.lngOffset,
      address: m.address,
      beds: metrics.beds,
      availableBeds: metrics.availableBeds,
      doctorsCount: metrics.doctorsCount,
      type: m.type
    };
  });
}

export async function fetchNearbyHospitals(lat: number, lng: number, radius: number = 30000): Promise<{ hospitals: Hospital[]; usedMock: boolean }> {
  const query = `[out:json][timeout:30];(node["amenity"="hospital"](around:${radius},${lat},${lng});way["amenity"="hospital"](around:${radius},${lat},${lng});relation["amenity"="hospital"](around:${radius},${lat},${lng}););out center;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const response = await fetch(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429 || response.status === 504) {
          console.info(`Mirror ${mirror} returned status ${response.status} (expected public API rate limiting)`);
        } else {
          console.warn(`Mirror ${mirror} returned status ${response.status}`);
        }
        continue;
      }

      const text = await response.text();
      
      if (text.trim().startsWith("<?xml") || text.trim().startsWith("<html") || text.trim().startsWith("<!DOCTYPE")) {
        console.info(`Mirror ${mirror} returned XML/HTML instead of JSON`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.info(`Mirror ${mirror} returned invalid JSON`);
        continue;
      }

      if (!data || !data.elements) {
        console.info(`Mirror ${mirror} returned invalid data structure`);
        continue;
      }

      const hospitals = data.elements.map((el: any) => {
        const idStr = el.id.toString();
        const metrics = getHospitalMetrics(idStr);
        return {
          id: idStr,
          name: el.tags.name || el.tags["name:en"] || "Unnamed Hospital",
          lat: el.lat || el.center.lat,
          lng: el.lon || el.center.lon,
          address: el.tags["addr:street"] ? `${el.tags["addr:street"]} ${el.tags["addr:housenumber"] || ""}` : undefined,
          beds: metrics.beds,
          availableBeds: metrics.availableBeds,
          doctorsCount: metrics.doctorsCount,
          isSpecialized: !!el.tags.speciality || !!el.tags["healthcare:speciality"],
          type: el.tags.healthcare || "Hospital"
        };
      });

      if (hospitals.length > 0) return { hospitals, usedMock: false };
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.info(`Mirror ${mirror} timed out`);
      } else {
        console.warn(`Error fetching from mirror ${mirror}:`, error.message);
      }
      continue;
    }
  }

  console.info('All Overpass mirrors failed; using mock hospital data fallback.');
  return { hospitals: getMockHospitals(lat, lng), usedMock: true };
}
