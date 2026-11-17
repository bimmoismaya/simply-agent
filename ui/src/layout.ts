import type { Node } from "@xyflow/react";
import type { Agent } from "../../shared/types.ts";

export const ROLE_ORDER = ["coordinator", "assistant", "frontend", "reviewer", "tester"];
export const CARD_W = 300;
export const BIG_W = 380;
export const CARD_H = 232; // tinggi tetap kartu (dipaksa di AgentNode), jadi bingkai grup selalu pas
export const BIG_H = 290;
const GAP = 16;
const HEADER = 30;
const SIDE_GAP = 180;
const ROW_GAP = 90;

export interface Box { x: number; y: number; w: number; h: number }

const roleRank = (r: string) => (ROLE_ORDER.indexOf(r) + 1 || ROLE_ORDER.length + 1);

/** Urutan tetap untuk navigasi panah dan sidebar. */
export function orderAgents(agents: Agent[]) {
  return [...agents].sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
}

/**
 * Koordinator di tengah; setiap peran lain jadi bingkai grup yang disusun bergantian kiri-kanan.
 * Jumlah agent atau peran baru otomatis mendapat tempat tanpa koordinat manual.
 */
// Penting: setiap node membawa `measured`. Tanpa itu React Flow v12 membuang handleBounds tiap kali objek node
// dibuat ulang (setiap update agent), dan semua edge hilang sampai node diukur ulang, yang tidak pernah terjadi
// karena ukurannya tetap. Ukuran memang tetap (lihat CARD_W/CARD_H/BIG_W/BIG_H), jadi kita yang menyatakannya.
export function buildLayout(agents: Agent[], selectedId: string | null, previewSrc?: string) {
  const nodes: Node[] = [];
  const boxes: Record<string, Box> = {};
  const coordinators = agents.filter((a) => a.role === "coordinator");
  const roles = [...new Set(agents.filter((a) => a.role !== "coordinator").map((a) => a.role))]
    .sort((a, b) => roleRank(a) - roleRank(b));

  coordinators.forEach((a, i) => {
    const box = { x: i * (BIG_W + GAP), y: 0, w: BIG_W, h: BIG_H };
    boxes[a.id] = box;
    nodes.push({ id: a.id, type: "agent", position: { x: box.x, y: box.y }, width: BIG_W, height: BIG_H, measured: { width: BIG_W, height: BIG_H }, data: { agent: a, big: true }, selected: a.id === selectedId });
  });
  const centerW = Math.max(BIG_W, coordinators.length * (BIG_W + GAP) - GAP);

  const groupH = HEADER + CARD_H + GAP * 2;
  const sides: { role: string; members: Agent[]; w: number }[][] = [[], []];
  roles.forEach((role, i) => {
    const members = agents.filter((a) => a.role === role);
    sides[i % 2].push({ role, members, w: members.length * (CARD_W + GAP) + GAP });
  });

  sides.forEach((column, side) => {
    const total = column.length * groupH + Math.max(0, column.length - 1) * ROW_GAP;
    let y = BIG_H / 2 - total / 2;
    for (const g of column) {
      const x = side === 0 ? -SIDE_GAP - g.w : centerW + SIDE_GAP;
      const gid = `group-${g.role}`;
      nodes.push({
        id: gid, type: "group", position: { x, y }, width: g.w, height: groupH, measured: { width: g.w, height: groupH }, selectable: false, draggable: false,
        data: { role: g.role, total: g.members.length, running: g.members.filter((m) => m.status === "running").length, width: g.w, height: groupH },
        style: { width: g.w, height: groupH },
      });
      g.members.forEach((a, j) => {
        const rel = { x: GAP + j * (CARD_W + GAP), y: HEADER + GAP };
        boxes[a.id] = { x: x + rel.x, y: y + rel.y, w: CARD_W, h: CARD_H };
        nodes.push({ id: a.id, type: "agent", parentId: gid, extent: "parent", position: rel, width: CARD_W, height: CARD_H, measured: { width: CARD_W, height: CARD_H }, data: { agent: a }, selected: a.id === selectedId });
      });
      y += groupH + ROW_GAP;
    }
  });

  if (previewSrc) {
    nodes.push({ id: "preview", type: "preview", position: { x: centerW / 2 - 180, y: BIG_H + 120 }, width: 360, height: 240, measured: { width: 360, height: 240 }, data: { src: previewSrc }, selectable: false });
  }
  return { nodes, boxes };
}
