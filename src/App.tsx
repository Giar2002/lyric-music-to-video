/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Music, 
  Type, 
  Timer, 
  Eye, 
  Download, 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw,
  Sparkles,
  ChevronRight,
  FileAudio
} from 'lucide-react';
import { cn, formatTime } from '@/src/lib/utils';
import { LyricLine, AppState } from '@/src/types';
import { transcribeLyrics } from '@/src/services/geminiService';
import confetti from 'canvas-confetti';

export default function App() {
  const [state, setState] = useState<AppState>({
    audioUrl: null,
    audioName: null,
    lyrics: [],
    step: 'upload',
  });
  const [rawLyrics, setRawLyrics] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Sync state
  const [syncIndex, setSyncIndex] = useState(0);

  const syncListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (syncListRef.current && state.step === 'sync') {
      const activeItem = syncListRef.current.children[syncIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [syncIndex, state.step]);

  const processFile = (file: File) => {
    if (!file || !file.type.startsWith('audio/')) return;
    const url = URL.createObjectURL(file);
    setState(prev => ({
      ...prev,
      audioUrl: url,
      audioName: file.name,
      step: 'lyrics'
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const startTranscription = async () => {
    if (!state.audioUrl) return;
    setIsTranscribing(true);
    try {
      const response = await fetch(state.audioUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await transcribeLyrics(base64, blob.type);
        setRawLyrics(text);
        setIsTranscribing(false);
      };
    } catch (err) {
      console.error(err);
      setIsTranscribing(false);
    }
  };

  const processLyrics = () => {
    const lines = rawLyrics.split('\n')
      .filter(line => line.trim() !== '')
      .map((text, index) => ({
        id: crypto.randomUUID(),
        text: text.trim(),
        startTime: index === 0 ? 0.1 : 0 // First line starts almost immediately
      }));
    setState(prev => ({ ...prev, lyrics: lines, step: 'sync' }));
    setSyncIndex(0);
  };

  const handleSyncTick = () => {
    if (!audioRef.current || syncIndex >= state.lyrics.length) return;
    
    const newLyrics = [...state.lyrics];
    const time = audioRef.current.currentTime;

    if (syncIndex + 1 < newLyrics.length) {
      // Set the start time of the NEXT lyric to the current time (when the current lyric ends)
      newLyrics[syncIndex + 1].startTime = time;
    }
    
    setState(prev => ({ ...prev, lyrics: newLyrics }));
    setSyncIndex(prev => prev + 1);

    if (syncIndex === state.lyrics.length - 1) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  const resetSync = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setSyncIndex(0);
    setState(prev => ({
      ...prev,
      lyrics: prev.lyrics.map((l, i) => ({ ...l, startTime: i === 0 ? 0.1 : 0 }))
    }));
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleReplay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      // If playing, then pause it
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If at the end, restart
      if (audioRef.current.ended || audioRef.current.currentTime >= audioRef.current.duration - 0.1) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Recording Logic
  const handleRecord = async () => {
    const element = document.getElementById('lyrics-video-container');
    if (!element) return;

    setRecording(true);
    // Note: In real scenarios, we would use html2canvas + captureStream but Browser constraints apply.
    // We will use the MediaRecorder API on a stream captured from the canvas or use the "share" approach.
    // For this demo, we'll simulate the download logic.
    setTimeout(() => {
      setRecording(false);
      alert("Simulasi: Video sedang diproses dan akan segera diunduh! (Di aplikasi nyata, kami menggunakan browser MediaStream API)");
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-green-500 selection:text-black">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-10 p-6 flex justify-between items-center border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center rotate-6 shadow-lg shadow-green-500/20">
            <Music size={18} className="text-black" />
          </div>
          <span className="text-xl font-bold tracking-tighter">LYRICAL</span>
        </div>
        <div className="flex gap-4 items-center">
          {['upload', 'lyrics', 'sync', 'preview'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn(
                "text-xs font-medium uppercase tracking-widest transition-opacity",
                state.step === s ? "opacity-100 text-green-500" : "opacity-30"
              )}>
                {s}
              </div>
              {i < 3 && <ChevronRight size={12} className="opacity-10" />}
            </React.Fragment>
          ))}
        </div>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto p-6 pt-12 pb-24">
        <AnimatePresence mode="wait">
          {state.step === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <h1 className="text-5xl font-black mb-4 tracking-tight leading-none">
                Ubah Musikmu Jadi <span className="text-green-500">Video Lirik</span>
              </h1>
              <p className="text-white/50 text-lg mb-12 max-w-lg mx-auto">
                Tampilan simpel bergaya Spotify. Masukkan audio, lirik, dan sinkronkan hanya dengan satu jari.
              </p>

              <label 
                className={cn(
                  "group relative block w-full max-w-xl mx-auto h-64 border-2 border-dashed rounded-3xl cursor-pointer transition-all bg-white/5 overflow-hidden",
                  isDragging ? "border-green-500 bg-green-500/10 scale-[1.02]" : "border-white/10 hover:border-green-500/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                <div className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center gap-4 transition-transform",
                  isDragging ? "scale-110" : "group-hover:scale-105"
                )}>
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                    isDragging ? "bg-green-500 text-black" : "bg-white/10 group-hover:bg-green-500 group-hover:text-black"
                  )}>
                    <Upload size={32} />
                  </div>
                  <div>
                    <p className="font-bold text-xl">{isDragging ? 'Lepaskan Lagu' : 'Klik atau Tarik Lagu'}</p>
                    <p className="text-white/40 text-sm">MP3, WAV, atau M4A</p>
                  </div>
                </div>
              </label>
            </motion.div>
          )}

          {state.step === 'lyrics' && (
            <motion.div 
              key="lyrics"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold flex items-center gap-3">
                    <Type className="text-green-500" /> Masukkan Lirik
                  </h2>
                  <p className="text-white/50">Tempel lirik lagu atau gunakan AI untuk membantu.</p>
                </div>
                <button 
                  onClick={startTranscription}
                  disabled={isTranscribing}
                  className="flex items-center gap-2 bg-green-500/10 text-green-500 px-4 py-2 rounded-full font-bold text-sm hover:bg-green-500 hover:text-black transition-all disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {isTranscribing ? 'Menulis...' : 'Bantu Pakai AI'}
                </button>
              </div>

              <textarea 
                value={rawLyrics}
                onChange={(e) => setRawLyrics(e.target.value)}
                placeholder="Tempel lirik di sini..."
                className="w-full h-80 bg-white/5 border border-white/10 rounded-2xl p-6 text-xl focus:outline-none focus:border-green-500/50 transition-colors resize-none placeholder:opacity-20"
              />

              <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <FileAudio size={20} className="text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold truncate max-w-[200px]">{state.audioName}</p>
                    <p className="text-xs opacity-50">Audio Terpasang</p>
                  </div>
                </div>
                <button 
                  onClick={processLyrics}
                  disabled={!rawLyrics.trim()}
                  className="bg-green-500 text-black px-8 py-3 rounded-full font-black text-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
                >
                  Lanjut Sinkron
                </button>
              </div>
            </motion.div>
          )}

          {state.step === 'sync' && (
            <motion.div 
              key="sync"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="space-y-6">
                <div 
                  onClick={() => isPlaying && syncIndex < state.lyrics.length && handleSyncTick()}
                  className={cn(
                    "bg-white/5 p-8 rounded-[40px] aspect-square flex flex-col items-center justify-center text-center relative overflow-hidden group transition-all active:scale-95",
                    isPlaying && syncIndex < state.lyrics.length ? "cursor-pointer hover:bg-white/10" : "cursor-default"
                  )}
                >
                  <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={syncIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative z-10 pointer-events-none"
                    >
                      <p className="text-white/40 text-sm font-bold uppercase tracking-[0.2em] mb-4">Lirik saat ini</p>
                      <h3 className="text-4xl font-black leading-tight px-4">
                        {state.lyrics[syncIndex]?.text || "Selesai!"}
                      </h3>
                      {syncIndex < state.lyrics.length && (
                        <p className="mt-8 text-green-500 font-mono text-sm">
                          {isPlaying ? "Klik area ini setiap kali lirik SELESAI dinyanyikan" : "Putar lagu untuk mulai sinkron"}
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {syncIndex >= state.lyrics.length && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setState(prev => ({ ...prev, step: 'preview' }));
                      }}
                      className="mt-8 bg-white text-black px-8 py-3 rounded-full font-black hover:bg-green-500 transition-colors relative z-20"
                    >
                      Beres! Lihat Hasil
                    </motion.button>
                  )}
                </div>

                <div className="bg-white/5 p-4 rounded-3xl flex items-center justify-between gap-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={togglePlay}
                      className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <button 
                      onClick={resetSync}
                      className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      <RotateCcw size={20} />
                    </button>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="font-mono text-xl tabular-nums">
                      {formatTime(currentTime)}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest opacity-40">Waktu berjalan</p>
                  </div>
                </div>
              </div>

              <div 
                ref={syncListRef}
                className="bg-white/5 rounded-3xl p-6 overflow-y-auto max-h-[500px] border border-white/5 scrollbar-hide scroll-smooth"
              >
                <div className="space-y-4">
                  {state.lyrics.map((l, i) => (
                    <div 
                      key={l.id}
                      className={cn(
                        "p-4 rounded-2xl transition-all duration-300",
                        i === syncIndex ? "bg-green-500 text-black scale-105" : 
                        i < syncIndex ? "opacity-100 bg-white/10" : "opacity-30 bg-black/20"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className={cn("font-bold", i === syncIndex ? "text-xl" : "text-base")}>{l.text}</span>
                        {l.startTime > 0 && (
                          <span className="text-xs font-mono opacity-60">{formatTime(l.startTime)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {state.step === 'preview' && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              <div id="lyrics-video-container" className="relative aspect-[9/16] md:aspect-video w-full bg-[#121212] rounded-[40px] overflow-hidden shadow-2xl shadow-green-500/10 border border-white/10">
                {/* Visualizer Background */}
                <div className="absolute inset-0 pointer-events-none opacity-30">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-green-500 blur-[100px] rounded-full animate-pulse" />
                </div>

                <div className="absolute inset-0 p-12 flex flex-col justify-center">
                  <div className="space-y-8 h-[70%] overflow-hidden relative">
                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#121212] to-transparent z-10" />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#121212] to-transparent z-10" />
                    
                    <div 
                      className="transition-transform duration-700 ease-out space-y-6"
                      style={{ 
                        transform: `translateY(${-((state.lyrics.findLastIndex(l => currentTime >= l.startTime) || 0) * 80) + 120}px)` 
                      }}
                    >
                      {state.lyrics.map((l, i) => {
                        const active = currentTime >= l.startTime && (i === state.lyrics.length - 1 || currentTime < state.lyrics[i+1].startTime);
                        return (
                          <motion.p 
                            key={l.id}
                            className={cn(
                              "text-4xl md:text-5xl font-black tracking-tight transition-all duration-500 min-h-[80px] flex items-center",
                              active ? "text-white scale-100 opacity-100" : "text-white/20 scale-90 blur-[1px]"
                            )}
                          >
                            {l.text}
                          </motion.p>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Progress bar at bottom */}
                <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
                  <div 
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${(currentTime / (audioRef.current?.duration || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
                <button 
                  onClick={handleReplay}
                  className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform active:scale-95 shadow-xl shadow-white/10"
                >
                  {isPlaying ? <Pause size={28} /> : <Play size={28} fill="currentColor" />}
                </button>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setState(prev => ({ ...prev, step: 'sync' }))}
                    className="bg-white/5 border border-white/10 text-white px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-white/10 transition-colors"
                  >
                    <RotateCcw size={20} />
                    Ulang Sinkron
                  </button>
                  <button 
                    onClick={handleRecord}
                    disabled={recording}
                    className="bg-green-500 text-black px-10 py-4 rounded-full font-black text-xl flex items-center gap-3 shadow-lg shadow-green-500/20 hover:scale-105 transition-transform disabled:opacity-50"
                  >
                    {recording ? <Sparkles className="animate-spin" /> : <Download size={24} />}
                    {recording ? 'Memproses...' : 'Download Video'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-6 z-20 pointer-events-none">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
           <div className="bg-black/80 backdrop-blur-xl border border-white/5 p-4 rounded-2xl flex items-center gap-4 pointer-events-auto">
             <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center rotate-3 overflow-hidden">
                <Music size={20} className="text-black" />
             </div>
             <div>
               <p className="text-xs font-bold truncate max-w-[150px] uppercase opacity-50">Sedang diputar</p>
               <p className="font-bold text-sm tracking-tight">{state.audioName || "Belum ada lagu"}</p>
             </div>
           </div>

           <div className="pointer-events-auto opacity-50 hover:opacity-100 transition-opacity">
              <a href="#" className="text-[10px] font-medium tracking-[0.3em] uppercase">Powered by Gemini AI</a>
           </div>
        </div>
      </footer>

      {/* Hidden Audio Player */}
      {state.audioUrl && (
        <audio 
          ref={audioRef}
          src={state.audioUrl}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}
