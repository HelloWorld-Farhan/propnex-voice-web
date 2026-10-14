"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Check, Copy, Pause, Play, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type RecordingPlayerProps = {
  durationSeconds: number;
  audioUrl?: string | null;
  label?: string;
  compact?: boolean;
  className?: string;
  showCopyUrl?: boolean;
  onDurationChange?: (actualDurationSec: number) => void;
};

declare global {
  interface Window {
    __propnexActiveAudio?: HTMLAudioElement | null;
    __propnexActivePlayerId?: string | null;
  }
}

export function RecordingPlayer({
  durationSeconds,
  audioUrl,
  label = "Recording",
  compact = false,
  className,
  showCopyUrl = true,
  onDurationChange,
}: RecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number>(durationSeconds > 0 ? durationSeconds : 0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerId = useRef<string>(Math.random().toString(36).substring(2));
  const retryCountRef = useRef<number>(0);

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(audioUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = audioUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy recording URL:", err);
    }
  };

  useEffect(() => {
    if (durationSeconds > 0) {
      setMediaDuration(durationSeconds);
    }
  }, [durationSeconds]);

  // Global listener: pause this player immediately whenever any other player starts
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeId = customEvent.detail?.playerId;
      if (activeId && activeId !== playerId.current) {
        if (audioRef.current) {
          try {
            audioRef.current.pause();
          } catch {}
        }
        setIsPlaying(false);
        setIsBuffering(false);
      }
    };
    window.addEventListener("recording-play", handleGlobalPlay);
    return () => window.removeEventListener("recording-play", handleGlobalPlay);
  }, []);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
        if (window.__propnexActivePlayerId === playerId.current) {
          window.__propnexActiveAudio = null;
          window.__propnexActivePlayerId = null;
        }
        audioRef.current = null;
      }
    };
  }, []);

  const getOrCreateAudio = useCallback((forceRefresh = false) => {
    if (audioRef.current && !forceRefresh) return audioRef.current;
    if (!audioUrl) return null;

    let proxyUrl = audioUrl.startsWith("http") && !audioUrl.includes("/api/audio-proxy")
      ? `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`
      : audioUrl;

    if (forceRefresh && proxyUrl.includes("/api/audio-proxy")) {
      proxyUrl += `&t=${Date.now()}`;
    }

    const audio = new Audio(proxyUrl);
    audio.preload = "none"; // STRICT: Do not eagerly download whole file on mount

    const syncDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        const rounded = Math.round(audio.duration);
        setMediaDuration(rounded);
        if (onDurationChange && rounded > 0 && rounded !== durationSeconds) {
          onDurationChange(rounded);
        }
      }
    };

    audio.addEventListener("timeupdate", () => {
      setProgress(audio.currentTime);
      syncDuration();
    });

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);

    audio.addEventListener("canplay", () => {
      syncDuration();
      setIsBuffering(false);
      setHasError(false);
      retryCountRef.current = 0;
    });

    audio.addEventListener("canplaythrough", () => {
      setIsBuffering(false);
    });

    audio.addEventListener("waiting", () => {
      setIsBuffering(true);
    });

    audio.addEventListener("stalled", () => {
      setIsBuffering(false);
    });

    audio.addEventListener("playing", () => {
      setIsBuffering(false);
      setIsPlaying(true);
      setHasError(false);
    });

    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      setIsBuffering(false);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setProgress(0);
      audio.currentTime = 0;
      if (window.__propnexActivePlayerId === playerId.current) {
        window.__propnexActiveAudio = null;
        window.__propnexActivePlayerId = null;
      }
    });

    audio.addEventListener("error", (e) => {
      setIsBuffering(false);
      console.warn("Audio error encountered:", e);
      if (retryCountRef.current < 2) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (audioRef.current && audioUrl) {
            try {
              audioRef.current.src = `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}&t=${Date.now()}`;
              audioRef.current.load();
              audioRef.current.play().then(() => {
                setIsPlaying(true);
                setIsBuffering(false);
                setHasError(false);
              }).catch(() => {
                setIsBuffering(false);
                setHasError(true);
              });
            } catch {}
          }
        }, 500);
        return;
      }
      setIsBuffering(false);
      setIsPlaying(false);
      setHasError(true);
    });

    audioRef.current = audio;
    return audio;
  }, [audioUrl, durationSeconds, onDurationChange]);

  // Watchdog: Never stay stuck on loading for > 5 seconds
  useEffect(() => {
    if (!isBuffering) return;
    const watchdog = setTimeout(() => {
      setIsBuffering(false);
    }, 5000);
    return () => clearTimeout(watchdog);
  }, [isBuffering]);

  const currentDuration = mediaDuration > 0 ? mediaDuration : (durationSeconds > 0 ? durationSeconds : 0);

  const handleToggle = () => {
    if (!audioUrl) return;

    // If previously in error or retry state, re-instantiate fresh audio
    const audio = hasError ? getOrCreateAudio(true) : getOrCreateAudio();
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
      if (window.__propnexActivePlayerId === playerId.current) {
        window.__propnexActiveAudio = null;
        window.__propnexActivePlayerId = null;
      }
    } else {
      // Immediately stop any other audio currently playing across the app
      if (window.__propnexActiveAudio && window.__propnexActiveAudio !== audio) {
        try {
          window.__propnexActiveAudio.pause();
        } catch {}
      }
      window.__propnexActiveAudio = audio;
      window.__propnexActivePlayerId = playerId.current;

      // Broadcast to all other player instances to reset their playing state
      window.dispatchEvent(
        new CustomEvent("recording-play", { detail: { playerId: playerId.current } })
      );

      if (currentDuration > 0 && progress >= currentDuration) {
        audio.currentTime = 0;
        setProgress(0);
      }
      setIsBuffering(true);
      setHasError(false);

      audio.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch((err) => {
        console.warn("audio.play() failed:", err);
        setIsBuffering(false);
        // Retry once via proxy with timestamp cache buster
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1;
          audio.src = `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}&t=${Date.now()}`;
          audio.play().then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setHasError(false);
          }).catch(() => {
            setIsBuffering(false);
            setHasError(true);
          });
        } else {
          setHasError(true);
        }
      });
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setIsBuffering(false);
    retryCountRef.current = 0;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {}
      audioRef.current = null;
    }
    const audio = getOrCreateAudio(true);
    if (audio) {
      handleToggle();
    }
  };

  const progressPercent = currentDuration > 0 ? Math.min(100, Math.max(0, (progress / currentDuration) * 100)) : 0;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {hasError ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRetry}
            aria-label="Retry playing recording"
            title="Click to retry playback"
            className="h-7 w-7 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
          >
            <RotateCw className="size-3.5" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon-sm"
            type="button"
            onClick={handleToggle}
            disabled={!audioUrl}
            aria-label={isPlaying ? "Pause recording" : "Play recording"}
            className="h-7 w-7 rounded-lg transition-transform active:scale-95"
          >
            {isBuffering ? (
              <span className="size-3.5 border-[1.5px] border-muted-foreground border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="size-3.5 text-primary" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
        )}
        <span className="text-xs tabular-nums text-muted-foreground min-w-[70px]">
          {formatTime(progress)} / {formatTime(currentDuration)}
        </span>
        {showCopyUrl && audioUrl && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCopyUrl}
            className="h-6 px-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded hover:bg-white/10"
            title={copied ? "Copied recording URL!" : "Copy recording URL"}
            aria-label={copied ? "Copied recording URL" : "Copy recording URL"}
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Copied</span>
              </>
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "glass-card rounded-xl p-4 space-y-3 min-w-[220px]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTime(progress)} / {formatTime(currentDuration)}
          </span>
          {showCopyUrl && audioUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              className="h-6 px-1.5 py-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded border-border/70 bg-background/50 hover:bg-accent hover:text-accent-foreground transition-colors"
              title={copied ? "Copied recording URL!" : "Copy recording URL"}
              aria-label={copied ? "Copied recording URL" : "Copy recording URL"}
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-400" />
                  <span className="text-[11px] font-medium text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span className="text-[11px] font-medium">Copy URL</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {hasError ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="w-full text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
          onClick={handleRetry}
        >
          <RotateCw className="size-4 mr-1.5" />
          Retry Playback
        </Button>
      ) : (
        <Button
          variant={isPlaying ? "secondary" : "default"}
          size="sm"
          type="button"
          className="w-full"
          onClick={handleToggle}
          disabled={!audioUrl}
        >
          {isBuffering ? (
            <>
              <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
              Loading...
            </>
          ) : isPlaying ? (
            <>
              <Pause className="size-4 mr-1.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="size-4 mr-1.5" />
              Play Recording
            </>
          )}
        </Button>
      )}
    </div>
  );
}
