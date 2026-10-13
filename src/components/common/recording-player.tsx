"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number>(durationSeconds > 0 ? durationSeconds : 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (durationSeconds > 0) {
      setMediaDuration(durationSeconds);
    }
  }, [durationSeconds]);

  // Global listener: pause this player when another starts playing
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== audioUrl && isPlaying) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setIsBuffering(false);
      }
    };
    window.addEventListener("recording-play", handleGlobalPlay);
    return () => window.removeEventListener("recording-play", handleGlobalPlay);
  }, [audioUrl, isPlaying]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const getOrCreateAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (!audioUrl) return null;

    const proxyUrl = audioUrl.startsWith("http") && !audioUrl.includes("/api/audio-proxy")
      ? `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`
      : audioUrl;

    const audio = new Audio(proxyUrl);
    audio.preload = "metadata";

    const syncDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setMediaDuration(Math.round(audio.duration));
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
    });

    audio.addEventListener("playing", () => {
      setIsBuffering(false);
      setIsPlaying(true);
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
    });

    audio.addEventListener("error", () => {
      setIsBuffering(false);
      setIsPlaying(false);
      setHasError(true);
    });

    audioRef.current = audio;
    return audio;
  }, [audioUrl]);

  const currentDuration = mediaDuration > 0 ? mediaDuration : (durationSeconds > 0 ? durationSeconds : 0);

  const handleToggle = () => {
    if (!audioUrl) return;

    const audio = getOrCreateAudio();
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    } else {
      if (currentDuration > 0 && progress >= currentDuration) {
        audio.currentTime = 0;
        setProgress(0);
      }
      setIsBuffering(true);
      audio.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
        window.dispatchEvent(new CustomEvent("recording-play", { detail: audioUrl }));
      }).catch((err) => {
        setIsBuffering(false);
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          console.error("Audio playback error:", err);
          setHasError(true);
        }
      });
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setIsBuffering(false);
    if (audioRef.current) {
      audioRef.current.src = "";
      audioRef.current = null;
    }
    const audio = getOrCreateAudio();
    if (audio) {
      audio.load();
    }
  };

  const progressPercent = currentDuration > 0 ? (progress / currentDuration) * 100 : 0;

  if (compact) {
    if (hasError) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <span className="text-xs text-muted-foreground">Not found</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleRetry();
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
          onMouseEnter={() => getOrCreateAudio()}
          disabled={!audioUrl}
          aria-label={isPlaying ? "Pause recording" : "Play recording"}
          className="h-7 w-7 rounded-lg"
        >
          {isBuffering ? (
            <span className="size-3.5 border-[1.5px] border-muted-foreground border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground min-w-[70px]">
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
          onClick={handleRetry}
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
        onMouseEnter={() => getOrCreateAudio()}
        disabled={!audioUrl}
      >
        {isBuffering ? (
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
