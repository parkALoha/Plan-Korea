"use client";

import { useEffect, useState } from "react";
import { E5_COPY } from "@/lib/i18n";
import { showToast } from "@/lib/toast";

const COPY = E5_COPY.home;

type InviteRow = {
  id: string;
  role: string;
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  active: boolean;
};

/**
 * **ชวนเพื่อนเข้าทริปด้วยลิงก์** — อยู่ในกล่อง "สมาชิกในทริป"
 * เจ้าของ: P2-UI/UX · 5 ก.ย. 2026 · ผู้ใช้สั่งเอง: *"เชิญได้ หรือส่งลิงก์เชิญร่วมทริปนี้ได้"*
 * หลังบ้านโดย P1 (`19d3835` · `d413164`)
 *
 * ## 🔴 ลิงก์แสดง **ครั้งเดียวในชีวิตของมัน** — และนั่นเปลี่ยนหน้าตาทั้งกล่อง
 * ฐานเก็บแค่ **แฮช** ⇒ `GET` (รายการ) **ไม่คืนโทเคน** โดยตั้งใจ · ยิงยืนยันแล้วว่าไม่มีจริง
 * ⇒ ***ต้องออกแบบเป็น "คัดลอกเดี๋ยวนี้" ไม่ใช่ "ดูทีหลังได้"***
 * · ลิงก์ที่สร้างแล้วจึงอยู่ในกล่องนี้จนกว่าจะปิด **ไม่ยุบเองหลังคัดลอก** — คัดลอกพลาดยังกดซ้ำได้
 * · 🔴 **ห้ามเก็บโทเคนลง state ที่อยู่ข้ามการปิดกล่อง หรือลง `localStorage`** — มันคือกุญแจเข้าทริป
 *
 * ## 🔴 ไม่มีค่าเริ่มต้นของสิทธิ์ — ต้องเลือกก่อนถึงจะสร้างได้
 * ฝั่ง API ตอบ `400` ถ้าไม่ส่ง `role` มา (P1 ตั้งใจ) · ฝั่งนี้จึงเริ่มที่ **ยังไม่เลือก**
 * 🎯 ***ค่าเริ่มต้นที่ไม่มีใครเลือก จะกลายเป็นสิ่งที่ทุกคนได้*** — และของที่ทุกคนได้ที่นี่คือ *สิทธิ์แก้ทริป*
 *
 * ## ⚠️ ปุ่มโผล่เฉพาะ `owner`
 * ด่านจริงอยู่ในฐาน (RPC) — ที่นี่แค่ *ไม่แสดงปุ่มที่กดไปก็ถูกปฏิเสธ*
 * 🔴 **ไม่ตรวจซ้ำเพื่อ "ความปลอดภัย"** — สองที่ที่ต้องตรงกันคือรูปที่ทีมนี้โดนมาหลายรอบ
 */
export function TripInvitePanel({ tripId, isOwner }: { tripId: string; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"editor" | "viewer" | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<InviteRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/engine/trips/${tripId}/invites`);
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { invites?: InviteRow[] };
        if (!cancelled) setRows(body.invites ?? []);
      } catch {
        if (!cancelled) setRows([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, made]);

  if (!isOwner) return null;

  const activeCount = (rows ?? []).filter((r) => r.active).length;

  async function create() {
    if (!role) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/engine/trips/${tripId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const body = (await r.json()) as { token: string; expiresAt: string };
      setMade({ url: `${window.location.origin}/invite/${body.token}`, expiresAt: body.expiresAt });
      setCopied(false);
    } catch {
      showToast("error", COPY.inviteFailed);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      const r = await fetch(`/api/engine/trips/${tripId}/invites?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(String(r.status));
      setRows((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, active: false } : x)));
    } catch {
      showToast("error", COPY.inviteRevokeFailed);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-lg border border-edge px-3 py-2.5 text-sm font-medium text-content hover:bg-surface-soft"
      >
        {COPY.inviteOpen}
      </button>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-edge p-3">
      {made ? (
        <>
          {/* 🔴 ข้อความเตือนอยู่ **เหนือ** ลิงก์ ไม่ใช่ใต้ — คนคัดลอกแล้วปิดทันที มักไม่อ่านบรรทัดล่าง */}
          <p className="text-xs font-semibold text-maple-dark">{COPY.inviteOnce}</p>
          <p className="mt-2 break-all rounded-lg bg-surface-soft p-2 text-xs text-content">
            {made.url}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(made.url);
                  setCopied(true);
                } catch {
                  /* คัดลอกอัตโนมัติไม่ได้ (สิทธิ์/เบราว์เซอร์) — ลิงก์ยังอยู่บนจอให้เลือกเองได้ */
                }
              }}
              className="rounded-lg bg-maple-dark px-3 py-2 text-xs font-semibold text-white"
            >
              {copied ? COPY.inviteCopied : COPY.inviteCopy}
            </button>
            <span className="text-xs text-content-soft">
              {COPY.inviteExpiresAt(new Date(made.expiresAt).toLocaleDateString("th-TH"))}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-content">{COPY.inviteRoleQuestion}</p>
          <div className="mt-2 flex gap-2">
            {(["editor", "viewer"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  role === r
                    ? "border-maple-dark bg-maple-soft text-maple-dark"
                    : "border-edge text-content hover:bg-surface-soft"
                }`}
              >
                {r === "editor" ? COPY.inviteRoleEditor : COPY.inviteRoleViewer}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void create()}
            disabled={!role || busy}
            className="mt-3 w-full rounded-lg bg-pine px-3 py-2.5 text-sm font-semibold text-cream disabled:opacity-40"
          >
            {busy ? COPY.inviteCreating : COPY.inviteCreate}
          </button>
        </>
      )}

      {activeCount > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs text-content-soft">{COPY.inviteActiveCount(activeCount)}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {(rows ?? [])
              .filter((r) => r.active)
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-content">
                    {r.role === "editor" ? COPY.inviteRoleEditor : COPY.inviteRoleViewer} ·{" "}
                    {COPY.inviteExpiresAt(new Date(r.expiresAt).toLocaleDateString("th-TH"))}
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(r.id)}
                    className="shrink-0 rounded px-2 py-1 text-maple-dark hover:bg-surface-soft"
                  >
                    {COPY.inviteRevoke}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
