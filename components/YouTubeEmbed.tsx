"use client";

import { useEffect, useState } from "react";

// แคชผลลัพธ์ไว้ในหน่วยความจำของแท็บ กันไม่ให้ยิง /api/youtube-video ซ้ำทุกครั้งที่เปิด modal เดิม
const videoCache = new Map<string, string | null>();

export function YouTubeEmbed({ query }: { query: string }) {
  const [result, setResult] = useState<{ query: string; videoId: string | null } | null>(
    () => (videoCache.has(query) ? { query, videoId: videoCache.get(query)! } : null)
  );

  useEffect(() => {
    // มีแคชอยู่แล้ว (ตั้งค่าไว้ตั้งแต่ useState initializer แล้ว) ไม่ต้องยิงซ้ำ
    if (videoCache.has(query)) return;
    let cancelled = false;
    fetch(`/api/youtube-video?query=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        const videoId: string | null = d.videoId ?? null;
        videoCache.set(query, videoId);
        if (!cancelled) setResult({ query, videoId });
      })
      .catch(() => {
        if (!cancelled) setResult({ query, videoId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const videoId = result?.query === query ? result.videoId : undefined;

  if (videoId === undefined) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
        กำลังหาคลิป...
      </div>
    );
  }

  if (!videoId) {
    return (
      <a
        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500 hover:bg-gray-200"
      >
        ค้นหาใน YouTube ↗
      </a>
    );
  }

  return (
    <iframe
      className="aspect-video w-full rounded-lg border-0"
      loading="lazy"
      src={`https://www.youtube.com/embed/${videoId}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
