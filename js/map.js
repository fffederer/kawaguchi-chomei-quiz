// Leaflet で領域・ラベル・目印を描き、各モードから使う操作をまとめる。
/* global L */

const STATION_LABEL_MIN_ZOOM = 13.5;
const LABEL_GAP_PX = 2;          // ラベル同士の最小のすき間
const LABEL_MIN_REGION_PX = 3;   // 画面上の内接円半径がこれ未満の領域にはラベルを出さない

// ズームアウトするほど文字を小さくして、多くのラベルが入るようにする
function labelFontPx(zoom) {
  if (zoom < 12.5) return 10;
  if (zoom < 13.5) return 11;
  return 12;
}

// 「大字◯◯」は「大字」を小さく1行目に置き、横幅を詰める
function labelHtml(text) {
  return text.startsWith("大字") && text.length > 2
    ? `<span><small>大字</small>${text.slice(2)}</span>`
    : `<span>${text}</span>`;
}

// ラベルの画面上の大きさの見積もり(px)。和文は1文字がほぼ正方形
function labelBox(text, px) {
  const oaza = text.startsWith("大字") && text.length > 2;
  const chars = [...(oaza ? text.slice(2) : text)].length;
  return { w: chars * px, h: px * 1.2 + (oaza ? px * 0.75 : 0) };
}

export const COLORS = {
  line: "#5a6b78",
  townFill: "#ffffff",
  riverFill: "#d6ebfa",
  disabled: "#d9dde1",
  revealed: "#ffcf70",
  riverRevealed: "#8cc4ef",
  highlight: "#ff9f1c",
  correct: "#5cc46a",
  wrong: "#ef6461",
  level: { none: "#ffffff", weak: "#f28b82", vague: "#fde68a", learned: "#81c995" },
};

export function baseStyle(feature) {
  const river = feature.properties.kind === "river";
  return {
    color: river ? "#7fb2d9" : COLORS.line,
    weight: 1,
    fillColor: river ? COLORS.riverFill : COLORS.townFill,
    fillOpacity: 1,
  };
}

function metersPerPixel(map) {
  const lat = map.getCenter().lat;
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
}

export function createMap(el, data) {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    minZoom: 11,
    maxZoom: 18,
    renderer: L.svg({ padding: 0.5 }),
    tap: false,
  });
  L.control.zoom({ position: "bottomright", zoomInTitle: "拡大", zoomOutTitle: "縮小" }).addTo(map);

  map.createPane("landmarks").style.zIndex = 450;
  map.getPane("landmarks").style.pointerEvents = "none";
  map.createPane("labels").style.zIndex = 650;
  map.getPane("labels").style.pointerEvents = "none";

  const regions = new Map();
  let tapHandler = null;

  const layer = L.geoJSON(data.regions, {
    style: baseStyle,
    onEachFeature(feature, lyr) {
      const p = feature.properties;
      const label = L.marker(p.label.slice().reverse(), {
        pane: "labels",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: `region-label ${p.kind}`, html: labelHtml(p.name), iconSize: null }),
      });
      regions.set(p.id, { feature, layer: lyr, label, wantLabel: false, labelText: p.name, labelClass: "" });
      lyr.on("click", (e) => {
        L.DomEvent.stop(e);
        if (tapHandler) tapHandler(p.id);
      });
    },
  }).addTo(map);

  const bounds = layer.getBounds();
  map.setMaxBounds(bounds.pad(0.4));
  map.fitBounds(bounds);

  // 町名の境界線が川に隠れないよう、川を一番奥に描く(線は表示位置が決まってから作られるので、その後で並べ替える)
  for (const { feature, layer: lyr } of regions.values()) {
    if (feature.properties.kind === "river") lyr.bringToBack();
  }

  // 目印
  const rail = L.layerGroup();
  const road = L.layerGroup();
  for (const f of data.landmarks.features) {
    const p = f.properties;
    if (p.layer === "station") {
      const ll = f.geometry.coordinates.slice().reverse();
      L.circleMarker(ll, { pane: "landmarks", radius: 4, color: "#333", weight: 1.5, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(rail);
      L.marker(ll, {
        pane: "landmarks", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "station-label", html: `<span>${p.name}</span>`, iconSize: null }),
      }).addTo(rail);
    } else if (p.layer === "rail") {
      L.geoJSON(f, { pane: "landmarks", interactive: false,
        style: { color: "#444", weight: 2.5, opacity: 0.55, dashArray: p.underground ? "4 4" : null } }).addTo(rail);
    } else if (p.layer === "road") {
      L.geoJSON(f, { pane: "landmarks", interactive: false,
        style: p.class === "expressway"
          ? { color: "#2e7d32", weight: 3, opacity: 0.45 }
          : { color: "#b0702c", weight: 2, opacity: 0.4 } }).addTo(road);
    }
  }

  // ラベルは領域からはみ出してよいが、ラベル同士は重ねない。
  // 答え合わせのラベルを最優先にし、残りは面積の大きい領域から順に置いていく
  function refreshLabels() {
    const px = labelFontPx(map.getZoom());
    el.style.setProperty("--label-px", `${px}px`);
    const mpp = metersPerPixel(map);
    const candidates = [...regions.values()]
      .filter((e) => e.wantLabel)
      .sort((a, b) => (b.forceLabel - a.forceLabel) || (b.feature.properties.area - a.feature.properties.area));
    const placed = [];
    const visible = new Set();
    for (const entry of candidates) {
      const p = entry.feature.properties;
      if (!entry.forceLabel && p.labelRadius / mpp < LABEL_MIN_REGION_PX) continue;
      const c = map.latLngToContainerPoint([p.label[1], p.label[0]]);
      const { w, h } = labelBox(entry.labelText, px);
      const box = { l: c.x - w / 2 - LABEL_GAP_PX, r: c.x + w / 2 + LABEL_GAP_PX, t: c.y - h / 2 - LABEL_GAP_PX, b: c.y + h / 2 + LABEL_GAP_PX };
      const hit = placed.some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b);
      if (hit && !entry.forceLabel) continue;
      placed.push(box);
      visible.add(entry);
    }
    for (const entry of regions.values()) {
      const show = visible.has(entry);
      if (show && !map.hasLayer(entry.label)) entry.label.addTo(map);
      if (!show && map.hasLayer(entry.label)) entry.label.remove();
    }
    el.classList.toggle("show-station-labels", map.getZoom() >= STATION_LABEL_MIN_ZOOM);
  }
  map.on("zoomend", refreshLabels);

  let popup = null;

  return {
    map,
    regions,
    ids: () => [...regions.keys()],
    feature: (id) => regions.get(id).feature,
    onTap(fn) { tapHandler = fn; },

    style(id, style) {
      regions.get(id).layer.setStyle(style);
    },
    // 境界線が隣の領域の線に隠れないよう、前面に描く
    front(id) {
      regions.get(id).layer.bringToFront();
    },
    resetStyles(fn = baseStyle) {
      for (const { feature, layer: lyr } of regions.values()) lyr.setStyle(fn(feature));
    },

    // ラベルの表示。force は小さい領域でも表示するとき(クイズの答え合わせなど)に使う
    label(id, show, { text, cls = "", force = false } = {}) {
      const entry = regions.get(id);
      entry.wantLabel = show;
      entry.forceLabel = force;
      const newText = text ?? entry.feature.properties.name;
      if (newText !== entry.labelText || cls !== entry.labelClass) {
        entry.labelText = newText;
        entry.labelClass = cls;
        entry.label.setIcon(L.divIcon({
          className: `region-label ${entry.feature.properties.kind} ${cls}`, html: labelHtml(newText), iconSize: null,
        }));
      }
      refreshLabels();
    },
    clearLabels() {
      for (const entry of regions.values()) { entry.wantLabel = false; entry.forceLabel = false; }
      refreshLabels();
    },

    popup(id, text, { onClose } = {}) {
      this.closePopup();
      const p = regions.get(id).feature.properties;
      popup = L.popup({ closeButton: false, autoClose: true, closeOnClick: false, className: "name-popup", offset: [0, -4] })
        .setLatLng(p.label.slice().reverse())
        .setContent(text)
        .openOn(map);
      if (onClose) popup.once("remove", onClose);
    },
    closePopup() {
      if (popup) { const p = popup; popup = null; p.remove(); }
    },

    fitAll() { map.fitBounds(bounds); },
    fitIds(ids, opts = {}) {
      const b = L.latLngBounds([]);
      for (const id of ids) b.extend(regions.get(id).layer.getBounds());
      map.fitBounds(b, { padding: [16, 16], ...opts });
    },
    // 小さい領域は、見分けられる大きさまで拡大する
    ensureVisible(id) {
      const entry = regions.get(id);
      const b = entry.layer.getBounds();
      const minPx = 36;
      const r = entry.feature.properties.labelRadius / metersPerPixel(map);
      if (r * 2 < minPx || !map.getBounds().contains(b)) {
        map.fitBounds(b, { padding: [60, 60], maxZoom: 16.5 });
      }
    },

    setLandmarks({ rail: showRail, road: showRoad }) {
      showRail ? rail.addTo(map) : rail.remove();
      showRoad ? road.addTo(map) : road.remove();
    },
    invalidate() { map.invalidateSize(); },
    refreshLabels,
  };
}
