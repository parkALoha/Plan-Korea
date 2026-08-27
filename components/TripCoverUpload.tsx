"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTripMembers } from "@/hooks/useTripMembers";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.tripCover;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

type CoverState =
  | { status: "loading" }
  | { status: "idle"; coverImagePath: string | null; coverImageUrl: string | null }
  | { status: "uploading"; coverImageUrl: string | null }
  | { status: "removing"; coverImageUrl: string | null }
  | { status: "error"; message: string; coverImageUrl: string | null };

/**
 * รูปปกทริป — `PUT`/`DELETE /api/engine/trips/[tripId]/cover` (P1 27 ส.ค. 2026, `fb2aa11`, P4 probe
 * 27/27) ตั้ง/ลบได้เฉพาะ owner (route ตัดสินจริงด้วย `403` — เช็ค role ที่นี่แค่ซ่อนปุ่มไม่ให้ editor
 * กดแล้วเจอ error โดยไม่จำเป็น ไม่ใช่ด่านจริง)
 *
 * 🔴 **`coverImageUrl` เป็น `null` ได้แม้ตั้งรูปสำเร็จ** (การเซ็น URL ล้มแยกจากการตั้งรูป, P1 ระบุไว้ใน
 * รูป response) — ใช้ `coverImagePath` ตัดสินว่าตั้งสำเร็จหรือไม่ ไม่ใช่ `coverImageUrl`
 * 🔴 **URL ที่ได้มาหมดอายุใน 1 ชม.** — โชว์ทันทีได้ แต่ห้ามเก็บถาวร (state นี้หายเมื่อ unmount ตามปกติ
 * อยู่แล้ว ไม่ต้องทำอะไรเพิ่ม) แหล่งความจริงจริงคือ `GET /api/engine/trips` ที่การ์ด Home เรียกเอง
 *
 * เช็คชนิด/ขนาดฝั่ง client เพื่อ UX เท่านั้น (`accept` + เตือนไฟล์เกิน 5MB ก่อนส่ง ไม่ต้องเสียเวลาอัปโหลด
 * ไฟล์ที่รู้อยู่แล้วว่าจะโดน 413) — ด่านจริงอยู่ที่ route (P1 ย้ำ)
 */
export function TripCoverUpload({ tripId, readOnly }: { tripId: string; readOnly: boolean }) {
  const user = useCurrentUser();
  const { members } = useTripMembers(tripId);
  const isOwner =
    user.status === "ready" && members.some((m) => m.userId === user.id && m.role === "owner");

  const [result, setResult] = useState<{ forTripId: string; state: CoverState } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/trips")
      .then((r) => r.json())
      .then((rows: { id: string; coverImagePath?: string | null; coverImageUrl: string | null }[]) => {
        if (cancelled) return;
        const match = rows.find((r) => r.id === tripId);
        setResult({
          forTripId: tripId,
          state: {
            status: "idle",
            coverImagePath: match?.coverImagePath ?? null,
            coverImageUrl: match?.coverImageUrl ?? null,
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ forTripId: tripId, state: { status: "idle", coverImagePath: null, coverImageUrl: null } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const state: CoverState = result?.forTripId === tripId ? result.state : { status: "loading" };
  const currentUrl =
    state.status === "idle" || state.status === "uploading" || state.status === "removing" || state.status === "error"
      ? state.coverImageUrl
      : null;

  function setState(next: CoverState) {
    setResult({ forTripId: tripId, state: next });
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setState({ status: "error", message: COPY.errorType, coverImageUrl: currentUrl });
      return;
    }
    if (file.size === 0) {
      setState({ status: "error", message: COPY.errorEmpty, coverImageUrl: currentUrl });
      return;
    }
    if (file.size > MAX_BYTES) {
      // เช็คฝั่งนี้กันการอัปโหลดที่รู้ผลอยู่แล้ว — route จะตอบ 413 เหมือนกันถ้าข้ามมาถึง (ไม่ใช่ด่านซ้อน)
      setState({ status: "error", message: COPY.errorSize, coverImageUrl: currentUrl });
      return;
    }
    setState({ status: "uploading", coverImageUrl: currentUrl });
    try {
      const res = await fetch(`/api/engine/trips/${tripId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        const message =
          res.status === 415 ? COPY.errorType
          : res.status === 413 ? COPY.errorSize
          : res.status === 400 ? COPY.errorEmpty
          : res.status === 401 ? COPY.errorAuth
          : res.status === 403 ? COPY.errorForbidden
          : COPY.errorGeneric;
        setState({ status: "error", message, coverImageUrl: currentUrl });
        return;
      }
      const data = (await res.json()) as { coverImagePath: string | null; coverImageUrl: string | null };
      setState({ status: "idle", coverImagePath: data.coverImagePath, coverImageUrl: data.coverImageUrl });
    } catch {
      setState({ status: "error", message: COPY.errorGeneric, coverImageUrl: currentUrl });
    }
  }

  async function handleRemove() {
    setState({ status: "removing", coverImageUrl: currentUrl });
    try {
      const res = await fetch(`/api/engine/trips/${tripId}/cover`, { method: "DELETE" });
      if (!res.ok) {
        const message =
          res.status === 401 ? COPY.errorAuth
          : res.status === 403 ? COPY.errorForbidden
          : COPY.errorGeneric;
        setState({ status: "error", message, coverImageUrl: currentUrl });
        return;
      }
      setState({ status: "idle", coverImagePath: null, coverImageUrl: null });
    } catch {
      setState({ status: "error", message: COPY.errorGeneric, coverImageUrl: currentUrl });
    }
  }

  // editor เห็นแค่รูปที่มีอยู่ (ถ้ามี) ไม่เห็นปุ่มตั้ง/ลบเลย — กัน 403 โดยไม่จำเป็นตามที่ P1 ขอ
  if (!isOwner) {
    if (!currentUrl) return null;
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-content-soft">{COPY.title}</div>
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปปกจากผู้ใช้ ไม่ใช่ static asset */}
        <img src={currentUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
      </div>
    );
  }

  const busy = state.status === "uploading" || state.status === "removing";
  const disabled = readOnly || busy || state.status === "loading";

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-content-soft">{COPY.title}</div>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- รูปปกจากผู้ใช้ ไม่ใช่ static asset
        <img src={currentUrl} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
      ) : (
        <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-surface-soft text-xs text-content-soft">
          {COPY.noCover}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="rounded-lg bg-surface-soft px-3 py-2 text-xs font-medium text-content hover:bg-maple-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === "uploading" ? COPY.uploading : currentUrl ? COPY.replace : COPY.upload}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="rounded-lg px-3 py-2 text-xs font-medium text-maple-dark hover:bg-maple-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.status === "removing" ? COPY.removing : COPY.remove}
          </button>
        )}
      </div>

      {state.status === "error" && <p className="mt-1.5 text-xs text-maple-dark">{state.message}</p>}
      {readOnly && <p className="mt-1.5 text-xs text-content-soft">{COPY.readOnlyNote}</p>}
    </div>
  );
}
