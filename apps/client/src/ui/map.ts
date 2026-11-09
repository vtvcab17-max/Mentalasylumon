import { t } from "../i18n";
import type { Place } from "../world/hospital-builder";
import { h } from "./dom";

/**
 * Bản đồ / thang máy (T073, FR-011): chọn nơi muốn tới và dịch chuyển ngay.
 * Có lối tắt về phòng riêng và tới phòng sinh hoạt (phòng sinh hoạt mở ở US3).
 */

export interface Layout {
  wings: { name: string; floors: number[] }[];
  roomsPerFloor: number;
  myRoom: { wing: string; floor: number; roomNumber: number } | null;
}

export function placeName(p: Place): string {
  if (p.kind === "room") return t("world.room");
  if (p.kind === "lobby") return t("world.lobby");
  if (p.kind === "garden") return t("world.garden");
  if (p.kind === "court") return t("world.court");
  return t("world.floor", { wing: p.wing, floor: String(p.floor) });
}

const same = (a: Place, b: Place) =>
  a.kind === b.kind && (a.kind !== "floor" || (b.kind === "floor" && a.wing === b.wing && a.floor === b.floor));

export function openMap(root: HTMLElement, opts: { layout: Layout; current: Place; go(p: Place): void }) {
  const close = () => panel.remove();
  const item = (p: Place | null, label: string, extra?: string) => {
    const here = p && same(p, opts.current);
    return h(
      "button",
      {
        class: `bvo-doctor`,
        type: "button",
        disabled: !p || here ? true : undefined,
        "aria-current": here ? "location" : undefined,
        on: {
          click: () => {
            if (!p) return;
            close();
            opts.go(p);
          },
        },
      },
      h("strong", {}, label),
      extra || here ? h("div", { class: "bvo-muted" }, here ? t("world.youAreHere") : extra!) : null,
    );
  };

  const my = opts.layout.myRoom;
  const others = opts.layout.wings.flatMap((w) =>
    w.floors.filter((f) => !(my && my.wing === w.name && my.floor === f)).map((f) => ({ wing: w.name, floor: f })),
  );

  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  closeBtn.addEventListener("click", close);
  const panel = h(
    "aside",
    { class: "bvo-panel", role: "dialog", "aria-label": t("world.map") },
    h("header", {}, h("h2", {}, `🗺 ${t("world.mapTitle")}`), closeBtn),
    h(
      "div",
      { class: "bvo-doctors" },
      my ? item({ kind: "room" }, `🛏 ${t("world.room")}`, `${my.wing}-${my.floor}-${String(my.roomNumber).padStart(2, "0")}`) : null,
      my ? item({ kind: "floor", wing: my.wing, floor: my.floor }, `🚪 ${t("world.myFloor")}`, placeName({ kind: "floor", wing: my.wing, floor: my.floor })) : null,
      item({ kind: "lobby" }, `🏥 ${t("world.lobby")}`),
      item({ kind: "court" }, `🏛 ${t("world.court")}`),
      item({ kind: "garden" }, `🌳 ${t("world.garden")}`),
      item(null, `⭕ ${t("world.circle")}`, t("world.comingSoon")),
      others.length ? h("h3", { style: "margin:16px 0 4px" }, t("world.otherFloors")) : null,
      ...others.map((f) => item({ kind: "floor", ...f }, placeName({ kind: "floor", ...f }))),
    ),
  );
  root.append(panel);
  return close;
}
