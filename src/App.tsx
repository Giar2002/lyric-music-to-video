/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  FileAudio,
  Volume2,
  VolumeX,
  Check,
  Info,
  Link,
  Loader2
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
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const prevActiveIdxRef = useRef(-1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // URL input state
  const [uploadTab, setUploadTab] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlVideoInfo, setUrlVideoInfo] = useState<{ title: string; author: string; thumbnail: string | null } | null>(null);

  // Sync state
  const [syncIndex, setSyncIndex] = useState(0);

  const syncListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (syncListRef.current && state.step === 'sync') {
      const container = syncListRef.current;
      const listContent = container.querySelector('.space-y-4');
      if (listContent) {
        const activeItem = listContent.children[syncIndex] as HTMLElement;
        if (activeItem) {
          const containerHeight = container.offsetHeight;
          const itemOffsetTop = activeItem.offsetTop;
          const itemHeight = activeItem.offsetHeight;
          // Calculate scroll position to center the item
          container.scrollTo({
            top: itemOffsetTop - (containerHeight / 2) + (itemHeight / 2),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [syncIndex, state.step]);

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Keyboard shortcut for sync (Space = tap)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && state.step === 'sync' && isPlaying && syncIndex < state.lyrics.length) {
        e.preventDefault();
        handleSyncTick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.step, isPlaying, syncIndex, state.lyrics.length]);

  // Smooth time update via RAF
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  // Cleanup object URL on unmount or audio change
  useEffect(() => {
    const url = state.audioUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [state.audioUrl]);

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

  // URL load handler
  const handleUrlLoad = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    setUrlVideoInfo(null);
    try {
      // Fetch video info first
      const infoRes = await fetch(`/api/audio/info?url=${encodeURIComponent(url)}`);
      if (!infoRes.ok) {
        const err = await infoRes.json();
        throw new Error(err.error || 'Gagal mengambil info video');
      }
      const info = await infoRes.json();
      setUrlVideoInfo({ title: info.title, author: info.author, thumbnail: info.thumbnail });

      // Use stream URL directly as audio src
      const streamUrl = `/api/audio/stream?url=${encodeURIComponent(url)}`;
      setState(prev => ({
        ...prev,
        audioUrl: streamUrl,
        audioName: info.title,
        step: 'lyrics',
      }));
    } catch (err: any) {
      showToast(err.message ?? 'Gagal memuat audio dari URL', 'error');
    } finally {
      setUrlLoading(false);
    }
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
        try {
          const base64 = (reader.result as string).split(',')[1];
          const text = await transcribeLyrics(base64, blob.type);
          setRawLyrics(text);
        } catch (err) {
          console.error(err);
          showToast(err instanceof Error ? err.message : "Gagal memproses lirik", "error");
        } finally {
          setIsTranscribing(false);
        }
      };
    } catch (err) {
      console.error(err);
      showToast("Gagal membaca file audio", "error");
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

  // Cleanup audio when switching steps
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      // Reset time when going to preview for a fresh start
      if (state.step === 'preview') {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    }
  }, [state.step]);

  const handlePreviewToggle = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If at end or very close to it, restart
      if (audioRef.current.ended || audioRef.current.currentTime >= audioRef.current.duration - 0.2) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Recording Logic — real canvas-based MP4/WebM export
  const handleRecord = async () => {
    if (!audioRef.current || !state.lyrics.length || !duration) {
      showToast('Pastikan audio dan lirik sudah tersedia.', 'error');
      return;
    }

    // Check MediaRecorder support
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
      ? 'video/mp4;codecs=avc1,mp4a.40.2'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = 1920, H = 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    setRecording(true);
    setRecordingProgress(0);
    showToast('Merekam video... Jangan tutup tab ini!', 'info');

    const chunks: Blob[] = [];
    const videoStream = canvas.captureStream(30);

    // Merge audio into stream if possible
    let combinedStream = videoStream;
    try {
      const audioEl = audioRef.current;
      // @ts-ignore — captureStream is valid in browsers
      const audioStream: MediaStream = audioEl.captureStream ? audioEl.captureStream() : audioEl.mozCaptureStream?.();
      if (audioStream) {
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) combinedStream.addTrack(audioTrack);
      }
    } catch (_) { /* audio capture not supported, video-only */ }

    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      a.href = url;
      a.download = `${state.audioName?.replace(/\.[^.]+$/, '') || 'lyric-video'}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setRecording(false);
      setRecordingProgress(0);
      showToast('Video berhasil didownload!', 'success');
    };

    // Reset audio to beginning
    audioRef.current.currentTime = 0;
    audioRef.current.pause();

    recorder.start();
    audioRef.current.play().catch(() => {});

    const lyrics = state.lyrics;
    const totalDur = duration;
    const startRealTime = performance.now();

    const COLORS = {
      bg: '#0a0a0a',
      glow: 'rgba(34, 197, 94, 0.15)',
      active: '#ffffff',
      past: 'rgba(255,255,255,0.18)',
      upcoming: 'rgba(255,255,255,0.10)',
    };

    const drawFrame = () => {
      const audioTime = audioRef.current?.currentTime ?? 0;
      const progress = Math.min(audioTime / totalDur, 1);
      setRecordingProgress(Math.round(progress * 100));

      // Find active lyric index
      let activeIdx = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (audioTime >= lyrics[i].startTime && lyrics[i].startTime > 0) activeIdx = i;
      }
      if (activeIdx === -1 && lyrics.length > 0 && audioTime >= lyrics[0].startTime) activeIdx = 0;

      // Background
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, W, H);

      // Glow blob
      const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W, H) * 0.55);
      grd.addColorStop(0, 'rgba(34,197,94,0.18)');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Draw lyrics — show active ±3 lines
      const FONT_ACTIVE = 'black 88px Inter, sans-serif';
      const FONT_OTHER = 'black 60px Inter, sans-serif';
      const LINE_H_ACTIVE = 110;
      const LINE_H_OTHER = 80;
      const CENTER_Y = H / 2;

      const showFrom = Math.max(0, activeIdx - 3);
      const showTo = Math.min(lyrics.length - 1, activeIdx + 3);

      // Calculate Y positions around center
      const positions: { text: string; y: number; isActive: boolean; dist: number }[] = [];
      let y = CENTER_Y;
      // Active lyric at center
      if (activeIdx >= 0) {
        positions.push({ text: lyrics[activeIdx].text, y: CENTER_Y, isActive: true, dist: 0 });
        // Lines above
        let yAbove = CENTER_Y - LINE_H_ACTIVE / 2 - LINE_H_OTHER / 2;
        for (let i = activeIdx - 1; i >= showFrom; i--) {
          positions.push({ text: lyrics[i].text, y: yAbove, isActive: false, dist: activeIdx - i });
          yAbove -= LINE_H_OTHER;
        }
        // Lines below
        let yBelow = CENTER_Y + LINE_H_ACTIVE / 2 + LINE_H_OTHER / 2;
        for (let i = activeIdx + 1; i <= showTo; i++) {
          positions.push({ text: lyrics[i].text, y: yBelow, isActive: false, dist: i - activeIdx });
          yBelow += LINE_H_OTHER;
        }
      } else {
        // No active lyric yet — show first few upcoming faded
        const startY = CENTER_Y - ((Math.min(3, lyrics.length) - 1) * LINE_H_OTHER) / 2;
        for (let i = 0; i < Math.min(4, lyrics.length); i++) {
          positions.push({ text: lyrics[i].text, y: startY + i * LINE_H_OTHER, isActive: false, dist: i + 1 });
        }
      }

      for (const { text, y: posY, isActive, dist } of positions) {
        const alpha = isActive ? 1 : Math.max(0.08, 0.45 - dist * 0.12);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = isActive ? FONT_ACTIVE : FONT_OTHER;
        ctx.fillStyle = isActive ? COLORS.active : COLORS.past;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isActive) {
          // Glow shadow
          ctx.shadowColor = 'rgba(255,255,255,0.9)';
          ctx.shadowBlur = 40;
          ctx.fillText(text, W / 2, posY);
          ctx.shadowBlur = 80;
          ctx.globalAlpha = alpha * 0.4;
          ctx.fillText(text, W / 2, posY);
        } else {
          ctx.fillText(text, W / 2, posY);
        }
        ctx.restore();
      }

      // Progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, H - 6, W, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, H - 6, W * progress, 6);

      if (progress < 1 && !audioRef.current?.ended) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };

    requestAnimationFrame(drawFrame);
  };


  // Seek audio
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };

  // Step order for navigation
  const steps = ['upload', 'lyrics', 'sync', 'preview'] as const;
  const stepIndex = steps.indexOf(state.step);

  const canNavigateTo = (target: typeof steps[number]) => {
    const targetIdx = steps.indexOf(target);
    // Can go back to any completed step, but not forward
    return targetIdx < stepIndex;
  };

  const navigateToStep = (target: typeof steps[number]) => {
    if (canNavigateTo(target)) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      setState(prev => ({ ...prev, step: target }));
    }
  };

  // Find active lyric index for preview
  const getActiveLyricIndex = useCallback(() => {
    let idx = -1;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (currentTime >= state.lyrics[i].startTime && state.lyrics[i].startTime > 0) {
        idx = i;
      }
    }
    // fallback: if currentTime >= first lyric's startTime (which can be 0.1)
    if (idx === -1 && state.lyrics.length > 0 && currentTime >= state.lyrics[0].startTime) {
      idx = 0;
    }
    return idx;
  }, [currentTime, state.lyrics]);

  // Scroll active lyric into center in preview
  useEffect(() => {
    if (state.step !== 'preview') return;
    const activeIdx = getActiveLyricIndex();
    if (activeIdx < 0 || activeIdx === prevActiveIdxRef.current) return;
    prevActiveIdxRef.current = activeIdx;

    const container = previewScrollRef.current;
    if (!container) return;
    const activeEl = container.children[activeIdx + 1] as HTMLElement; // +1 for top spacer div
    if (!activeEl) return;

    const containerH = container.offsetHeight;
    const scrollTarget = activeEl.offsetTop - containerH / 2 + activeEl.offsetHeight / 2;
    container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  }, [currentTime, state.step, getActiveLyricIndex]);

  // Reset preview scroll position when entering preview
  useEffect(() => {
    if (state.step === 'preview') {
      prevActiveIdxRef.current = -1;
      if (previewScrollRef.current) {
        previewScrollRef.current.scrollTo({ top: 0 });
      }
    }
  }, [state.step]);

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
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <button 
                onClick={() => navigateToStep(s)}
                disabled={!canNavigateTo(s)}
                className={cn(
                  "text-xs font-medium uppercase tracking-widest transition-all",
                  state.step === s ? "opacity-100 text-green-500" : 
                  canNavigateTo(s) ? "opacity-60 hover:opacity-100 hover:text-green-400 cursor-pointer" : "opacity-30 cursor-default"
                )}
              >
                {s}
              </button>
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
              <p className="text-white/50 text-lg mb-10 max-w-lg mx-auto">
                Tampilan simpel bergaya Spotify. Masukkan audio, lirik, dan sinkronkan hanya dengan satu jari.
              </p>

              {/* Tab switcher */}
              <div className="inline-flex gap-1 bg-white/5 border border-white/10 p-1 rounded-2xl mb-8">
                <button
                  onClick={() => setUploadTab('file')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    uploadTab === 'file'
                      ? 'bg-white text-black shadow'
                      : 'text-white/50 hover:text-white'
                  )}
                >
                  <Upload size={15} /> Upload File
                </button>
                <button
                  onClick={() => setUploadTab('url')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    uploadTab === 'url'
                      ? 'bg-white text-black shadow'
                      : 'text-white/50 hover:text-white'
                  )}
                >
                  <Link size={15} /> Link URL
                </button>
              </div>

              <AnimatePresence mode="wait">
                {uploadTab === 'file' ? (
                  <motion.div key="file-tab" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
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
                ) : (
                  <motion.div key="url-tab" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="w-full max-w-xl mx-auto space-y-4">
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                        <Link size={20} />
                      </div>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !urlLoading && handleUrlLoad()}
                        placeholder="Paste link YouTube, SoundCloud, dll..."
                        className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-base focus:outline-none focus:border-green-500/60 transition-colors placeholder:text-white/25"
                      />
                    </div>

                    <button
                      onClick={handleUrlLoad}
                      disabled={!urlInput.trim() || urlLoading}
                      className="w-full py-4 bg-green-500 text-black font-black text-lg rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100"
                    >
                      {urlLoading ? (
                        <><Loader2 className="animate-spin" size={22} /> Memuat Audio...</>
                      ) : (
                        <><Download size={22} /> Muat dari URL</>
                      )}
                    </button>

                    <p className="text-white/30 text-xs">
                      ⚠️ Pastikan server backend sudah berjalan (<code className="text-white/50">npm run dev</code>).
                      YouTube, SoundCloud, dan 1000+ situs lainnya didukung.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
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
                          {isPlaying ? "Klik area ini atau tekan SPASI setiap kali lirik selesai" : "Putar lagu untuk mulai sinkron"}
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
                  <div className="flex items-center gap-2 mx-2">
                    <button onClick={() => setVolume(v => v > 0 ? 0 : 0.8)} className="opacity-50 hover:opacity-100 transition-opacity">
                      {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      type="range"
                      min="0" max="1" step="0.01"
                      value={volume}
                      onChange={e => setVolume(Number(e.target.value))}
                      className="volume-slider w-16"
                    />
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

          {state.step === 'preview' && (() => {
            const activeIdx = getActiveLyricIndex();
            return (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div id="lyrics-video-container" className="relative aspect-[9/16] md:aspect-video w-full bg-[#121212] rounded-[40px] overflow-hidden shadow-2xl shadow-green-500/10 border border-white/10">
                {/* Visualizer Background */}
                <div className="absolute inset-0 pointer-events-none opacity-30">
                  <div className={cn(
                    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-green-500 blur-[100px] rounded-full transition-opacity duration-1000",
                    activeIdx >= 0 ? "opacity-100 animate-pulse" : "opacity-40"
                  )} />
                </div>

                <div className="absolute inset-0 p-8 md:p-12 flex flex-col justify-center">
                  <div className="h-[80%] relative">
                    {/* Gradient overlays */}
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#121212] via-[#121212]/80 to-transparent z-10 pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#121212] via-[#121212]/80 to-transparent z-10 pointer-events-none" />
                    
                    {/* Scrollable lyrics container */}
                    <div 
                      ref={previewScrollRef}
                      className="h-full overflow-y-auto scrollbar-hide"
                    >
                      {/* Top spacer for centering first lyric */}
                      <div className="h-[45%]" />
                      {state.lyrics.map((l, i) => {
                        const isActive = i === activeIdx;
                        const isPast = i < activeIdx;
                        return (
                          <motion.div 
                            key={l.id}
                            animate={isActive ? { scale: 1.06 } : { scale: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="py-4 md:py-5 px-4 md:px-8 text-center"
                          >
                            <p
                              className={cn(
                                "font-black tracking-tight transition-all duration-500 leading-tight",
                                isActive 
                                  ? "text-4xl md:text-5xl lg:text-6xl text-white opacity-100" 
                                  : isPast
                                    ? "text-2xl md:text-3xl text-white/30 opacity-100"
                                    : "text-2xl md:text-3xl text-white/20 blur-[1.5px]"
                              )}
                              style={isActive ? {
                                textShadow: [
                                  '0 0 20px rgba(255,255,255,0.95)',
                                  '0 0 50px rgba(255,255,255,0.7)',
                                  '0 0 100px rgba(255,255,255,0.4)',
                                  '0 0 180px rgba(34,197,94,0.3)',
                                ].join(', ')
                              } : {
                                textShadow: isPast
                                  ? '0 0 8px rgba(255,255,255,0.15)'
                                  : 'none'
                              }}
                            >
                              {l.text}
                            </p>
                          </motion.div>
                        );
                      })}
                      {/* Bottom spacer for centering last lyric */}
                      <div className="h-[45%]" />
                    </div>
                  </div>
                </div>

                {/* Seekable Progress bar at bottom */}
                <div 
                  className="absolute bottom-0 inset-x-0 h-2 bg-white/10 cursor-pointer group hover:h-3 transition-all"
                  onClick={handleSeek}
                >
                  <div 
                    className="h-full bg-green-500 transition-[width] duration-75 relative"
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
                  </div>
                </div>
              </div>

              {/* Preview Controls */}
              <div className="space-y-4">
                {/* Timestamp */}
                <div className="flex justify-between items-center px-2">
                  <span className="font-mono text-sm text-white/50 tabular-nums">{formatTime(currentTime)}</span>
                  <span className="font-mono text-sm text-white/50 tabular-nums">{formatTime(duration)}</span>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
                  {/* Volume */}
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-3 rounded-full">
                    <button onClick={() => setVolume(v => v > 0 ? 0 : 0.8)} className="opacity-60 hover:opacity-100 transition-opacity">
                      {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min="0" max="1" step="0.01"
                      value={volume}
                      onChange={e => setVolume(Number(e.target.value))}
                      className="volume-slider w-20"
                    />
                  </div>

                  <button 
                    onClick={handlePreviewToggle}
                    className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform active:scale-95 shadow-xl shadow-white/10"
                  >
                    {isPlaying ? <Pause size={28} /> : <Play size={28} fill="currentColor" />}
                  </button>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setState(prev => ({ ...prev, step: 'sync' }))}
                      className="bg-white/5 border border-white/10 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-white/10 transition-colors text-sm"
                    >
                      <RotateCcw size={18} />
                      Ulang Sinkron
                    </button>
                    <button 
                      onClick={handleRecord}
                      disabled={recording}
                      className={cn(
                        "px-8 py-3 rounded-full font-black text-lg flex items-center gap-2 shadow-lg transition-all",
                        recording
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40 cursor-not-allowed'
                          : 'bg-green-500 text-black hover:scale-105 shadow-green-500/20'
                      )}
                    >
                      {recording ? (
                        <>
                          <Sparkles className="animate-spin" size={20} />
                          Merekam {recordingProgress}%
                        </>
                      ) : (
                        <>
                          <Download size={20} />
                          Download MP4
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })()}
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
              <a href="#" className="text-[10px] font-medium tracking-[0.3em] uppercase">powered by Glabs Studio</a>
           </div>
        </div>
      </footer>

      {/* Hidden Audio Player */}
      {state.audioUrl && (
        <audio 
          ref={audioRef}
          src={state.audioUrl}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration);
              audioRef.current.volume = volume;
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-2xl shadow-2xl max-w-sm"
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
              toast.type === 'success' ? 'bg-green-500/20 text-green-400' :
              toast.type === 'error' ? 'bg-red-500/20 text-red-400' :
              'bg-blue-500/20 text-blue-400'
            )}>
              {toast.type === 'success' ? <Check size={16} /> : <Info size={16} />}
            </div>
            <p className="text-sm font-medium">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording Overlay */}
      <AnimatePresence>
        {recording && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6 pointer-events-none"
          >
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="54"
                  fill="none" stroke="#22c55e" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (1 - recordingProgress / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-black tabular-nums">{recordingProgress}%</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">Merekam Video...</p>
              <p className="text-white/50 text-sm mt-1">Jangan tutup tab ini</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden canvas for video recording */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
