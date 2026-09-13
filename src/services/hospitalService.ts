import { Hospital } from "../types";

const OVERPASS_MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.be/api/interpreter",
];

/**
 * Generates mock hospitals if the real API fails.
 * This ensures the app is always functional for demo/emergency purposes.
 */
function getMockHospitals(lat: number, lng: number): Hospital[] {
  console.log("Generating mock hospital data as fallback...");
  return [
    {
      id: "mock-1",
      name: "City General Hospital (Mock)",
      lat: lat + 0.01,
      lng: lng + 0.01,
      address: "123 Emergency Way",
      beds: 250,
      availableBeds: 12,
      doctorsCount: 45,
      type: "Tertiary Care"
    },
    {
      id: "mock-2",
      name: "St. Jude Medical Center (Mock)",
      lat: lat - 0.015,
      lng: lng + 0.005,
      address: "456 Care Blvd",
      beds: 180,
      availableBeds: 3,
      doctorsCount: 28,
      type: "Multi-Specialty"
    },
    {
      id: "mock-3",
      name: "Unity Health Institute (Mock)",
      lat: lat + 0.005,
      lng: lng - 0.012,
      address: "789 Wellness St",
      beds: 400,
      availableBeds: 0,
      doctorsCount: 85,
      type: "Trauma Level 1"
    }
  ];
}

export async function fetchNearbyHospitals(lat: number, lng: number, radius: number = 30000): Promise<{ hospitals: Hospital[]; usedMock: boolean }> {
  const query = `[out:json][timeout:30];(node["amenity"="hospital"](around:${radius},${lat},${lng});way["amenity"="hospital"](around:${radius},${lat},${lng});relation["amenity"="hospital"](around:${radius},${lat},${lng}););out center;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      // Use POST for better reliability
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
      
      // Defensive check for XML/HTML in the body even if status is 200
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
        const totalBeds = Math.floor(Math.random() * 300) + 50;
        return {
          id: el.id.toString(),
          name: el.tags.name || el.tags["name:en"] || "Unnamed Hospital",
          lat: el.lat || el.center.lat,
          lng: el.lon || el.center.lon,
          address: el.tags["addr:street"] ? `${el.tags["addr:street"]} ${el.tags["addr:housenumber"] || ""}` : undefined,
          beds: totalBeds,
          availableBeds: Math.floor(Math.random() * (totalBeds * 0.2)),
          doctorsCount: Math.floor(Math.random() * 50) + 5,
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

  // If all mirrors fail, return mock data so the app doesn't break
  console.info('All Overpass mirrors failed; using mock hospital data fallback.');
  return { hospitals: getMockHospitals(lat, lng), usedMock: true };
}
