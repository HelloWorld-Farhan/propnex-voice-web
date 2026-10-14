"use client";

import { useEffect, useState, useRef, useId, useCallback } from "react";
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
  const [cacheBuster, setCacheBuster] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerId = useId();

  // Compute the safe audio proxy URL
  const proxyUrl = audioUrl
    ? audioUrl.startsWith("http") && !audioUrl.includes("/api/audio-proxy")
      ? `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}${cacheBuster > 0 ? `&t=${cacheBuster}` : ""}`
      : audioUrl
    : "";

  useEffect(() => {
    if (durationSeconds > 0) {
      setMediaDuration(durationSeconds);
    }
  }, [durationSeconds]);

  // Global listener: pause this player whenever any other player starts
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeId = customEvent.detail?.playerId;
      if (activeId && activeId !== playerId) {
        if (audioRef.current && !audioRef.current.paused) {
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
  }, [playerId]);

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.preventDefault();
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

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!audioUrl || !audioRef.current) return;

    const audio = audioRef.current;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    } else {
      // Pause all other audio elements on the document
      document.querySelectorAll("audio").forEach((el) => {
        if (el !== audio && !el.paused) {
          try { el.pause(); } catch {}
        }
      });

      // Broadcast event so other RecordingPlayer states update
      window.dispatchEvent(
        new CustomEvent("recording-play", { detail: { playerId } })
      );

      // If finished, seek back to beginning
      if (currentDuration > 0 && audio.currentTime >= currentDuration) {
        try { audio.currentTime = 0; } catch {}
        setProgress(0);
      }

      setIsBuffering(true);
      setHasError(false);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setHasError(false);
          })
          .catch((err) => {
            console.warn("audio.play() rejected:", err);
            setIsBuffering(false);
            setIsPlaying(false);
            setHasError(true);
          });
      }
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHasError(false);
    setIsBuffering(true);
    setCacheBuster(Date.now());

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.load();
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setIsBuffering(false);
              setHasError(false);
            })
            .catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
              setHasError(true);
            });
        }
      }
    }, 150);
  };

  const currentDuration = mediaDuration > 0 ? mediaDuration : (durationSeconds > 0 ? durationSeconds : 0);
  const progressPercent = currentDuration > 0 ? Math.min(100, Math.max(0, (progress / currentDuration) * 100)) : 0;

  return (
    <>
      {/* Real HTML5 Audio Element in DOM */}
      {proxyUrl && (
        <audio
          ref={audioRef}
          src={proxyUrl}
          preload="none"
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setHasError(false);
          }}
          onPause={() => {
            setIsPlaying(false);
            setIsBuffering(false);
          }}
          onPlaying={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setHasError(false);
          }}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            setHasError(false);
          }}
          onTimeUpdate={(e) => {
            setProgress(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
              const rounded = Math.round(dur);
              setMediaDuration(rounded);
              if (onDurationChange && rounded > 0 && rounded !== durationSeconds) {
                onDurationChange(rounded);
              }
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setIsBuffering(false);
            setProgress(0);
          }}
          onError={(e) => {
            console.error("DOM audio error encountered:", e);
            setIsBuffering(false);
            setIsPlaying(false);
            setHasError(true);
          }}
          style={{ display: "none" }}
        />
      )}

      {compact ? (
        <div className={cn("flex items-center gap-2", className)}>
          {hasError ? (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={handleRetry}
              aria-label="Retry playing recording"
              title="Click to retry playback"
              className="h-7 w-7 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
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
              className="h-7 w-7 rounded-lg transition-transform active:scale-95 cursor-pointer"
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
              className="h-6 px-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded hover:bg-white/10 cursor-pointer"
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
      ) : (
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
                  className="h-6 px-1.5 py-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded border-border/70 bg-background/50 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
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

          <div 
            className="h-1.5 overflow-hidden rounded-full bg-white/10 cursor-pointer"
            onClick={(e) => {
              if (!audioRef.current || currentDuration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
              const newTime = newPercent * currentDuration;
              audioRef.current.currentTime = newTime;
              setProgress(newTime);
            }}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {hasError ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="w-full text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
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
              className="w-full cursor-pointer"
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
      )}
    </>
  );
}
