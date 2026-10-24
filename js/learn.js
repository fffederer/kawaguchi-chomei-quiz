// 学習モード: 領域ごとに 未表示 → ポップアップ表示 → ラベル表示 → 未表示 と移る。

import { COLORS, baseStyle } from "./map.js";

const POPUP_MS = 3000;

export function startLearn(view, ui) {
  const states = new Map(view.ids().map((id) => [id, "hidden"]));
  let popupId = null;
  let timer = null;

  function revealedStyle(id) {
    const f = view.feature(id);
    return { ...baseStyle(f), fillColor: f.properties.kind === "river" ? COLORS.riverRevealed : COLORS.revealed };
  }

  function toLabel(id) {
    if (states.get(id) !== "popup") return;
    clearTimeout(timer);
    popupId = null;
    states.set(id, "label");
    view.label(id, true);
  }

  function toHidden(id) {
    states.set(id, "hidden");
    view.style(id, baseStyle(view.feature(id)));
    view.label(id, false);
  }

  function toPopup(id) {
    if (popupId) toLabel(popupId);
    states.set(id, "popup");
    popupId = id;
    view.style(id, revealedStyle(id));
    view.popup(id, view.feature(id).properties.name, { onClose: () => toLabel(id) });
    timer = setTimeout(() => view.closePopup(), POPUP_MS);
  }

  view.onTap((id) => {
    const s = states.get(id);
    if (s === "hidden") toPopup(id);
    else if (s === "popup") view.closePopup(); // 閉じると onClose でラベル表示になる
    else toHidden(id);
  });

  ui.footer([
    { text: "確認", onClick: () => {
      view.closePopup();
      for (const id of states.keys()) {
        states.set(id, "label");
        view.style(id, revealedStyle(id));
        view.label(id, true);
      }
    } },
    { text: "リセット", onClick: () => {
      view.closePopup();
      for (const id of states.keys()) toHidden(id);
    } },
  ]);

  return () => {
    clearTimeout(timer);
    view.closePopup();
  };
}
