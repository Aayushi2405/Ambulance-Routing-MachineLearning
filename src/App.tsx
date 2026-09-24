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
  Ambulance,
  X,
  CheckCircle2,
  Mic
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import MapComponent from "./components/MapComponent";
import Login from "./components/Login";
import Register from "./components/Register";
import polyline from "@mapbox/polyline";
import { fetchNearbyHospitals } from "./services/hospitalService";
import { getRoute, calculateBearing } from "./services/routingService";
import { Hospital, AmbulanceState, RouteInfo, OptimizationResult, HospitalScore } from "./types";
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
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4>(1);
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
  const [reportType, setReportType] = useState("Accident");
  const [reportTitle, setReportTitle] = useState("");
  const [reportLocation, setReportLocation] = useState("");
  const [patientName, setPatientName] = useState("");
  const [severity, setSeverity] = useState<'Critical' | 'High' | 'Moderate' | 'Low'>('High');
  const [reportNotes, setReportNotes] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isListeningContext, setIsListeningContext] = useState(false);
  const [contextSpeechError, setContextSpeechError] = useState<string | null>(null);

  const [evaluatingHospitalId, setEvaluatingHospitalId] = useState<string | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Fetch initial emergency reports from backend
  useEffect(() => {
    const fetchEmergencies = async () => {
      try {
        const res = await fetch("/api/emergencies");
        const data = await res.json();
        if (data.success && Array.isArray(data.emergencies)) {
          const loadedTypes = data.emergencies.map((em: any) => ({
            id: `db-${em.id}`,
            label: em.title,
            icon: <Activity className="w-4 h-4" />,
            color: em.severity === 'Critical' ? "bg-red-100 text-red-700 border-red-200" : "bg-blue-100 text-blue-700 border-blue-200",
            isCustom: true,
            severity: em.severity,
            patientName: em.patient_name,
            notes: em.notes
          }));
          setCustomEmergencyTypes(loadedTypes);
        }
      } catch (err) {
        console.error("Failed to load existing emergency reports:", err);
      }
    };
    fetchEmergencies();
  }, []);

  const handleEmergencyReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportType.trim() || !reportTitle.trim() || !reportLocation.trim()) {
      setReportError("Please fill in all required fields (Emergency Type, Title, and Location).");
      return;
    }
    setReportError(null);
    setIsSubmittingReport(true);

    const myAmbulanceLoc = ambulances.find(a => a.id === myId) || ambulances[0];

    try {
      const response = await fetch("/api/emergencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[${reportType}] ${reportTitle.trim()}`,
          patientName: `Location: ${reportLocation.trim()}`,
          severity,
          locationLat: myAmbulanceLoc?.lat,
          locationLng: myAmbulanceLoc?.lng,
          notes: reportNotes.trim() || undefined
        })
      });

      const data = await response.json();
      if (data.success && data.emergency) {
        const created = data.emergency;
        const newType = {
          id: `db-${created.id}`,
          label: created.title,
          icon: <Activity className="w-4 h-4" />,
          color: created.severity === 'Critical' ? "bg-red-100 text-red-700 border-red-200" : "bg-blue-100 text-blue-700 border-blue-200",
          isCustom: true,
          severity: created.severity,
          patientName: created.patient_name,
          notes: created.notes
        };

        setCustomEmergencyTypes(prev => {
          if (prev.some(t => t.id === newType.id)) return prev;
          return [newType, ...prev];
        });
        setEmergencyType(newType.id);
        setReportSuccessMessage("Emergency case reported successfully!");
        setTimeout(() => {
          setIsReportModalOpen(false);
          setReportSuccessMessage(null);
        }, 1500);
      } else {
        setReportError(data.message || "Failed to submit emergency report.");
      }
    } catch (err) {
      setReportError("Network error. Could not connect to dispatch server.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccessMessage, setDispatchSuccessMessage] = useState<string | null>(null);

  const handleVoiceInputContext = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setContextSpeechError("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListeningContext(true);
      setContextSpeechError(null);

      recognition.onresult = (event: any) => {
        setIsListeningContext(false);
        const transcript = (event.results?.[0]?.[0]?.transcript || "").toLowerCase();

        let matchedId = "other";
        if (
          transcript.includes("heart") ||
          transcript.includes("cardiac") ||
          transcript.includes("heart pain") ||
          transcript.includes("chest pain") ||
          transcript.includes("heart attack")
        ) {
          matchedId = "cardiac";
        } else if (
          transcript.includes("accident") ||
          transcript.includes("trauma") ||
          transcript.includes("crash") ||
          transcript.includes("collision") ||
          transcript.includes("hit by")
        ) {
          matchedId = "trauma";
        } else if (
          transcript.includes("snake") ||
          transcript.includes("bite")
        ) {
          matchedId = "snakebite";
        } else if (
          transcript.includes("poison") ||
          transcript.includes("toxic")
        ) {
          matchedId = "poison";
        } else if (
          transcript.includes("burn") ||
          transcript.includes("fire")
        ) {
          matchedId = "burns";
        } else if (
          transcript.includes("stroke") ||
          transcript.includes("paralysis") ||
          transcript.includes("got stroke")
        ) {
          matchedId = "stroke";
        } else {
          const allTypes = [...EMERGENCY_TYPES, ...customEmergencyTypes];
          const found = allTypes.find(t => transcript.includes(t.label.toLowerCase()));
          if (found) matchedId = found.id;
        }

        setEmergencyType(matchedId);
      };

      recognition.onerror = (event: any) => {
        setIsListeningContext(false);
        if (event.error === 'no-speech') {
          setContextSpeechError("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          setContextSpeechError("Microphone permission denied.");
        } else {
          setContextSpeechError(`Speech error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListeningContext(false);
      };

      recognition.start();
    } catch (err) {
      setIsListeningContext(false);
      setContextSpeechError("Speech recognition could not be started.");
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setReportError("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);
      setReportError(null);

      recognition.onresult = (event: any) => {
        setIsListening(false);
        const transcript = (event.results?.[0]?.[0]?.transcript || "").toLowerCase();

        let matched = "Other";
        if (
          transcript.includes("heat") ||
          transcript.includes("sunstroke") ||
          transcript.includes("sun stroke") ||
          transcript.includes("too hot") ||
          transcript.includes("heat problem")
        ) {
          matched = "Heat Stroke";
        } else if (
          transcript.includes("heart") ||
          transcript.includes("chest pain") ||
          transcript.includes("cardiac") ||
          transcript.includes("heart pain") ||
          transcript.includes("heart attack") ||
          transcript.includes("heart hurt")
        ) {
          matched = "Heart Attack";
        } else if (
          transcript.includes("stroke") ||
          transcript.includes("paralysis") ||
          transcript.includes("paralyzed") ||
          transcript.includes("got stroke")
        ) {
          matched = "Stroke";
        } else if (
          transcript.includes("accident") ||
          transcript.includes("crash") ||
          transcript.includes("collision") ||
          transcript.includes("hit by") ||
          transcript.includes("vehicle")
        ) {
          matched = "Accident";
        } else if (
          transcript.includes("unconscious") ||
          transcript.includes("faint") ||
          transcript.includes("passed out") ||
          transcript.includes("not waking up") ||
          transcript.includes("unresponsive") ||
          transcript.includes("collapsed")
        ) {
          matched = "Unconscious Person";
        } else if (
          transcript.includes("breath") ||
          transcript.includes("suffocat") ||
          transcript.includes("chok") ||
          transcript.includes("gasp") ||
          transcript.includes("cannot breathe") ||
          transcript.includes("cant breathe") ||
          transcript.includes("not breathing") ||
          transcript.includes("breathing problem") ||
          transcript.includes("shortness of breath")
        ) {
          matched = "Breathing Difficulty";
        } else {
          const options = ["Accident", "Heart Attack", "Stroke", "Breathing Difficulty", "Heat Stroke", "Unconscious Person"];
          const found = options.find(opt => transcript.includes(opt.toLowerCase()));
          if (found) matched = found;
        }

        setReportType(matched);
        setReportTitle(`${matched} Incident`);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'no-speech') {
          setReportError("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          setReportError("Microphone permission denied.");
        } else {
          setReportError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      setIsListening(false);
      setReportError("Speech recognition could not be started.");
    }
  };

  const handleOpenReportModal = () => {
    const amb = ambulances.find(a => a.id === myId) || ambulances[0];
    const locStr = amb ? `${amb.lat.toFixed(4)}, ${amb.lng.toFixed(4)}` : "18.2028, 83.6889";
    setReportType("Accident");
    setReportTitle("Accident Incident");
    setReportLocation(`Current Location (${locStr})`);
    setPatientName("");
    setSeverity("High");
    setReportNotes("");
    setReportError(null);
    setReportSuccessMessage(null);
    setIsListening(false);
    setIsReportModalOpen(true);
  };

  const handleDirectDispatch = async () => {
    if (!route || !selectedHospital) return;

    if (isConfirmed) {
      setIsConfirmed(false);
      setDispatchSuccessMessage(null);
      return;
    }

    setIsDispatching(true);
    setIsConfirmed(true);

    const dbEmergencyId = emergencyType.startsWith('db-') 
      ? parseInt(emergencyType.replace('db-', ''), 10) 
      : null;

    try {
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: dbEmergencyId,
          ambulanceId: myAmbulance?.id || null,
          polyline: route.geometry,
          distance: route.distance,
          duration: route.duration
        })
      });
      const data = await response.json();
      if (data.success) {
        setDispatchSuccessMessage(`Unit dispatched to ${selectedHospital.name}! ETA: ${Math.round(route.duration / 60)} min.`);
      }
    } catch (err) {
      console.error("Failed to persist dispatch route to backend:", err);
    } finally {
      setIsDispatching(false);
    }
  };


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

    newSocket.on("emergency:created", (newEm: any) => {
      const formattedType = {
        id: `db-${newEm.id}`,
        label: newEm.title,
        icon: <Activity className="w-4 h-4" />,
        color: newEm.severity === 'Critical' ? "bg-red-100 text-red-700 border-red-200" : "bg-blue-100 text-blue-700 border-blue-200",
        isCustom: true,
        severity: newEm.severity,
        patientName: newEm.patient_name,
        notes: newEm.notes
      };
      setCustomEmergencyTypes(prev => {
        if (prev.some(t => t.id === formattedType.id)) return prev;
        return [formattedType, ...prev];
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);


  // Get initial location and start tracking
  useEffect(() => {
    if (hospitals.length === 0) {
      loadHospitals(18.20278, 83.68889);
    }
    
    let watchId: number;
    const updateLocation = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const heading = pos.coords.heading;
      
      setLocationStatus('gps');
      setLocationErrorMessage(null);

      const targetId = myId || socket?.id || "local";
      const newState: AmbulanceState = { 
        id: targetId,
        lat, 
        lng, 
        heading: heading || 0,
        lastUpdate: Date.now()
      };
      
      setAmbulances(prev => {
        const index = prev.findIndex(a => a.id === targetId || a.id === "local");
        const newAmbs = [...prev];
        if (index !== -1) {
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

      // Reload hospitals if moved more than 1km
      const now = Date.now();
      const shouldReload = !lastFetchPos.current || 
        Math.abs(lastFetchPos.current.lat - lat) > 0.01 || 
        Math.abs(lastFetchPos.current.lng - lng) > 0.01 ||
        (hospitals.length === 0 && now - lastFetchTime.current > 10000);

      if (shouldReload) {
        lastFetchPos.current = { lat, lng };
        lastFetchTime.current = now;
        loadHospitals(lat, lng);
      }
    };

    const handleLocationError = async (err: any) => {
      console.warn("Geolocation watch error:", err);
      setLocationStatus('fallback');
      if (err && err.code) {
        if (err.code === 1) {
          setLocationErrorMessage("GPS permission denied. Using station location fallback.");
        } else if (err.code === 2) {
          setLocationErrorMessage("GPS position unavailable. Using station location fallback.");
        } else if (err.code === 3) {
          setLocationErrorMessage("GPS request timed out. Using station location fallback.");
        }
      }

      setAmbulances(prev => {
        if (prev.length > 0) return prev;
        const targetId = myId || socket?.id || "local";
        const fallbackState = { id: targetId, lat: 18.20278, lng: 83.68889, heading: 0, lastUpdate: Date.now() }; 
        return [fallbackState];
      });
      setIsLoading(false);
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(updateLocation, handleLocationError, { 
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000
      });
    } else {
      handleLocationError(new Error("Not supported"));
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [socket?.id]);

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
          const targetId = myId || socket?.id || "local";
          const newState = { 
            id: targetId,
            lat, 
            lng, 
            heading: heading || 0,
            lastUpdate: Date.now()
          };
          setAmbulances(prev => {
            const index = prev.findIndex(a => a.id === targetId || a.id === "local");
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
    
    // Initial sort by proximity and capacity
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

  const myAmbulance = ambulances.find(a => a.id === myId || a.id === socket?.id || a.id === "local") || ambulances[0];

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

    // Evaluate up to 6 candidate facilities in parallel for fast execution
    const candidates = hospitals.filter(h => h.availableBeds > 0);
    const evalTargets = (candidates.length > 0 ? candidates : hospitals).slice(0, 6);

    const routeResults = await Promise.all(
      evalTargets.map(async (h) => {
        setEvaluatingHospitalId(h.id);
        const routeData = await getRoute(
          { lat: myAmbulance.lat, lng: myAmbulance.lng },
          { lat: h.lat, lng: h.lng },
          trafficMode === 'Dynamic' ? undefined : trafficMode
        );
        return { hospital: h, route: routeData };
      })
    );

    setEvaluatingHospitalId(null);
    const validResults = routeResults.filter((r): r is { hospital: Hospital; route: RouteInfo } => r.route !== null);

    if (validResults.length === 0) {
      setIsAnalyzing(false);
      return;
    }

    // Min & Max travel times for normalization
    const durations = validResults.map(r => r.route.duration);
    const minTime = Math.min(...durations);
    const maxTime = Math.max(...durations);

    // Multi-Criteria Decision Analysis (MCDA) Scoring
    const scoredHospitals: HospitalScore[] = validResults.map(item => {
      const h = item.hospital;
      const r = item.route;

      // 1. Travel Time Score (0 - 100)
      const timeDiff = maxTime - minTime;
      const travelTimeScore = timeDiff > 0 
        ? Math.max(0, 100 * (1 - (r.duration - minTime) / (timeDiff + 1)))
        : 100;

      // 2. Bed & Staffing Capacity Score (0 - 100)
      const capacityScore = Math.min(100, Math.round((h.availableBeds / 15) * 60 + (h.doctorsCount / 30) * 40));

      // 3. Emergency Specialization Score (0 - 100)
      let specializationScore = 75;
      const typeLower = (h.type || "").toLowerCase();
      const nameLower = (h.name || "").toLowerCase();

      if (emergencyType === 'cardiac' || emergencyType === 'stroke') {
        if (typeLower.includes('trauma') || typeLower.includes('tertiary') || nameLower.includes('general') || h.isSpecialized) {
          specializationScore = 100;
        } else {
          specializationScore = 75;
        }
      } else if (emergencyType === 'burns' || emergencyType === 'trauma') {
        if (typeLower.includes('trauma') || typeLower.includes('specialty')) {
          specializationScore = 100;
        } else {
          specializationScore = 80;
        }
      } else {
        specializationScore = 85;
      }

      // Weighted Composite Optimization Score (Time: 45%, Specialty: 30%, Capacity: 25%)
      const compositeScore = Math.round(
        travelTimeScore * 0.45 + specializationScore * 0.30 + capacityScore * 0.25
      );

      const reasoning = `${h.name}: Composite Score ${compositeScore}/100 — ${Math.round(r.duration / 60)} min ETA, ${h.availableBeds} beds available, ${h.doctorsCount} staff.`;

      return {
        hospital: h,
        route: r,
        compositeScore,
        travelTimeScore: Math.round(travelTimeScore),
        capacityScore: Math.round(capacityScore),
        specializationScore: Math.round(specializationScore),
        reasoning
      };
    });

    // Sort by composite score descending
    scoredHospitals.sort((a, b) => b.compositeScore - a.compositeScore);
    const recommended = scoredHospitals[0];

    const sortedByTime = [...scoredHospitals].sort((a, b) => a.route.duration - b.route.duration);
    const sortedByCap = [...scoredHospitals].sort((a, b) => b.hospital.availableBeds - a.hospital.availableBeds);

    const trafficAlerts = validResults.some(r => r.route.trafficCondition === 'Heavy')
      ? ["CAUTION: Heavy congestion detected on primary access corridors"]
      : ["Route traffic conditions are currently manageable"];

    const optimizationResult: OptimizationResult = {
      recommended,
      fastestRoute: sortedByTime[0],
      maxCapacity: sortedByCap[0],
      evaluatedCount: validResults.length,
      trafficAlerts,
      recommendationReasoning: `AI Multi-Criteria Result: ${recommended.hospital.name} recommended with a composite score of ${recommended.compositeScore}/100. Balances shortest transit (${Math.round(recommended.route.duration / 60)} min) with ${recommended.hospital.availableBeds} available beds and specialty care.`
    };

    setAiAnalysis(optimizationResult);
    handleHospitalSelect(recommended.hospital);
    setIsAnalyzing(false);
  };

  // Simulation logic updates local state and emits
  useEffect(() => {
    if (!hasAutoSelected && hospitals.length > 0 && myAmbulance) {
      setHasAutoSelected(true);
      runAiAnalysis();
    }
  }, [hospitals, myAmbulance, hasAutoSelected]);

  const simStepRef = React.useRef(0);

  useEffect(() => {
    let interval: any;
    if (isSimulating && route?.geometry && myAmbulance) {
      const points = polyline.decode(route.geometry) as [number, number][];
      if (points.length >= 2) {
        interval = setInterval(() => {
          simStepRef.current = (simStepRef.current + 1) % points.length;
          const currentPt = points[simStepRef.current];
          const nextPt = points[(simStepRef.current + 1) % points.length];
          const heading = calculateBearing(currentPt[0], currentPt[1], nextPt[0], nextPt[1]);

          const newState: AmbulanceState = {
            id: myAmbulance.id,
            lat: currentPt[0],
            lng: currentPt[1],
            heading,
            lastUpdate: Date.now()
          };

          setAmbulances(prev => {
            const targetId = myId || "local";
            const idx = prev.findIndex(a => a.id === targetId);
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = newState;
              return updated;
            }
            return [...prev, newState];
          });

          if (socket?.connected) {
            socket.emit("ambulance:update", newState);
          }
        }, Math.max(300, Math.round(1500 / simSpeed)));
      }
    } else {
      simStepRef.current = 0;
    }
    return () => clearInterval(interval);
  }, [isSimulating, simSpeed, route?.geometry, myId, socket, myAmbulance]);


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
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                  DEMO DATA
                </span>
                <p className="text-[10px] text-amber-200/90 font-medium">
                  Hospital availability is simulated for demonstration.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Emergency Type Selection */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" /> Emergency Context
              </h2>
              <div className="flex items-center gap-2">
                {isListeningContext && (
                  <span className="text-[10px] font-bold text-red-400 animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" /> Listening...
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleVoiceInputContext}
                  title="Voice Command Emergency Selection"
                  className={cn(
                    "px-2 py-1 rounded-lg border transition-all flex items-center justify-center text-xs gap-1.5 font-bold",
                    isListeningContext
                      ? "bg-red-600 text-white border-red-500 shadow-[0_0_12px_rgba(220,38,38,0.5)] animate-pulse"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span className="text-[9px] uppercase tracking-wider">Voice</span>
                </button>
              </div>
            </div>
            {contextSpeechError && (
              <p className="text-[10px] text-red-400 font-bold mb-3 animate-fadeIn">{contextSpeechError}</p>
            )}
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
              onClick={handleOpenReportModal}
              className="w-full mt-3 py-2 border border-dashed border-white/20 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-400/50 hover:bg-red-500/10 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 backdrop-blur-sm"
            >
              <Plus className="w-3 h-3" /> Report Case
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
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Simulation Speed</p>
                </div>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
                  {simSpeed}x Speed
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-black/20 rounded-lg border border-white/5">
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSimSpeed(spd)}
                    className={cn(
                      "text-[9px] font-bold py-1 rounded-md transition-all",
                      simSpeed === spd ? "bg-red-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {spd}x
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
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Core Resources</h3>
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[8px] font-black uppercase tracking-widest">
                          DEMO DATA
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col items-center text-center shadow-lg">
                              <Activity className="w-6 h-6 text-blue-400 mb-2" />
                              <p className="text-xl font-black text-white">{selectedHospital.availableBeds}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Available Beds (Simulated)</p>
                          </div>
                          <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col items-center text-center shadow-lg">
                              <User className="w-6 h-6 text-red-400 mb-2" />
                              <p className="text-xl font-black text-white">{selectedHospital.doctorsCount}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">On-Call Staff (Simulated)</p>
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
                                  <p className="text-sm font-bold text-white">{selectedHospital.beds} Total Licensed Beds (Simulated)</p>
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

                  {/* Multi-Criteria AI Optimization Display */}
                  <AnimatePresence>
                    {aiAnalysis && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-900/90 border border-yellow-500/30 rounded-2xl p-5 space-y-4 shadow-xl backdrop-blur-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-yellow-400 font-black text-xs uppercase tracking-wider">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            AI Multi-Criteria Recommendation
                          </div>
                          {aiAnalysis.recommended?.compositeScore && (
                            <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 text-[10px] font-black rounded-lg border border-yellow-500/40">
                              Score: {aiAnalysis.recommended.compositeScore}/100
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed font-medium">
                          {aiAnalysis.recommendationReasoning || aiAnalysis.reasoning}
                        </p>

                        {aiAnalysis.recommended && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                              <p className="text-[8px] font-bold uppercase text-slate-400">Transit</p>
                              <p className="text-xs font-black text-green-400">{aiAnalysis.recommended.travelTimeScore}/100</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                              <p className="text-[8px] font-bold uppercase text-slate-400">Capacity</p>
                              <p className="text-xs font-black text-blue-400">{aiAnalysis.recommended.capacityScore}/100</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                              <p className="text-[8px] font-bold uppercase text-slate-400">Specialty</p>
                              <p className="text-xs font-black text-yellow-400">{aiAnalysis.recommended.specializationScore}/100</p>
                            </div>
                          </div>
                        )}

                        {aiAnalysis.trafficAlerts?.length > 0 && (
                          <div className="space-y-1">
                            {aiAnalysis.trafficAlerts.map((alert: string, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-[9px] text-red-400 font-bold bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                                <AlertTriangle className="w-3 h-3 text-red-400" /> {alert}
                              </div>
                            ))}
                          </div>
                        )}
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
                  {dispatchSuccessMessage && (
                    <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold text-center animate-fadeIn flex items-center justify-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{dispatchSuccessMessage}</span>
                    </div>
                  )}
                  <button 
                    onClick={handleDirectDispatch}
                    disabled={isDispatching}
                    className={cn(
                      "w-full py-4 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                      isConfirmed ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/40" : "bg-red-600 hover:bg-red-500"
                    )}
                  >
                    {isDispatching ? (
                      <><RefreshCw className="w-4 h-4 animate-spin text-white" /> Dispatching Unit...</>
                    ) : isConfirmed ? (
                      <><ShieldAlert className="w-4 h-4 text-white animate-pulse" /> Dispatch Active — Units En Route</>
                    ) : (
                      <><Navigation className="w-4 h-4 text-white" /> Direct Dispatch</>
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      if (selectedHospital) {
                        alert(`Contacting ER Emergency Hotline for ${selectedHospital.name}\n\nDirect Line: +1 (800) 555-ER-HOTLINE\nFacility: ${selectedHospital.name}\nAddress: ${selectedHospital.address || 'Main District Emergency Gate'}`);
                      }
                    }}
                    className="w-full py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
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
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Available Care</h3>
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[8px] font-black uppercase tracking-widest">
                        DEMO DATA
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white">Nearby Facilities</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Hospital availability is simulated for demonstration</p>
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
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsReportModalOpen(false);
                setReportError(null);
                setReportSuccessMessage(null);
              }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar z-10"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-white">Report Emergency Case</h2>
                    <p className="text-xs text-slate-400 font-medium">Broadcast new patient context to central dispatch</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsReportModalOpen(false);
                    setReportError(null);
                    setReportSuccessMessage(null);
                  }}
                  className="p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {reportSuccessMessage && (
                <div className="mb-4 p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <span>{reportSuccessMessage}</span>
                </div>
              )}

              {reportError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{reportError}</span>
                </div>
              )}

              <form onSubmit={handleEmergencyReportSubmit} className="space-y-4">
                {/* Emergency Type */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block ml-1">
                      Emergency Type <span className="text-red-400">*</span>
                    </label>
                    {isListening && (
                      <span className="text-[10px] font-bold text-red-400 animate-pulse flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" /> Listening...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={reportType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setReportType(newType);
                        setReportTitle(`${newType} Incident`);
                      }}
                      className="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white text-sm font-medium"
                    >
                      {[
                        "Accident",
                        "Heart Attack",
                        "Stroke",
                        "Breathing Difficulty",
                        "Heat Stroke",
                        "Unconscious Person",
                        "Other"
                      ].map((type) => (
                        <option key={type} value={type} className="bg-slate-900 text-white">
                          {type}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleVoiceInput}
                      title="Speak Emergency Type"
                      className={cn(
                        "p-3 rounded-xl border transition-all flex items-center justify-center shrink-0",
                        isListening
                          ? "bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse"
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Severity */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">
                    Severity <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 p-1 bg-black/30 rounded-xl border border-white/5">
                    {(['Critical', 'High', 'Moderate', 'Low'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSeverity(lvl)}
                        className={cn(
                          "py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                          severity === lvl
                            ? lvl === 'Critical' ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                              : lvl === 'High' ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                              : lvl === 'Moderate' ? "bg-yellow-600 text-white shadow-md shadow-yellow-600/30"
                              : "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">
                    Location <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    value={reportLocation}
                    onChange={(e) => setReportLocation(e.target.value)}
                    placeholder="e.g. Main Highway KM 14, Near City Center"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-slate-500 text-sm font-medium"
                  />
                </div>

                {/* Emergency Title */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">
                    Emergency Title <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder="e.g. Severe Vehicle Collision, Patient Unresponsive"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-slate-500 text-sm font-medium"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">
                    Description
                  </label>
                  <textarea 
                    rows={3}
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Add specific symptoms, location landmarks, or vital details..."
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-slate-500 text-xs font-medium custom-scrollbar"
                  />
                </div>

                <div className="flex gap-3 pt-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsReportModalOpen(false);
                      setReportError(null);
                      setReportSuccessMessage(null);
                    }}
                    className="flex-1 py-3.5 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white rounded-xl transition-all border border-white/10"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingReport || !!reportSuccessMessage}
                    className="flex-1 py-3.5 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-red-600/30 hover:bg-red-500 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmittingReport ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-white" />
                        Submit Report
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
    </AnimatePresence>
    </div>
  );
}
