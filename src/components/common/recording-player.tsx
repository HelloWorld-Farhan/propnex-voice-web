"use client";

import { useEffect, useState, useRef } from "react";
import { Pause, Play, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
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
};

export function RecordingPlayer({
  durationSeconds,
  audioUrl,
  label = "Recording",
  compact = false,
  className,
}: RecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(() => {
    if (typeof window !== 'undefined' && audioUrl) {
      return localStorage.getItem(`rec_fail_${audioUrl}`) === 'true';
    }
    return false;
  });
  const [isValidating, setIsValidating] = useState(() => {
    if (typeof window !== 'undefined' && audioUrl) {
      if (localStorage.getItem(`rec_fail_${audioUrl}`) === 'true') return false;
      if (localStorage.getItem(`rec_ok_${audioUrl}`) === 'true') return false;
    }
    return !!audioUrl;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Exclusive playback listener
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== audioUrl && isPlaying) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      }
    };
    window.addEventListener("recording-play", handleGlobalPlay);
    return () => window.removeEventListener("recording-play", handleGlobalPlay);
  }, [audioUrl, isPlaying]);

  const [mediaDuration, setMediaDuration] = useState<number>(durationSeconds > 0 ? durationSeconds : 0);
  const [retryCount, setRetryCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const durationRef = useRef(durationSeconds);
  
  useEffect(() => {
    durationRef.current = durationSeconds;
    if (durationSeconds > 0) {
      setMediaDuration(durationSeconds);
    }
  }, [durationSeconds]);

  // Initialize the audio element when the URL is available
  useEffect(() => {
    if (!audioUrl || hasError) return; // Skip initialization if already marked as error from cache

    let isMounted = true;
    setIsValidating(true);

    const proxyUrl = audioUrl.startsWith('http') && !audioUrl.includes('/api/audio-proxy') 
      ? `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`
      : audioUrl;

    const buster = (retryCount > 0 || reloadKey > 0) ? (proxyUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`) : '';
    const audio = new Audio(proxyUrl + buster);
    
    // Always load metadata so audio duration and stream readiness are known
    audio.preload = "metadata";
    audio.load();
    
    audioRef.current = audio;

    const syncDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setMediaDuration(Math.round(audio.duration));
      }
    };

    const updateTime = () => {
      setProgress(audio.currentTime);
      syncDuration();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      const finalDur = durationRef.current > 0 ? durationRef.current : (audio.duration || 0);
      setProgress(finalDur > 0 ? finalDur : 0);
    };

    const handleError = () => {
      if (!isMounted) return;
      // Bonvoice recordings can take up to 60-90s to process after call ends.
      // Retry with exponential backoff: 3s, 6s, 12s, 20s, 30s, 30s = up to ~100s
      const delays = [3000, 6000, 12000, 20000, 30000, 30000];
      if (retryCount < delays.length) {
        const delay = delays[retryCount];
        setTimeout(() => {
          if (isMounted) setRetryCount((prev) => prev + 1);
        }, delay);
      } else {
        setHasError(true);
        setIsValidating(false);
        setIsPlaying(false);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`rec_fail_${audioUrl}`, 'true');
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (!isMounted) return;
      syncDuration();
      setHasError(false);
      setIsValidating(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`rec_fail_${audioUrl}`);
        localStorage.setItem(`rec_ok_${audioUrl}`, 'true');
      }
    };

    if (audio.readyState >= 1) {
      syncDuration();
      setIsValidating(false);
    }

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleLoadedMetadata);
    audio.addEventListener("canplay", handleLoadedMetadata);

    return () => {
      isMounted = false;
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleLoadedMetadata);
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl, retryCount, reloadKey]);

  const currentDuration = mediaDuration > 0 ? mediaDuration : (durationSeconds > 0 ? durationSeconds : (audioRef.current?.duration || 0));

  const handleToggle = () => {
    if (!audioRef.current) {
      if (audioUrl) {
        window.open(audioUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current.readyState === 0) {
        audioRef.current.load();
      }
      // If we finished, restart
      if (currentDuration > 0 && progress >= currentDuration) {
        audioRef.current.currentTime = 0;
        setProgress(0);
      }
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration) && isFinite(audioRef.current.duration)) {
          setMediaDuration(Math.round(audioRef.current.duration));
        }
        // Dispatch event so other players pause
        window.dispatchEvent(new CustomEvent("recording-play", { detail: audioUrl }));
      }).catch(err => {
        console.error("Failed to play audio:", err);
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          setHasError(true);
        }
      });
    }
  };
  const progressPercent = currentDuration > 0 ? (progress / currentDuration) * 100 : 0;

  if (compact) {
    if (hasError) {
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <span className="text-xs text-destructive flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-destructive animate-pulse" />
            Not found
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              // Clear cached failure so retry works fresh
              if (typeof window !== 'undefined' && audioUrl) {
                localStorage.removeItem(`rec_fail_${audioUrl}`);
              }
              setHasError(false);
              setIsValidating(true);
              setRetryCount(0);
              setReloadKey(k => k + 1);
            }}
            aria-label="Retry loading recording"
            title="Retry loading recording"
          >
            <RotateCw className="size-3" />
          </Button>
        </div>
      );
    }

    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleToggle}
          disabled={!audioUrl || isValidating}
          aria-label={isPlaying ? "Pause recording" : "Play recording"}
        >
          {isValidating ? (
            <span className="size-3.5 border-[1.5px] border-muted-foreground border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
        <span className="text-xs text-muted-foreground min-w-[70px]">
          {formatTime(progress)} / {formatTime(currentDuration)}
        </span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={cn(
          "glass-card rounded-xl p-4 space-y-3 min-w-[220px] flex flex-col items-center justify-center",
          className
        )}
      >
        <span className="text-xs font-medium text-destructive">Recording Not Found</span>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={() => {
            setHasError(false);
            setIsValidating(true);
            setRetryCount(0);
            setReloadKey(k => k + 1);
          }}
        >
          <RotateCw className="size-3.5 mr-1.5" />
          Retry
        </Button>
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
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatTime(progress)} / {formatTime(currentDuration)}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <Button
        variant={isPlaying ? "secondary" : "default"}
        size="sm"
        className="w-full"
        onClick={handleToggle}
        disabled={!audioUrl || isValidating}
      >
        {isValidating ? (
          <>
            <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
            Loading...
          </>
        ) : isPlaying ? (
          <>
            <Pause className="size-4 mr-1" />
            Pause
          </>
        ) : (
          <>
            <Play className="size-4 mr-1" />
            Play Recording
          </>
        )}
      </Button>
    </div>
  );
}
