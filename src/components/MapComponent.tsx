import React, { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import { Hospital, AmbulanceState, RouteInfo } from "../types";
import polyline from "@mapbox/polyline";

// Fix Leaflet marker icons
import "leaflet/dist/leaflet.css";

const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const createAmbulanceIcon = (heading: number) => L.divIcon({
  html: `<div class="bg-red-600 p-1.5 rounded-lg border-2 border-white shadow-xl transform transition-all duration-300 hover:scale-110" style="transform: rotate(${heading}deg);">
           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
             <path d="M15 18h6a2 2 0 0 0 2-2v-2.5a.5.5 0 0 0-.5-.5H15z"></path>
             <circle cx="7" cy="18" r="2"></circle>
             <circle cx="17" cy="18" r="2"></circle>
             <path d="M10 10l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path>
           </svg>
         </div>`,
  className: "custom-div-icon",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const hospitalIcon = L.divIcon({
  html: `<div class="bg-blue-600 p-1.5 rounded-lg border-2 border-white shadow-lg hover:bg-blue-700 transition-colors">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M12 6v12M8 12h8M5 14h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2z"></path>
             <path d="M2 21h20"></path>
           </svg>
         </div>`,
  className: "custom-div-icon",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(center, { animate: true, duration: 1 });
  }, [center, map]);
  return null;
}

// Traffic legend as a Leaflet control rendered via ref
function TrafficLegend() {
  const map = useMap();

  useEffect(() => {
    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.innerHTML = `
        <div style="
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 12px;
          padding: 10px 14px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          font-family: system-ui, sans-serif;
          min-width: 130px;
        ">
          <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#6b7280;margin:0 0 8px;">Traffic</p>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:28px;height:5px;border-radius:99px;background:#22c55e;"></div>
              <span style="font-size:10px;font-weight:700;color:#374151;">Free Flow</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:28px;height:5px;border-radius:99px;background:#f97316;"></div>
              <span style="font-size:10px;font-weight:700;color:#374151;">Moderate</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:28px;height:5px;border-radius:99px;background:#ef4444;"></div>
              <span style="font-size:10px;font-weight:700;color:#374151;">Heavy</span>
            </div>
          </div>
        </div>
      `;
      return div;
    };
    legend.addTo(map);
    return () => {
      legend.remove();
    };
  }, [map]);

  return null;
}

interface MapProps {
  ambulances: AmbulanceState[];
  currentAmbulanceId: string | null;
  hospitals: Hospital[];
  selectedHospital: Hospital | null;
  route: RouteInfo | null;
  onHospitalSelect: (h: Hospital) => void;
  onLocationChange?: (lat: number, lng: number) => void;
}

/** 
 * Given a traffic condition and a segment index (for variation), return an RGB hex color.
 * Each segment gets slightly varied coloring for a realistic road traffic look.
 */
function getSegmentColor(trafficCondition: string | undefined, segIndex: number, totalSegs: number): string {
  const rand = Math.sin(segIndex * 137.508) * 0.5 + 0.5; // deterministic pseudo-random per segment

  if (!trafficCondition || trafficCondition === 'Light') {
    // Mostly green, occasional yellow-green flicker
    return rand < 0.15 ? "#84cc16" : "#22c55e";
  }

  if (trafficCondition === 'Heavy') {
    // Mostly red, some orange for dramatic effect
    if (rand < 0.35) return "#f97316"; // orange
    return "#ef4444"; // red
  }

  if (trafficCondition === 'Moderate') {
    // Mix of orange and green, leaning orange in middle
    const midRatio = 1 - Math.abs((segIndex / totalSegs) - 0.5) * 2; // peaks at 1 in the middle
    if (rand < 0.3) return "#22c55e"; // green
    if (midRatio > 0.5 && rand > 0.5) return "#ef4444"; // occasional red
    return "#f97316"; // orange dominant
  }

  // Dynamic/unknown – a pleasant gradient from green to yellow to red across the path
  const ratio = segIndex / Math.max(totalSegs - 1, 1);
  if (ratio < 0.33) return "#22c55e";
  if (ratio < 0.66) return "#f97316";
  return "#ef4444";
}

export default function MapComponent({ ambulances, currentAmbulanceId, hospitals, selectedHospital, route, onHospitalSelect, onLocationChange }: MapProps) {
  const [decodedPath, setDecodedPath] = useState<[number, number][]>([]);

  useEffect(() => {
    if (route?.geometry) {
      try {
        const points = polyline.decode(route.geometry);
        if (Array.isArray(points) && points.length > 0) {
          setDecodedPath(points as [number, number][]);
        } else {
          setDecodedPath([]);
        }
      } catch (err) {
        console.warn("Failed to decode route geometry polyline:", err);
        setDecodedPath([]);
      }
    } else {
      setDecodedPath([]);
    }
  }, [route]);

  const currentAmbulance = ambulances.find(a => a.id === currentAmbulanceId) || ambulances[0];

  /**
   * Split the decoded route path into individual road segments (each segment = 2 consecutive points).
   * Each segment independently gets a traffic color for a realistic per-road-link look.
   */
  const trafficSegments = useMemo(() => {
    if (decodedPath.length < 2 || !route) return [];

    const segments: { positions: [number, number][]; color: string; weight: number }[] = [];
    const total = decodedPath.length - 1;

    for (let i = 0; i < total; i++) {
      const color = getSegmentColor(route.trafficCondition, i, total);
      segments.push({
        positions: [decodedPath[i], decodedPath[i + 1]],
        color,
        weight: 7,
      });
    }
    return segments;
  }, [decodedPath, route]);

  return (
    <MapContainer
      center={currentAmbulance ? [currentAmbulance.lat, currentAmbulance.lng] : [18.20278, 83.68889]}
      zoom={17}
      className="w-full h-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {currentAmbulance && <MapUpdater center={[currentAmbulance.lat, currentAmbulance.lng]} />}

      {/* Always-visible traffic legend */}
      <TrafficLegend />

      {/* Ambulance Markers */}
      {ambulances.map((amb) => {
        const isMe = amb.id === currentAmbulanceId;
        return (
          <Marker
            key={amb.id}
            position={[amb.lat, amb.lng]}
            icon={createAmbulanceIcon(amb.heading || 0)}
            draggable={isMe}
            eventHandlers={isMe && onLocationChange ? {
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                onLocationChange(position.lat, position.lng);
              }
            } : undefined}
          >
            <Popup>
              <div className="p-1">
                <p className="font-bold text-xs">Ambulance ID: {amb.id.slice(0, 6)}</p>
                {isMe && <p className="text-[10px] text-green-600 font-bold">(You) - Drag to adjust location</p>}
                <p className="text-[10px] text-gray-500">
                  Last update: {amb.lastUpdate ? new Date(amb.lastUpdate).toLocaleTimeString() : 'Just now'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Hospital Markers */}
      {hospitals.map((h) => (
        <Marker
          key={h.id}
          position={[h.lat, h.lng]}
          icon={hospitalIcon}
          eventHandlers={{
            click: () => onHospitalSelect(h),
          }}
        >
          <Popup>
            <div className="p-1">
              <h3 className="font-bold text-sm">{h.name}</h3>
              <p className="text-xs text-gray-600">{h.address}</p>
              <button
                onClick={() => onHospitalSelect(h)}
                className="mt-2 w-full bg-blue-600 text-white text-[10px] py-1 rounded hover:bg-blue-700 transition-colors"
              >
                Set Destination
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Shadow/outline pass for the full route – dark grey underneath for contrast */}
      {decodedPath.length >= 2 && route && (
        <Polyline
          positions={decodedPath}
          color="#1e293b"
          weight={10}
          opacity={0.35}
        />
      )}

      {/* Per-segment traffic-colored road polylines */}
      {trafficSegments.map((seg, idx) => (
        <Polyline
          key={idx}
          positions={seg.positions}
          color={seg.color}
          weight={seg.weight}
          opacity={0.92}
          lineCap="round"
          lineJoin="round"
        />
      ))}

      {/* Navigation Turn Markers */}
      {route?.steps && route.steps.slice(0, 5).map((step, idx) => (
        <Marker
          key={`step-${idx}`}
          position={step.location}
          icon={L.divIcon({
            html: `<div class="bg-white p-1 rounded-full border-2 border-blue-500 shadow-md ${idx === 0 ? 'scale-125' : 'scale-90 opacity-60'}">
                     <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M15 18l-6-6 6-6"/>
                     </svg>
                   </div>`,
            className: "custom-div-icon",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })}
        >
          <Popup>
            <div className="p-1">
              <p className="font-bold text-[10px] text-blue-600 uppercase tracking-tighter">Next Turn</p>
              <p className="text-xs font-bold leading-tight mt-0.5">{step.instruction.replace(/-/g, ' ')}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
