import { describe, expect, it } from "vitest";
import { noteFirstLine, noteLines } from "@/components/NoteBody";

describe("noteLines", () => {
  it("ตัดบรรทัดว่างทิ้ง และเก็บบรรทัดที่มีเนื้อหาไว้ตามลำดับ", () => {
    expect(noteLines("บรรทัดแรก\n\n  บรรทัดสอง  \n")).toEqual(["บรรทัดแรก", "บรรทัดสอง"]);
  });

  it("แตกโน้ตเก่าที่คั่นด้วย ' · ' ให้เป็นบุลเล็ตทีละหัวข้อ", () => {
    expect(noteLines("จิบกาแฟที่ OFF COURSE · เดินดูตึกวินเทจ")).toEqual([
      "• จิบกาแฟที่ OFF COURSE",
      "• เดินดูตึกวินเทจ",
    ]);
  });

  it("ไม่แตะบุลเล็ต/เลขข้อที่พิมพ์มาเองอยู่แล้ว", () => {
    expect(noteLines("- สั่งบิบิมบับ\n1. ต่อคิวก่อน")).toEqual(["- สั่งบิบิมบับ", "1. ต่อคิวก่อน"]);
  });
});

describe("noteFirstLine", () => {
  it("เอาบรรทัดแรกแบบไม่มีสัญลักษณ์บุลเล็ต และต่อ … เมื่อยังมีต่อ", () => {
    expect(noteFirstLine("- สั่งบิบิมบับ\nต่อคิวหน้าร้าน")).toBe("สั่งบิบิมบับ …");
    expect(noteFirstLine("สั่งบิบิมบับ")).toBe("สั่งบิบิมบับ");
  });
});
