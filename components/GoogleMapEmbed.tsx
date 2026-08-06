"use client";

export function GoogleMapEmbed({ query }: { query: string }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  if (!key) {
    return (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-56 w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500 hover:bg-gray-200"
      >
        เปิดใน Google Maps ↗
      </a>
    );
  }

  return (
    <iframe
      className="h-56 w-full rounded-lg border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(query)}`}
      allowFullScreen
    />
  );
}
