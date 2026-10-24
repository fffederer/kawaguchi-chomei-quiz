// 習熟度・クリア印・設定を端末内(localStorage)に保存する。

const KEY = "kawaguchi-chomei-quiz/v1";
const HISTORY_LENGTH = 5;

export const LEVELS = {
  none: "未学習",
  weak: "苦手",
  vague: "うろ覚え",
  learned: "覚えた",
};

const empty = () => ({
  history: {},  // 町名ID → 直近の解答の正誤(古い順、最大5件)
  clears: {},   // 地区 → { position: true, name: true }
  settings: { rail: true, road: true },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn("記録を読み込めませんでした", e);
  }
  return empty();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("記録を保存できませんでした", e);
  }
}

// 苦手: 直近3回に不正解がある / 覚えた: 5回続けて正解 / うろ覚え: それ以外
export function levelOf(history = []) {
  if (history.length === 0) return "none";
  if (history.slice(-3).includes(false)) return "weak";
  if (history.length >= HISTORY_LENGTH && history.every(Boolean)) return "learned";
  return "vague";
}

export function level(townId) {
  return levelOf(state.history[townId]);
}

// 1回分の出題を最後まで終えたときにだけ呼ぶ(中断した回は記録しない)
export function recordSession(answers, district, format) {
  for (const { townId, correct } of answers) {
    const h = [...(state.history[townId] || []), correct];
    state.history[townId] = h.slice(-HISTORY_LENGTH);
  }
  if (district && answers.length > 0 && answers.every((a) => a.correct)) {
    state.clears[district] = { ...state.clears[district], [format]: true };
  }
  save();
}

export function clears(district) {
  return state.clears[district] || {};
}

export function resetMastery(townIds, district) {
  for (const id of townIds) delete state.history[id];
  if (district) delete state.clears[district];
  else state.clears = {};
  save();
}

export function settings() {
  return state.settings;
}

export function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  save();
}
