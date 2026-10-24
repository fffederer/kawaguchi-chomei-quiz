// 習熟度マップ: 町名ごとの習熟度を塗り分け、地区ごとのクリア印を一覧にする。

import { COLORS, baseStyle } from "./map.js";
import { FORMATS, townIds } from "./quiz.js";
import * as store from "./store.js";

export function startMastery(view, ui, districts) {
  view.resetStyles((f) => f.properties.kind === "river"
    ? { ...baseStyle(f), fillColor: COLORS.disabled, color: "#c4c9ce" }
    : { ...baseStyle(f), fillColor: COLORS.level[store.level(f.properties.id)] });
  view.fitAll();

  const counts = { none: 0, weak: 0, vague: 0, learned: 0 };
  for (const id of townIds(view)) counts[store.level(id)] += 1;

  const legend = Object.entries(store.LEVELS).map(([key, label]) =>
    `<span class="chip"><i style="background:${COLORS.level[key]}"></i>${label} ${counts[key]}</span>`).join("");

  const rows = districts.map((d) => {
    const c = store.clears(d);
    const marks = Object.entries(FORMATS)
      .map(([f, label]) => `<span class="mark ${c[f] ? "on" : ""}">${c[f] ? "★" : "☆"}${label}</span>`).join("");
    return `<tr><th>${d}</th><td>${marks}</td></tr>`;
  }).join("");

  ui.legend(`<div class="chips">${legend}</div>
    <details><summary>地区ごとのクリア印</summary><table class="clears">${rows}</table></details>`);
  ui.footer([]);
  view.onTap(() => {});

  return () => ui.legend(null);
}
