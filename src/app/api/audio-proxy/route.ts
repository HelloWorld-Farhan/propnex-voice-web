import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Audio Proxy — bypasses CORS for Google Drive audio files.
 * Browser cannot load drive.google.com in <audio> tags directly.
 * This proxy fetches on the server (no CORS) and streams back to client.
 * Usage: /api/audio-proxy?url=<encoded_drive_url>
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

  try {
    const upstream = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "audio/*,video/*,*/*",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const totalLength = buffer.length;
    let contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    // Safari and HTML5 audio strictly expect audio/mpeg for MP3 files
    if (
      contentType.includes("application/octet-stream") ||
      contentType.includes("text/html") ||
      contentType.includes("application/json") ||
      contentType.includes("audio/mp3")
    ) {
      contentType = "audio/mpeg";
    }

    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
      const chunksize = end - start + 1;
      const chunk = buffer.subarray(start, end + 1);

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${totalLength}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": totalLength.toString(),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Audio proxy error:", err);
    return new NextResponse("Failed to fetch audio", { status: 502 });
  }
}