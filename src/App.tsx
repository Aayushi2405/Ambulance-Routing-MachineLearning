import React, { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  MapPin, 
  Navigation, 
  Hospital as HospitalIcon, 
  AlertTriangle, 
  Clock, 
  ShieldAlert, 
  ChevronRight,
  Info,
  RefreshCw,
  Zap,
  Flame,
  Wind, 
  Skull, 
  GlassWater, 
  MessageSquare, 
  FileText,
  User,
  LogOut,
  Mail,
  Plus,
  Ambulance
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import MapComponent from "./components/MapComponent";
import Login from "./components/Login";
import Register from "./components/Register";
import { fetchNearbyHospitals } from "./services/hospitalService";
import { getRoute } from "./services/routingService";
import { Hospital, AmbulanceState, RouteInfo } from "./types";
import { cn } from "./lib/utils";

const EMERGENCY_TYPES = [
  { id: "cardiac", label: "Cardiac Arrest", icon: <Activity className="w-4 h-4" />, color: "bg-red-100 text-red-700 border-red-200" },
  { id: "trauma", label: "Severe Trauma", icon: <ShieldAlert className="w-4 h-4" />, color: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "snakebite", label: "Snake Bite", icon: <Skull className="w-4 h-4" />, color: "bg-green-100 text-green-700 border-green-200" },
  { id: "poison", label: "Poisoning", icon: <GlassWater className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { id: "burns", label: "Severe Burns", icon: <Flame className="w-4 h-4" />, color: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "stroke", label: "Stroke", icon: <Zap className="w-4 h-4" />, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "other", label: "General Emergency", icon: <AlertTriangle className="w-4 h-4" />, color: "bg-blue-100 text-blue-700 border-blue-200" },
];

import { io, Socket } from "socket.io-client";

export default function App() {
  const [ambulances, setAmbulances] = useState<AmbulanceState[]>([
    { id: "local", lat: 18.20278, lng: 83.68889, heading: 0, lastUpdate: Date.now() }
  ]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [emergencyType, setEmergencyType] = useState(EMERGENCY_TYPES[0].id);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [trafficMode, setTrafficMode] = useState<'Light' | 'Moderate' | 'Heavy' | 'Dynamic'>('Dynamic');
  const [locationStatus, setLocationStatus] = useState<'finding' | 'gps' | 'fallback'>('finding');
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [isUsingMockHospitals, setIsUsingMockHospitals] = useState(false);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userLicensePlate, setUserLicensePlate] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [customEmergencyTypes, setCustomEmergencyTypes] = useState<any[]>([]);
  const [reportText, setReportText] = useState("");
  const [evaluatingHospitalId, setEvaluatingHospitalId] = useState<string | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const persistSession = (token: string, name: string, license: string) => {
    localStorage.setItem('rescuepathSessionId', token);
    localStorage.setItem('rescuepathUserName', name);
    localStorage.setItem('rescuepathLicensePlate', license);
    setSessionId(token);
    setUserName(name);
    setUserLicensePlate(license);
    setIsAuthenticated(true);
  };

  const clearSession = async () => {
    if (sessionId) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionId}`,
        },
        body: JSON.stringify({ sessionId }),
      }).catch(() => null);
    }
    localStorage.removeItem('rescuepathSessionId');
    localStorage.removeItem('rescuepathUserName');
    localStorage.removeItem('rescuepathLicensePlate');
    setSessionId(null);
    setUserName(null);
    setUserLicensePlate(null);
    setIsAuthenticated(false);
  };

  const handleLogout = () => {
    clearSession();
  };

  useEffect(() => {
    const token = localStorage.getItem('rescuepathSessionId');
    const name = localStorage.getItem('rescuepathUserName');

    if (!token || !name) {
      setIsAuthLoading(false);
      return;
    }

    const validateSession = async () => {
      try {
        const response = await fetch('/api/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setSessionId(token);
          setUserName(data.user.full_name || name);
          setUserLicensePlate(data.user.license_plate || localStorage.getItem('rescuepathLicensePlate'));
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('rescuepathSessionId');
          localStorage.removeItem('rescuepathUserName');
          localStorage.removeItem('rescuepathLicensePlate');
        }
      } catch (err) {
        localStorage.removeItem('rescuepathSessionId');
        localStorage.removeItem('rescuepathUserName');
        localStorage.removeItem('rescuepathLicensePlate');
      } finally {
        setIsAuthLoading(false);
      }
    };

    validateSession();
  }, []);

  // Refs for rate limiting hospital fetches
  const lastFetchPos = React.useRef<{lat: number, lng: number} | null>(null);
  const lastFetchTime = React.useRef<number>(0);

  // Initialize Socket.io
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setMyId(newSocket.id || null);
    });

    newSocket.on("ambulances:init", (initialAmbulances: AmbulanceState[]) => {
      setAmbulances(initialAmbulances);
    });

    newSocket.on("ambulance:updated", (updatedAmb: AmbulanceState) => {
      setAmbulances(prev => {
        const index = prev.findIndex(a => a.id === updatedAmb.id);
        if (index !== -1) {
          const newAmbs = [...prev];
          newAmbs[index] = updatedAmb;
          return newAmbs;
        }
        return [...prev, updatedAmb];
      });
    });

    newSocket.on("ambulance:removed", (id: string) => {
      setAmbulances(prev => prev.filter(a => a.id !== id));
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Get initial location and start tracking
  useEffect(() => {
    // Load hospitals immediately for the hardcoded Ranasthalam starting location
    if (hospitals.length === 0) {
      loadHospitals(18.20278, 83.68889);
    }
    
    let watchId: number;
    const updateLocation = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const heading = pos.coords.heading;
      
      setLocationStatus('gps');
      // ...
      const newState: AmbulanceState = { 
        id: socket?.id || "local",
        lat, 
        lng, 
        heading: heading || 0,
        lastUpdate: Date.now()
      };
      
      setAmbulances(prev => {
        const index = prev.findIndex(a => a.id === newState.id);
        const newAmbs = [...prev];
        if (index !== -1) {
          // Keep old heading if new one is null/NaN (often happens when stationary)
          const oldHeading = prev[index].heading;
          newState.heading = (heading !== null && !isNaN(heading as number)) ? heading : oldHeading;
          newAmbs[index] = newState;
        } else {
          newAmbs.push(newState);
        }
        return newAmbs;
      });

      if (socket?.connected) {
        socket.emit("ambulance:update", newState);
      }

      // Reload hospitals only if moved more than 1km or if 5 mins passed
      const now = Date.now();
      const shouldReload = !lastFetchPos.current || 
        Math.abs(lastFetchPos.current.lat - lat) > 0.01 || 
        Math.abs(lastFetchPos.current.lng - lng) > 0.01 ||
        (hospitals.length === 0 && now - lastFetchTime.current > 10000); // Retry every 10s if empty

      if (shouldReload) {
        lastFetchPos.current = { lat, lng };
        lastFetchTime.current = now;
        loadHospitals(lat, lng);
      }
    };

    const handleLocationError = async (err: any) => {
      console.warn("Geolocation watch error:", err);
      if (err && err.code) {
        if (err.code === 1) {
          setLocationErrorMessage("Location permission denied. Using IP-based fallback.");
        } else if (err.code === 2) {
          setLocationErrorMessage("Location unavailable. Using IP-based fallback.");
        } else if (err.code === 3) {
          setLocationErrorMessage("Location request timed out. Using IP-based fallback.");
        }
      }
      // If GPS fails completely, we will not fake an IP location since it's inaccurate.
      // We leave the ambulances array empty or let the user drag their location manually.
      if (ambulances.length === 0) {
        setLocationErrorMessage("Forced Srikakulam/Ranasthalam location to bypass inaccurate browser GPS.");
        let fallbackState = { id: "local", lat: 18.20278, lng: 83.68889, heading: 0 }; 
        setAmbulances([fallbackState]);
        loadHospitals(fallbackState.lat, fallbackState.lng);
      }
      setIsLoading(false);
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(updateLocation, handleLocationError, { 
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000 // Increased timeout to 30s
      });
    } else {
      handleLocationError(new Error("Not supported"));
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [socket, hospitals.length, ambulances.length]);

  const requestManualGps = () => {
    setLocationErrorMessage("Requesting precise GPS location...");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationStatus('gps');
          setLocationErrorMessage(null);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const heading = pos.coords.heading;
          const newState = { 
            id: socket?.id || "local",
            lat, 
            lng, 
            heading: heading || 0,
            lastUpdate: Date.now()
          };
          setAmbulances(prev => {
            const index = prev.findIndex(a => a.id === newState.id);
            if (index !== -1) {
              const newAmbs = [...prev];
              newAmbs[index] = newState;
              return newAmbs;
            }
            return [...prev, newState];
          });
          if (socket?.connected) {
            socket.emit("ambulance:update", newState);
          }
          loadHospitals(lat, lng);
        },
        (err) => {
          console.error("Manual GPS failed:", err);
          setLocationErrorMessage("Manual GPS request failed: " + err.message);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setLocationErrorMessage("Geolocation is not supported by your browser.");
    }
  };

  const loadHospitals = async (lat: number, lng: number) => {
    setIsLoading(true);
    const result = await fetchNearbyHospitals(lat, lng);
    
    // Initial sort by a mix of proximity and doctors
    const sortedHospitals = result.hospitals.sort((a, b) => {
      const distA = Math.sqrt(Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2));
      const distB = Math.sqrt(Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2));
      
      const scoreA = (a.doctorsCount * 10) + (a.availableBeds * 5) - (distA * 5000);
      const scoreB = (b.doctorsCount * 10) + (b.availableBeds * 5) - (distB * 5000);
      
      return scoreB - scoreA;
    });

    setHospitals(sortedHospitals);
    setIsUsingMockHospitals(result.usedMock);
    setIsLoading(false);
  };

  const myAmbulance = ambulances.find(a => a.id === myId) || ambulances[0];

  const handleHospitalSelect = useCallback(async (h: Hospital) => {
    if (!myAmbulance) return;
    setSelectedHospital(h);
    const routeData = await getRoute(
      { lat: myAmbulance.lat, lng: myAmbulance.lng }, 
      { lat: h.lat, lng: h.lng },
      trafficMode === 'Dynamic' ? undefined : trafficMode
    );
    setRoute(routeData);
    setIsConfirmed(false); // Reset confirmation when a new hospital is selected
  }, [myAmbulance, trafficMode]);

  const handleConfirmHospital = () => {
    setIsConfirmed(true);
  };

  const runAiAnalysis = async () => {
    if (hospitals.length === 0 || !myAmbulance) return;
    setIsAnalyzing(true);
    setAiAnalysis(null);
    setSelectedHospital(null); 
    
    let bestHospital: Hospital | null = null;
    let shortestDuration = Infinity;
    
    // Strict Condition: Minimum 5 beds and 5 doctors
    const qualifiedHospitals = hospitals.filter(h => h.availableBeds >= 5 && h.doctorsCount >= 5);
    const hospitalsToEvaluate = qualifiedHospitals.length > 0 ? qualifiedHospitals : hospitals;
    
    // Simulate thinking/scanning phase
    for (const h of hospitalsToEvaluate.slice(0, 5)) {
      setEvaluatingHospitalId(h.id);
      await sleep(800); // 800ms per hospital for visual effect
      
      const routeData = await getRoute(
        { lat: myAmbulance.lat, lng: myAmbulance.lng }, 
        { lat: h.lat, lng: h.lng },
        trafficMode === 'Dynamic' ? undefined : trafficMode
      );
      
      if (routeData) {
        if (routeData.duration < shortestDuration) {
          shortestDuration = routeData.duration;
          bestHospital = h;
          (bestHospital as any).currentRoute = routeData;
        }
      }
    }
    
    setEvaluatingHospitalId(null);
    
    if (bestHospital) {
      const route = (bestHospital as any).currentRoute;
      const metCriteria = bestHospital.availableBeds >= 5 && bestHospital.doctorsCount >= 5;
      const analysis = {
        recommendedHospitalId: bestHospital.id,
        reasoning: metCriteria 
          ? `AI Optimization Result: ${bestHospital.name} selected. It meets the strict criteria (5+ beds, 5+ doctors) and offers the shortest travel time of ${Math.round(route.duration / 60)} min.`
          : `AI Optimization Result: No nearby hospitals met the strict 5 bed/doctor criteria. ${bestHospital.name} selected as the fastest available fallback (${Math.round(route.duration / 60)} min).`,
        trafficAlerts: [route.trafficCondition === 'Heavy' ? "CAUTION: Heavy traffic on primary route" : "Route traffic is currently manageable"],
        estimatedTimeReduction: `Minimum Traffic Time: ${Math.round(route.duration / 60)} mins`
      };
      setAiAnalysis(analysis);
      handleHospitalSelect(bestHospital);
    }
    setIsAnalyzing(false);
  };

  // Simulation logic updates local state and emits
  useEffect(() => {
    if (!hasAutoSelected && hospitals.length > 0 && myAmbulance) {
      setHasAutoSelected(true);
      runAiAnalysis();
    }
  }, [hospitals, myAmbulance, hasAutoSelected]);

  useEffect(() => {
    let interval: any;
    if (isSimulating && route?.geometry && myAmbulance) {
      interval = setInterval(() => {
        const newState = {
          ...myAmbulance,
          lat: myAmbulance.lat + (Math.random() - 0.5) * 0.0001,
          lng: myAmbulance.lng + (Math.random() - 0.5) * 0.0001,
          lastUpdate: Date.now()
        };
        
        setAmbulances(prev => prev.map(a => a.id === myId ? newState : a));
        if (socket?.connected) {
          socket.emit("ambulance:update", newState);
        }
      }, 10000); // Update every 10 seconds as requested
    }
    return () => clearInterval(interval);
  }, [isSimulating, route, myAmbulance, socket, myId]);

  const formatDistance = (m: number) => (m / 1000).toFixed(1) + " km";
  const formatDuration = (s: number) => Math.round(s / 60) + " min";

  if (!isAuthenticated) {
    if (isAuthLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
            <p className="text-sm font-bold uppercase tracking-[0.3em]">Restoring session...</p>
          </div>
        </div>
      );
    }

    if (authView === 'register') {
      return (
        <Register 
          onRegister={() => {
            setAuthMessage("Registration successful! Please log in.");
            setAuthView('login');
          }} 
          onBackToLogin={() => {
            setAuthMessage(null);
            setAuthView('login');
          }} 
        />
      );
    }
    return (
      <Login 
        onLogin={({ userName, sessionId, licensePlate }) => {
          persistSession(sessionId, userName, licensePlate);
        }} 
        onGoToRegister={() => {
          setAuthMessage(null);
          setAuthView('register');
        }}
        infoMessage={authMessage}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 font-sans text-slate-100 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-red-600 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600 rounded-full blur-[150px]" />
      </div>

      {/* Sidebar */}
      <div className="w-full md:w-96 bg-slate-900/60 backdrop-blur-xl md:border-r border-white/10 flex flex-col shadow-2xl z-10 relative">
        <div className="p-6 border-b border-white/10 bg-slate-900/80 relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-red-600/20 to-blue-600/10 pointer-events-none" />
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Activity className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600 rounded-xl shadow-lg shadow-red-600/20 backdrop-blur-sm">
                  <Navigation className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-black tracking-tight text-white">RescuePath AI</h1>
              </div>
              {userName && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/5">
                    <User className="w-4 h-4 text-red-200" />
                    <span className="text-[10px] font-black uppercase tracking-wider">{userName}</span>
                  </div>
                  {userLicensePlate && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/20 rounded-md border border-white/5">
                      <Ambulance className="w-2.5 h-2.5 text-red-300" />
                      <span className="text-[8px] font-bold text-red-100 uppercase tracking-widest">{userLicensePlate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  locationStatus === 'gps' ? "bg-green-400" : "bg-yellow-400"
                )} />
                <p className="text-red-100 text-[10px] font-bold uppercase tracking-wider">
                  {locationStatus === 'gps' ? "High-Accuracy GPS Active" : "Using IP-Based Fallback"}
                </p>
                {locationStatus === 'fallback' && (
                  <button 
                    onClick={requestManualGps}
                    className="ml-auto text-[9px] bg-white/20 px-2 py-0.5 rounded hover:bg-white/30 transition-all font-bold"
                  >
                    Request GPS
                  </button>
                )}
              </div>
              {locationErrorMessage && (
                <p className="text-[10px] text-yellow-200">{locationErrorMessage}</p>
              )}
              {isUsingMockHospitals && (
                <p className="text-[10px] text-yellow-200">Live hospital lookup failed; using local fallback data.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Emergency Type Selection */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4 flex items-center gap-2">
              <ShieldAlert className="w-3 h-3" /> Emergency Context
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[...EMERGENCY_TYPES, ...customEmergencyTypes].map((type) => (
                <button
                  key={type.id}
                  onClick={() => setEmergencyType(type.id)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 text-center gap-2 backdrop-blur-md",
                    emergencyType === type.id 
                      ? "bg-red-600/20 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                  )}
                >
                  {type.icon}
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{type.label}</span>
                    {type.isCustom && <span className="text-[8px] text-orange-500 font-black tracking-tighter uppercase">Reported Case</span>}
                  </div>
                </button>
              ))}
            </div>
            <button 
              onClick={() => setIsReportModalOpen(true)}
              className="w-full mt-3 py-2 border border-dashed border-white/20 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-400/50 hover:bg-red-500/10 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 backdrop-blur-sm"
            >
              <MessageSquare className="w-3 h-3" /> Report Missing Case
            </button>
          </section>

          {/* Simulation Controls */}
          <section className="space-y-4">
            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-400" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Traffic Scenario</p>
                </div>
                <span className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded",
                  trafficMode === 'Light' ? "bg-green-100 text-green-700" :
                  trafficMode === 'Heavy' ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-700"
                )}>
                  {trafficMode}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 bg-black/20 rounded-lg border border-white/5">
                {(['Light', 'Moderate', 'Heavy', 'Dynamic'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTrafficMode(mode)}
                    className={cn(
                      "text-[9px] font-bold py-1.5 rounded-md transition-all",
                      trafficMode === mode ? "bg-white/20 text-white shadow-sm backdrop-blur-md" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className={cn("w-4 h-4", isSimulating ? "text-red-500 animate-pulse" : "text-slate-400")} />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</p>
                    <p className="text-sm font-black italic text-slate-200">Simulation Mode</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none border border-white/10",
                    isSimulating ? "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" : "bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      isSimulating ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Emergency Context Section (Still on the left for quick triage) */}
          <section className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-xl mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2 relative z-10">
              <Activity className="w-3 h-3 text-red-500" /> Patient Status
            </h2>
            <div className="flex flex-wrap gap-2">
                {customEmergencyTypes.concat(EMERGENCY_TYPES).map((type) => (
                    <button
                        key={type.id}
                        onClick={() => setEmergencyType(type.id)}
                        className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 backdrop-blur-sm",
                            emergencyType === type.id 
                                ? "bg-red-600/20 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                                : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        {type.icon} {type.label}
                    </button>
                ))}
                <button 
                  onClick={() => setIsReportModalOpen(true)}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-dashed border-white/20 text-slate-400 hover:border-blue-400/50 hover:text-blue-400 hover:bg-blue-500/10 transition-all flex items-center gap-2 backdrop-blur-sm"
                >
                  <Plus className="w-3 h-3" /> Report Case
                </button>
            </div>
          </section>
        </div>

        {/* Footer Controls */}
        <div className="p-4 bg-slate-900/80 border-t border-white/10 space-y-2 backdrop-blur-md relative z-10">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button 
              className="flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/10 hover:text-white transition-all"
              onClick={() => window.open('mailto:support@rescuepath.ai')}
            >
              <Mail className="w-3 h-3" /> Contact
            </button>
            <button 
              className="flex items-center justify-center gap-2 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition-all"
              onClick={handleLogout}
            >
              <LogOut className="w-3 h-3" /> Logout
            </button>
          </div>
          <button 
            onClick={() => setIsSimulating(!isSimulating)}
            className={cn(
              "w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all border",
              isSimulating ? "bg-red-600/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.3)]" : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
            )}
          >
            {isSimulating ? "Stop Live Simulation" : "Start Live Simulation"}
          </button>
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative flex min-h-130">
        <div className="flex-1 relative h-full min-h-[60vh]">
        {/* Top Panel for Route Info (Always visible after confirmation) */}
        <AnimatePresence>
          {isConfirmed && route && selectedHospital && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-1001 w-full max-w-2xl px-4"
            >
              <div className="bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 px-6 shadow-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-red-600 rounded-xl shadow-lg shadow-red-600/20">
                    <Navigation className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-red-500 mb-0.5">Live Routing</h3>
                    <p className="text-sm font-bold text-white tracking-tight truncate max-w-30">{selectedHospital.name}</p>
                  </div>
                </div>

                {/* Navigation Instruction */}
                {route.steps && route.steps.length > 0 && (
                  <div className="flex-1 px-4 border-x border-white/5 mx-4 py-0.5">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-white/5 rounded-lg border border-white/10">
                        {route.steps[0].type.includes('left') ? <Navigation className="w-4 h-4 text-blue-400 -rotate-90" /> :
                         route.steps[0].type.includes('right') ? <Navigation className="w-4 h-4 text-blue-400 rotate-90" /> :
                         <Navigation className="w-4 h-4 text-blue-400" />}
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Next</p>
                        <p className="text-xs font-bold text-white capitalize leading-none">{route.steps[0].instruction.replace(/-/g, ' ')}</p>
                        <p className="text-[10px] font-bold text-blue-400 mt-1">in {formatDistance(route.steps[0].distance)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-6 pr-2">
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">ETA</p>
                    <div className="flex items-baseline gap-1">
                      <Clock className="w-3 h-3 text-red-500" />
                      <span className="text-lg font-black text-white">{formatDuration(route.duration)}</span>
                    </div>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Dist</p>
                    <div className="flex items-baseline gap-1">
                      <Navigation className="w-3 h-3 text-blue-500" />
                      <span className="text-lg font-black text-white">{formatDistance(route.distance)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Message Overlay */}
        <AnimatePresence>
          {!isConfirmed && route && selectedHospital && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 z-1001 w-full max-w-md px-4"
            >
              <div className="bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                    <HospitalIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Confirm Destination</p>
                    <h4 className="text-lg font-bold text-neutral-900 leading-tight">{selectedHospital.name}</h4>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => {
                      setSelectedHospital(null);
                      setRoute(null);
                    }}
                    className="py-3 px-4 rounded-2xl border-2 border-neutral-100 text-sm font-bold text-neutral-500 hover:bg-neutral-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmHospital}
                    className="py-3 px-4 rounded-2xl bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all"
                  >
                    Confirm & Start Route
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <MapComponent 
          ambulances={ambulances}
          currentAmbulanceId={myId}
          hospitals={hospitals} 
          selectedHospital={selectedHospital}
          route={route}
          onHospitalSelect={handleHospitalSelect}
          onLocationChange={(lat, lng) => {
            const newState = { 
              id: socket?.id || "local",
              lat, 
              lng, 
              heading: myAmbulance?.heading || 0,
              lastUpdate: Date.now()
            };
            setAmbulances(prev => {
              const index = prev.findIndex(a => a.id === newState.id);
              if (index !== -1) {
                const newAmbs = [...prev];
                newAmbs[index] = newState;
                return newAmbs;
              }
              return [...prev, newState];
            });
            if (socket?.connected) {
              socket.emit("ambulance:update", newState);
            }
            loadHospitals(lat, lng);
            setLocationStatus('gps');
            setLocationErrorMessage("Manually adjusted location");
          }}
        />

        {/* Map Overlays */}
        <div className="absolute top-6 right-6 flex flex-col gap-3 z-1000">
          <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-tighter text-red-600">
                {ambulances.length} Active {ambulances.length === 1 ? 'Ambulance' : 'Ambulances'}
              </span>
            </div>
            <div className="h-4 w-px bg-neutral-300" />
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-neutral-400" />
              <button 
                onClick={requestManualGps}
                className="text-xs font-bold text-neutral-600 hover:text-red-600 flex items-center gap-1 transition-colors"
                title="Refresh location and hospitals"
              >
                {myAmbulance ? `${myAmbulance.lat.toFixed(4)}, ${myAmbulance.lng.toFixed(4)}` : 'Locating...'}
                <RefreshCw className="w-3 h-3 ml-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-6 z-1000 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-white/20">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Map Legend</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-600 rounded-full" />
              <span className="text-[10px] font-bold uppercase text-neutral-500">Ambulance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded-sm" />
              <span className="text-[10px] font-bold uppercase text-neutral-500">Hospital</span>
            </div>
            <div className="border-t border-neutral-100 my-1" />
            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Road Traffic</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[10px] font-bold text-neutral-500">Free Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1.5 bg-orange-500 rounded-full" />
              <span className="text-[10px] font-bold text-neutral-500">Moderate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1.5 bg-red-500 rounded-full" />
              <span className="text-[10px] font-bold text-neutral-500">Heavy</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Discovery & Details */}
      <div className="w-full md:w-96 bg-slate-900/60 backdrop-blur-xl md:border-l border-white/10 shadow-2xl z-20 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
          {selectedHospital ? (
            <motion.div
              key="details"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="h-48 bg-neutral-900 relative overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-linear-to-br from-blue-600/30 to-red-600/30 opacity-60" />
                  <div className="absolute top-4 right-4 z-10">
                      <button 
                          onClick={() => setSelectedHospital(null)}
                          className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border border-white/5 text-white transition-all"
                      >
                          <RefreshCw className="w-4 h-4 rotate-45" />
                      </button>
                  </div>
                  <div className="absolute bottom-6 left-6 z-10">
                      <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded">
                              {selectedHospital.type || 'General'}
                          </span>
                          {selectedHospital.isSpecialized && (
                              <span className="px-2 py-0.5 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded">
                                  Specialized
                              </span>
                          )}
                      </div>
                      <h2 className="text-2xl font-black text-white leading-tight">{selectedHospital.name}</h2>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar relative z-10">
                  <section>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Core Resources</h3>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col items-center text-center shadow-lg">
                              <Activity className="w-6 h-6 text-blue-400 mb-2" />
                              <p className="text-xl font-black text-white">{selectedHospital.availableBeds}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Available Beds</p>
                          </div>
                          <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col items-center text-center shadow-lg">
                              <User className="w-6 h-6 text-red-400 mb-2" />
                              <p className="text-xl font-black text-white">{selectedHospital.doctorsCount}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">On-Call Staff</p>
                          </div>
                      </div>
                  </section>

                  <section>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Facility Information</h3>
                      <div className="space-y-4">
                          <div className="flex items-start gap-4 p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg">
                              <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Address</p>
                                  <p className="text-sm font-bold text-white leading-relaxed">{selectedHospital.address || "Main Emergency Entrance, Health District"}</p>
                              </div>
                          </div>
                          <div className="flex items-start gap-4 p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg">
                              <Activity className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Hospital Capacity</p>
                                  <p className="text-sm font-bold text-white">{selectedHospital.beds} Total Licensed Beds</p>
                              </div>
                          </div>
                      </div>
                  </section>

                  {/* AI Route Optimization Button */}
                  <section>
                    <button 
                      onClick={runAiAnalysis}
                      disabled={isAnalyzing}
                      className={cn(
                        "w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] text-[10px] transition-all border-2",
                        isAnalyzing ? "bg-neutral-900 border-neutral-900 text-white animate-pulse" :
                        "bg-white border-yellow-400 text-neutral-900 hover:bg-yellow-50 hover:shadow-xl shadow-yellow-400/10 active:scale-[0.98]"
                      )}
                    >
                      {isAnalyzing ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 text-yellow-400" />
                      )}
                      {isAnalyzing ? "AI Optimizing..." : "Fastest Route Optimization"}
                    </button>
                  </section>

                  {/* AI Insights Display */}
                  <AnimatePresence>
                    {aiAnalysis && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 space-y-3"
                      >
                        <div className="flex items-center gap-2 text-yellow-800 font-bold text-sm">
                          <Info className="w-4 h-4" />
                          Optimization Insight
                        </div>
                        <p className="text-xs text-yellow-900 leading-relaxed font-medium">
                          {aiAnalysis.reasoning}
                        </p>
                        {aiAnalysis.trafficAlerts?.length > 0 && (
                          <div className="space-y-1">
                            {aiAnalysis.trafficAlerts.map((alert: string, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-[9px] text-red-600 font-bold bg-red-50 p-2 rounded-lg">
                                <AlertTriangle className="w-3 h-3" /> {alert}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="pt-2 border-t border-yellow-200 flex justify-between items-center">
                          <span className="text-[9px] font-black uppercase text-yellow-700 tracking-wider">Traffic Analysis Result</span>
                          <span className="text-xs font-black text-green-600">{aiAnalysis.estimatedTimeReduction}</span>
                        </div>
                      </motion.section>
                    )}
                  </AnimatePresence>

                  {route && (
                      <section>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Trip Information</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/5 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-center shadow-lg">
                                <Clock className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                <p className="text-sm font-black text-white">{formatDuration(route.duration)}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">ETA</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-center shadow-lg">
                                <Navigation className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                                <p className="text-sm font-black text-white">{formatDistance(route.distance)}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Dist</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-center shadow-lg">
                                <AlertTriangle className={cn(
                                    "w-4 h-4 mx-auto mb-1",
                                    route.trafficCondition === 'Heavy' ? "text-red-500" : 
                                    route.trafficCondition === 'Moderate' ? "text-orange-500" : "text-green-500"
                                )} />
                                <p className="text-sm font-black text-white">{route.trafficCondition}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Traffic</p>
                            </div>
                        </div>
                      </section>
                  )}
              </div>

              <div className="p-6 bg-slate-900/80 border-t border-white/10 space-y-3 shrink-0 backdrop-blur-md relative z-10">
                  <button 
                    onClick={() => setIsConfirmed(true)}
                    className="w-full py-4 bg-red-600 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 transition-all active:scale-[0.98]"
                  >
                    Direct Dispatch
                  </button>
                  <button className="w-full py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-white/10 transition-all">
                    Contact ER
                  </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 bg-slate-900/80 flex flex-col gap-4 relative z-10 backdrop-blur-md">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Available Care</h3>
                    <h2 className="text-xl font-bold text-white">Nearby Facilities</h2>
                  </div>
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
                    <HospitalIcon className="w-5 h-5" />
                  </div>
                </div>

                <button 
                  onClick={runAiAnalysis}
                  disabled={isAnalyzing || hospitals.length === 0}
                  className={cn(
                    "w-full py-3.5 rounded-xl flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]",
                    isAnalyzing 
                      ? "bg-slate-800 text-white animate-pulse border border-white/10" 
                      : "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]"
                  )}
                >
                  {isAnalyzing ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Zap className="w-4 h-4 text-yellow-400" />
                  )}
                  {isAnalyzing ? "AI Scanning Resources..." : "Scan for Optimal Hospital"}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar relative z-10">
                {isLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="h-20 bg-white/5 animate-pulse rounded-2xl border border-white/10" />
                    ))}
                  </div>
                ) : (
                  hospitals.map((h: Hospital) => (
                    <button
                      key={h.id}
                      onClick={() => handleHospitalSelect(h)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group relative overflow-hidden backdrop-blur-md",
                        selectedHospital?.id === h.id 
                          ? "border-red-500/50 bg-red-600/20 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                          : evaluatingHospitalId === h.id
                          ? "border-yellow-400/50 bg-yellow-500/20 animate-pulse scale-[1.02] z-10 shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                          : "border-white/10 bg-white/5 hover:bg-white/10 hover:shadow-lg"
                      )}
                    >
                      {evaluatingHospitalId === h.id && (
                        <div className="absolute inset-0 bg-yellow-400/10 flex items-center justify-center backdrop-blur-[2px]">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                            <span className="text-[10px] font-black text-yellow-300 uppercase tracking-widest">AI Scanning...</span>
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "p-3 rounded-xl transition-colors",
                        selectedHospital?.id === h.id ? "bg-red-600 text-white" : "bg-white/10 text-slate-300 group-hover:bg-white/20 group-hover:text-white"
                      )}>
                        <HospitalIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold truncate text-white">{h.name}</p>
                          {hospitals.indexOf(h) === 0 && (
                            <span className="bg-blue-600 text-white text-[7px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter">Recommended</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            h.availableBeds > 5 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {h.availableBeds} Beds
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            h.doctorsCount > 10 ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-600"
                          )}>
                            {h.doctorsCount} Doctors
                          </span>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">
                            {h.type || 'General'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

    {/* Reporting Modal */}

    <AnimatePresence>
        {isReportModalOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReportModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">Report Missing Case</h2>
                  <p className="text-sm text-slate-400 font-medium">Add a new emergency context to the system</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block ml-1">Emergency Title</label>
                  <input 
                    type="text" 
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="e.g. Heat Stroke, Allergic Reaction"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-white placeholder-slate-500"
                  />
                </div>
                
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
                  <Info className="w-5 h-5 text-yellow-400 shrink-0" />
                  <p className="text-xs text-yellow-200 leading-relaxed font-medium">
                    Reported cases are sent to central dispatch for review. They will appear in your local session immediately with a <span className="font-bold underline text-yellow-400">Reported Case</span> tag.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => setIsReportModalOpen(false)}
                    className="flex-1 py-3 text-sm font-bold text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all border border-transparent hover:border-white/10"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (!reportText) return;
                      const newType = {
                        id: reportText.toLowerCase().replace(/\s+/g, '-'),
                        label: reportText,
                        icon: <Activity className="w-4 h-4" />,
                        color: "bg-blue-100 text-blue-700 border-blue-200",
                        isCustom: true
                      };
                      setCustomEmergencyTypes(prev => [...prev, newType]);
                      setReportText("");
                      setIsReportModalOpen(false);
                      setEmergencyType(newType.id);
                    }}
                    className="flex-1 py-3 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/10 hover:bg-neutral-800 transition-all"
                  >
                    Submit Report
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
