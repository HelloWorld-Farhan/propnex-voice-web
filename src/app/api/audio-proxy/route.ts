import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CachedAudio = {
  buffer: Buffer;
  contentType: string;
  cachedAt: number;
};

// Global in-memory cache for audio buffers to avoid repeated PBX downloads
const globalAudioCache = new Map<string, CachedAudio>();
const MAX_CACHE_ITEMS = 150;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function detectAudioMimeType(buffer: Buffer, fallbackHeader: string | null): string {
  if (buffer.length >= 12) {
    // RIFF WAVE format: "RIFF" at 0..3 and "WAVE" at 8..11
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
    ) {
      return "audio/wav";
    }
    // ID3 tag (MP3 container): "ID3" at 0..2
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return "audio/mpeg";
    }
    // Ogg container: "OggS" at 0..3
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return "audio/ogg";
    }
    // MP4/M4A: "ftyp" at 4..7
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      return "audio/mp4";
    }
    // Raw MP3 frame header (0xFF followed by 0xE0 or higher bits)
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
      return "audio/mpeg";
    }
  }

  if (fallbackHeader) {
    const lower = fallbackHeader.toLowerCase();
    if (lower.includes("wav")) return "audio/wav";
    if (lower.includes("ogg")) return "audio/ogg";
    if (lower.includes("mp4") || lower.includes("m4a")) return "audio/mp4";
    if (lower.includes("mpeg") || lower.includes("mp3")) return "audio/mpeg";
  }

  return "audio/mpeg";
}

// Global in-flight fetch deduplication map
const pendingFetches = new Map<string, Promise<CachedAudio>>();

async function fetchAudioFromUpstream(fetchUrl: string): Promise<CachedAudio> {
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "audio/*,video/*,*/*",
  };

  const bonvoiceToken = process.env.BONVOICE_TOKEN;
  if (
    bonvoiceToken &&
    (fetchUrl.includes("bonvoice.com") || fetchUrl.includes("pbx.bonvoice") || fetchUrl.includes("backend.pbx"))
  ) {
    upstreamHeaders["Authorization"] = `Token ${bonvoiceToken}`;
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const upstream = await fetch(fetchUrl, {
        headers: upstreamHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });

      if (!upstream.ok) {
        throw new Error(`Upstream error: ${upstream.status}`);
      }

      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Incomplete PBX file stub check (telephony server writing header)
      if (buffer.length <= 1000 && attempt === 1) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      const rawContentType = upstream.headers.get("content-type") || "";
      const isHtmlResponse =
        rawContentType.toLowerCase().includes("text/html") ||
        (buffer.length >= 5 &&
          buffer[0] === 0x3c &&
          (buffer[1] === 0x21 || buffer[1] === 0x68 || buffer[1] === 0x48));

      if (isHtmlResponse) {
        throw new Error("Upstream returned HTML instead of audio (auth failure?)");
      }

      const contentType = detectAudioMimeType(buffer, rawContentType);
      return {
        buffer,
        contentType,
        cachedAt: Date.now(),
      };
    } catch (err: any) {
      lastError = err;
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastError || new Error("Failed to fetch audio from upstream");
}

/**
 * Audio Proxy — bypasses CORS and resolves upstream MIME/encoding mismatches.
 * Caches audio in memory so repeat seeks, multiple rows, or table refreshes are instant.
 * Deduplicates in-flight requests so concurrent browser range requests share a single fetch.
 * Usage: /api/audio-proxy?url=<encoded_url>
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let fetchUrl = rawUrl;

  // Convert Google Drive share/view URLs to direct download
  if (rawUrl.includes("drive.google.com")) {
    const match = rawUrl.match(/(?:\/d\/|id=|\/file\/d\/)([a-zA-Z0-9_-]{10,})/);
    if (match) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${match[1]}&confirm=t`;
    }
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1" || req.nextUrl.searchParams.has("t");

  try {
    let audioData = forceRefresh ? undefined : globalAudioCache.get(fetchUrl);

    // Evict incomplete stubs or expired entries
    if (!audioData || audioData.buffer.length <= 1000 || Date.now() - audioData.cachedAt > CACHE_TTL_MS) {
      if (audioData && audioData.buffer.length <= 1000) {
        globalAudioCache.delete(fetchUrl);
      }

      // In-flight deduplication: coalesce multiple requests for the same URL onto one fetch
      let fetchPromise = pendingFetches.get(fetchUrl);
      if (!fetchPromise) {
        fetchPromise = fetchAudioFromUpstream(fetchUrl)
          .then((data) => {
            if (data.buffer.length > 1000) {
              if (globalAudioCache.size >= MAX_CACHE_ITEMS) {
                const oldestKey = globalAudioCache.keys().next().value;
                if (oldestKey) globalAudioCache.delete(oldestKey);
              }
              globalAudioCache.set(fetchUrl, data);
            }
            return data;
          })
          .finally(() => {
            pendingFetches.delete(fetchUrl);
          });
        pendingFetches.set(fetchUrl, fetchPromise);
      }

      audioData = await fetchPromise;
    }

    if (!audioData || audioData.buffer.length <= 1000) {
      return new NextResponse("Recording is still finalizing on telephony server", {
        status: 503,
        headers: {
          "Retry-After": "2",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const { buffer, contentType } = audioData;
    const totalLength = buffer.length;
    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

      if (!isNaN(start) && start < totalLength) {
        const validEnd = isNaN(end) ? totalLength - 1 : Math.min(end, totalLength - 1);
        const chunksize = validEnd - start + 1;
        const chunk = buffer.subarray(start, validEnd + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${validEnd}/${totalLength}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize.toString(),
            "Content-Type": contentType,
            "Content-Disposition": "inline",
            "Cache-Control": "public, max-age=86400, immutable",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
          },
        });
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": totalLength.toString(),
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      },
    });
  } catch (err: any) {
    console.error("Audio proxy error:", err);
    return new NextResponse(err?.message || "Failed to fetch audio", { 
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}