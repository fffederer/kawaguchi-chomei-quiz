// クイズモード: ステージ(1地区の全町名)と復習(苦手な町名を最大10問)。出題形式は位置当てと名前当て。

import { COLORS, baseStyle } from "./map.js";
import * as store from "./store.js";

const REVIEW_SIZE = 10;
const CORRECT_PAUSE_MS = 900;

export const FORMATS = { position: "位置当て", name: "名前当て" };

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function townIds(view, district) {
  return view.ids().filter((id) => {
    const p = view.feature(id).properties;
    return p.kind === "town" && (!district || p.district === district);
  });
}

export function weakTownIds(view) {
  return townIds(view).filter((id) => store.level(id) === "weak");
}

// 不正解の選択肢: 隣り合う町名 → 同じ地区の町名 → 市内の町名 の順に補う
function choicesFor(view, id) {
  const p = view.feature(id).properties;
  const pools = [
    shuffle(p.neighbors),
    shuffle(townIds(view, p.district)),
    shuffle(townIds(view)),
  ];
  const picked = new Set();
  for (const pool of pools) {
    for (const other of pool) {
      if (picked.size === 3) break;
      if (other !== id) picked.add(other);
    }
  }
  return shuffle([id, ...picked]);
}

/**
 * @param {object} opts
 * @param {string|null} opts.district  ステージの地区。null なら復習
 * @param {"position"|"name"} opts.format
 */
export function startQuiz(view, ui, { district, format }) {
  const questions = district
    ? shuffle(townIds(view, district))
    : shuffle(weakTownIds(view)).slice(0, REVIEW_SIZE);
  const inScope = new Set(district ? questions : townIds(view));
  const answers = [];
  let index = 0;
  let waiting = false; // 答え合わせを表示している間は true
  let refit = false;   // 答え合わせで地図を動かしたら、次の問題で出題範囲に戻す
  let timer = null;

  function fitScope() {
    if (district) view.fitIds(questions);
    else view.fitAll();
  }

  function scopeStyle(feature) {
    const id = feature.properties.id;
    if (feature.properties.kind === "river") return { ...baseStyle(feature), fillColor: COLORS.disabled, color: "#c4c9ce" };
    if (!inScope.has(id)) return { ...baseStyle(feature), fillColor: COLORS.disabled, color: "#c4c9ce" };
    return baseStyle(feature);
  }

  function fill(id, color) {
    view.style(id, { ...scopeStyle(view.feature(id)), fillColor: color });
  }

  function name(id) {
    return view.feature(id).properties.name;
  }

  function show() {
    waiting = false;
    view.resetStyles(scopeStyle);
    view.clearLabels();
    view.closePopup();
    if (refit) { fitScope(); refit = false; }
    ui.progress(`${index + 1} / ${questions.length}`);
    const id = questions[index];
    if (format === "position") {
      ui.prompt(`<b>${name(id)}</b> はどこ?`);
      ui.footer([]);
    } else {
      fill(id, COLORS.highlight);
      fitScope();
      view.ensureVisible(id);
      ui.prompt("色の付いた領域の町名は?");
      ui.footer(choicesFor(view, id).map((c) => ({ text: name(c), onClick: () => answer(c) })), { grid: true });
    }
  }

  function next() {
    clearTimeout(timer);
    index += 1;
    if (index < questions.length) show();
    else finish();
  }

  function answer(chosen) {
    if (waiting) return;
    waiting = true;
    const id = questions[index];
    const correct = chosen === id;
    answers.push({ townId: id, correct });
    fill(id, COLORS.correct);
    view.label(id, true, { force: true, cls: "answer" });
    if (correct) {
      ui.prompt(`⭕ 正解 <b>${name(id)}</b>`);
      timer = setTimeout(next, CORRECT_PAUSE_MS);
      return;
    }
    if (format === "position") {
      fill(chosen, COLORS.wrong);
      view.label(chosen, true, { force: true, cls: "wrong" });
      view.fitIds([id, chosen], { maxZoom: 16 });
      refit = true;
      ui.prompt(`❌ そこは <b>${name(chosen)}</b>。正解は <b>${name(id)}</b>`);
    } else {
      ui.prompt(`❌ 正解は <b>${name(id)}</b>(${name(chosen)} ではない)`);
    }
    ui.footer([{ text: "次へ", onClick: next }]);
  }

  function finish() {
    store.recordSession(answers, district, format);
    ui.result({ district, format, answers: answers.map((a) => ({ ...a, name: name(a.townId) })) });
  }

  view.onTap((id) => {
    if (format !== "position" || waiting || !inScope.has(id)) return;
    answer(id);
  });

  ui.setBack("中断", () => ui.go("menu"));
  for (const id of inScope) view.front(id);
  fitScope();
  show();

  return () => {
    clearTimeout(timer);
    ui.prompt(null);
  };
}
