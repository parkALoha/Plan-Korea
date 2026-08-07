"use client";

import type { ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

export function MapsApiProvider({ children }: { children: ReactNode }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? ""}>
      {children}
    </APIProvider>
  );
}
