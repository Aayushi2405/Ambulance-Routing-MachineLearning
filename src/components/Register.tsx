import React, { useState } from "react";
import { Navigation, Shield, Ambulance, Lock, User, RefreshCw, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";

interface RegisterProps {
  onRegister: (args: { userName: string; sessionId: string; licensePlate: string }) => void;
  onBackToLogin: () => void;
}

export default function Register({ onRegister, onBackToLogin }: RegisterProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    
    setError("");
    setIsSubmitting(true);
    
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, licensePlate, password }),
      });
      
      const data = await response.json();
      if (data.success && data.sessionId) {
        onRegister({ userName: fullName, sessionId: data.sessionId, licensePlate });
      } else {
        setError(data.message || "Registration failed");
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError("Network error. Is the server running?");
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600 rounded-full blur-[128px]" />
      </div>

      <motion.div 
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-4xl p-8 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <button 
          type="button"
          onClick={onBackToLogin}
          className="absolute top-8 left-8 p-2 text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center mb-8 pt-4">
          <h1 className="text-3xl font-black text-white tracking-tight">Create Account</h1>
          <p className="text-neutral-400 text-sm mt-2">Join the emergency dispatcher network</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold flex items-center gap-2">
            <Shield className="w-4 h-4" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Full Name</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-neutral-500" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="John Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Email Address</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Navigation className="h-5 w-5 text-neutral-500" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="john@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">License Plate</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Ambulance className="h-5 w-5 text-neutral-500" />
              </div>
              <input
                type="text"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="AB12 CD3456"
                required
              />
            </div>
            <p className="text-[10px] text-neutral-500">Required - used to identify your vehicle in dispatch logs.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-neutral-500" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Confirm Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-neutral-500" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-red-600/20 hover:bg-red-500 active:scale-[0.98] transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Complete Registration"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-neutral-500">
          Already have an account?{" "}
          <button type="button" onClick={onBackToLogin} className="text-red-500 font-bold hover:underline">
            Login here
          </button>
        </p>
      </motion.div>
    </div>
  );
}
