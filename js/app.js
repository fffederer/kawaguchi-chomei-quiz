// 画面の切り替えと、各モードが使う画面部品(ui)をまとめる。

import { createMap } from "./map.js";
import { startLearn } from "./learn.js";
import { startQuiz, FORMATS, townIds, weakTownIds } from "./quiz.js";
import { startMastery } from "./mastery.js";
import * as store from "./store.js";

const $ = (sel) => document.querySelector(sel);

let data;
let view;
let stopMode = null;
let lastQuiz = null;

const ui = {
  go,
  footer(buttons, { grid = false } = {}) {
    const el = $("#map-footer");
    el.replaceChildren();
    el.classList.toggle("grid", grid);
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.textContent = b.text;
      btn.addEventListener("click", b.onClick);
      el.append(btn);
    }
    el.hidden = buttons.length === 0;
    view.invalidate();
  },
  prompt(html) {
    const el = $("#quiz-prompt");
    el.hidden = html == null;
    el.innerHTML = html ?? "";
  },
  progress(text) {
    $("#map-progress").textContent = text ?? "";
  },
  legend(html) {
    const el = $("#map-legend");
    el.hidden = html == null;
    el.innerHTML = html ?? "";
  },
  setBack(text, onClick) {
    const btn = $("#map-back");
    btn.textContent = `‹ ${text}`;
    btn.onclick = onClick;
  },
  result(summary) {
    lastQuiz = { district: summary.district, format: summary.format };
    showResult(summary);
  },
};

function showScreen(name) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${name}`;
  if (name === "map") view.invalidate();
}

function enterMap(title, start) {
  if (stopMode) stopMode();
  showScreen("map");
  $("#map-title").textContent = title;
  ui.progress(null);
  ui.prompt(null);
  ui.legend(null);
  ui.setBack("メニュー", () => go("menu"));
  view.closePopup();
  view.clearLabels();
  view.resetStyles();
  view.setLandmarks(store.settings());
  stopMode = start();
}

function go(name, opts = {}) {
  if (stopMode && name !== "result") { stopMode(); stopMode = null; }
  switch (name) {
    case "menu": renderMenu(); showScreen("menu"); break;
    case "stages": renderStages(); showScreen("stages"); break;
    case "settings": renderSettings(); showScreen("settings"); break;
    case "learn":
      enterMap("学習モード", () => { view.fitAll(); return startLearn(view, ui); });
      break;
    case "mastery":
      enterMap("習熟度マップ", () => startMastery(view, ui, data.districts));
      break;
    case "review":
      chooseFormat("復習", (format) => go("quiz", { district: null, format }));
      break;
    case "quiz": {
      const title = opts.district ? `${opts.district}地区・${FORMATS[opts.format]}` : `復習・${FORMATS[opts.format]}`;
      enterMap(title, () => startQuiz(view, ui, opts));
      break;
    }
  }
}

function renderMenu() {
  const n = weakTownIds(view).length;
  const btn = $("#menu-review");
  btn.disabled = n === 0;
  btn.innerHTML = n === 0
    ? "復習<small>苦手な町名はありません</small>"
    : `復習(${n})<small>苦手な町名だけを出題</small>`;
}

function renderStages() {
  const list = $("#stage-list");
  list.replaceChildren();
  for (const d of data.districts) {
    const ids = townIds(view, d);
    const learned = ids.filter((id) => store.level(id) === "learned").length;
    const c = store.clears(d);
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML = `
      <div class="card-head"><b>${d}地区</b><span>${ids.length}町名・覚えた ${learned}</span></div>
      <div class="card-actions"></div>`;
    for (const [f, label] of Object.entries(FORMATS)) {
      const b = document.createElement("button");
      b.innerHTML = `${c[f] ? "★" : "☆"} ${label}`;
      b.classList.toggle("cleared", !!c[f]);
      b.addEventListener("click", () => go("quiz", { district: d, format: f }));
      li.querySelector(".card-actions").append(b);
    }
    list.append(li);
  }
}

function chooseFormat(title, onPick) {
  confirmDialog(`${title}の出題形式を選んでください`, {
    ok: FORMATS.name, cancel: FORMATS.position, okClass: "",
    onOk: () => onPick("name"), onCancel: () => onPick("position"), dismissable: true,
  });
}

function showResult({ district, format, answers }) {
  const correct = answers.filter((a) => a.correct).length;
  const rate = Math.round((correct / answers.length) * 100);
  const wrong = answers.filter((a) => !a.correct);
  const cleared = district && wrong.length === 0;
  $("#result-body").innerHTML = `
    <p class="result-title">${district ? `${district}地区` : "復習"}・${FORMATS[format]}</p>
    <p class="result-rate">${rate}<small>%</small></p>
    <p class="result-count">${answers.length}問中 ${correct}問正解</p>
    ${cleared ? `<p class="result-clear">★ ${district}地区 ${FORMATS[format]} クリア!</p>` : ""}
    ${wrong.length ? `<h3>間違えた町名</h3><ul class="wrong-list">${wrong.map((a) => `<li>${a.name}</li>`).join("")}</ul>` : ""}`;
  const canRetry = district || weakTownIds(view).length > 0;
  $("#result-retry").hidden = !canRetry;
  showScreen("result");
}

function renderSettings() {
  const s = store.settings();
  $("#set-rail").checked = s.rail;
  $("#set-road").checked = s.road;
  const sel = $("#reset-target");
  sel.innerHTML = `<option value="">市全体</option>` + data.districts.map((d) => `<option value="${d}">${d}地区</option>`).join("");
}

function confirmDialog(text, { ok = "OK", cancel = "キャンセル", okClass = "danger", onOk, onCancel, dismissable = false }) {
  const dlg = $("#dialog");
  $("#dialog-text").textContent = text;
  const okBtn = $("#dialog-ok");
  const cancelBtn = $("#dialog-cancel");
  okBtn.textContent = ok;
  okBtn.className = okClass;
  cancelBtn.textContent = cancel;
  const close = () => { dlg.hidden = true; okBtn.onclick = cancelBtn.onclick = dlg.onclick = null; };
  okBtn.onclick = () => { close(); onOk?.(); };
  cancelBtn.onclick = () => { close(); onCancel?.(); };
  dlg.onclick = (e) => { if (dismissable && e.target === dlg) close(); };
  dlg.hidden = false;
}

function bindStatic() {
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-go]");
    if (target && !target.disabled) go(target.dataset.go);
  });
  $("#result-retry").addEventListener("click", () => {
    if (lastQuiz) go("quiz", lastQuiz);
  });
  $("#set-rail").addEventListener("change", (e) => store.setSetting("rail", e.target.checked));
  $("#set-road").addEventListener("change", (e) => store.setSetting("road", e.target.checked));
  $("#reset-run").addEventListener("click", () => {
    const d = $("#reset-target").value || null;
    const label = d ? `${d}地区` : "市全体";
    confirmDialog(`${label}の習熟度とクリア印をリセットします。元に戻せません。よろしいですか?`, {
      ok: "リセットする",
      onOk: () => store.resetMastery(townIds(view, d), d),
    });
  });
}

async function main() {
  data = await (await fetch("data/map.json")).json();
  view = createMap($("#map"), data);
  if (location.hash === "#test") window.__view = view; // 動作確認スクリプトから領域の位置を調べるため
  bindStatic();
  go("menu");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker を登録できませんでした", e));
  }
}

main();
