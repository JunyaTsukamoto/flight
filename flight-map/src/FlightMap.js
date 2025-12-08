import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Pane, Tooltip, Marker, useMapEvent } from "react-leaflet";
import axios from "axios";
import { endpoints } from "./api";
import "leaflet/dist/leaflet.css";
import "./map-effects.css";
import L from "leaflet";

const starIcon = new L.DivIcon({
    html: `
        <svg width="30" height="30" viewBox="0 0 24 24">
            <path
                d="M12 2 L15 9 H22 L17 14 L19 21 L12 17 L5 21 L7 14 L2 9 H9 Z"
                fill="gold"
                stroke="black"
                stroke-width="1.5"
            />
        </svg>
    `,
    className: "star-icon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
});

const IMPORTANT_AIRPORT_CODES = new Set([
    "HND", // 羽田
    "NRT", // 成田
    "CTS", // 新千歳
    "MMB", // 女満別
    "OBO", // 帯広
    "AXT", // 秋田
    "TKG", // 但馬
    "NGS", // 長崎
    "KMJ", // 熊本
    "KOJ", // 鹿児島
    "ITM", // 伊丹
    "NGO", // 中部
    "KMI", // 宮崎
    "TNE", // 種子島
    "KUM", // 屋久島
    "ISG", // 石垣
    "KUH" // 釧路
]);

// 地図のどこかをクリックしたら選択解除するコンポーネント（修正版）
const MapClickClearer = ({ clearSelection }) => {
    useMapEvent("click", (e) => {
        // クリックされた実際のDOM要素を取得
        const target = e.originalEvent.target;

        // その要素が「leaflet-interactive」（＝マーカーや線など）のクラスを持っているか確認
        // SVG要素(CircleMarker)の場合、これで判定できます
        const isInteractive = target.classList.contains("leaflet-interactive");

        // インタラクティブな要素（マーカー等）以外の場所をクリックした時だけ解除を実行
        if (!isInteractive) {
            clearSelection();
        }
    });
    return null;
};

const FlightMap = () => {
    const [airports, setAirports] = useState([]);
    const [flights, setFlights] = useState([]);
    const [selectedAirport, setSelectedAirport] = useState(null);


    // 末尾「空港」を落として空白を詰め、小文字化
    const norm = (s) => (s || "").replace(/空港$/u, "").replace(/\s+/g, "").trim().toLowerCase();

    useEffect(() => {
        axios.get(endpoints.airports).then((res) => setAirports(res.data));
        axios.get(endpoints.flights).then((res) => setFlights(res.data));
    }, []);

    // ある空港からの便（選択パネル用）
    const getRoutesFromAirport = (airportName) => {
        const key = norm(airportName);
        return flights.filter((f) => norm(f["出発空港"]) === key);
    };

    // 空港名で緯度経度を取得（表記ゆれ吸収）
    const getLatLonByAirport = (name) => {
        const key = norm(name);
        const hit = airports.find((a) => norm(a["空港名"]) === key);
        return hit ? [hit["緯度"], hit["経度"]] : null;
    };

    const COLORS = {
        base: "#778899",     // 非選択（薄いグレー）
        highlight: "#ff0000" // 選択（濃い赤）
    };

    const selectedKey = norm(selectedAirport);
    const selecting = !!selectedKey;

    // 選択空港と「つながっている空港」のキー集合
    const connectedKeys = React.useMemo(() => {
        if (!selectedKey) return new Set();
        const set = new Set([selectedKey]);

        // 出発＝選択 → 到着先を追加
        flights.forEach(f => {
            const o = norm(f["出発空港"]);
            const d = norm(f["到着空港"]);
            if (o === selectedKey) set.add(d);
            if (d === selectedKey) set.add(o); // ← 到着＝選択 → 出発元も追加（双方向につながりを保持）
        });

        return set;
    }, [selectedKey, flights]);

    // 描画順制御：非選択 → 選択（選択線を上に重ねる）
    const otherFlights   = flights.filter((f) => norm(f["出発空港"]) !== selectedKey);
    const selectedFlights= flights.filter((f) => norm(f["出発空港"]) === selectedKey);

    // A⇄B 双方向の便一覧を取得（時間順）
    const getBiDirFlights = (a, b) => {
        const A = norm(a), B = norm(b);
        const byTime = (x, y) => String(x["出発時刻"]).localeCompare(String(y["出発時刻"]));
        const ab = flights.filter(f => norm(f["出発空港"]) === A && norm(f["到着空港"]) === B).sort(byTime);
        const ba = flights.filter(f => norm(f["出発空港"]) === B && norm(f["到着空港"]) === A).sort(byTime);
        return { ab, ba };
    };


    return (
        <MapContainer center={[44.5, 142]} zoom={6} style={{ height: "100%", width: "100%" }}>

            <MapClickClearer clearSelection={() => setSelectedAirport(null)} />

            <TileLayer
                // attribution='&copy; OSM'
                // url="https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className={selectedAirport ? "tiles-dimmed" : ""}
                opacity={selectedAirport ? 0.5 : 1}  // ほんの少し透明にも
            />

            {/* レイヤーパン：線 < ポイント < 空港Popup < ルートTooltip */}
            <Pane name="routes"          style={{ zIndex: 400 }} />
            <Pane name="points"          style={{ zIndex: 800 }} />
            <Pane name="airport-popups"  style={{ zIndex: 850 }} />
            <Pane name="route-tooltips"  style={{ zIndex: 900, pointerEvents: 'none' }} />

            {/* --- 非選択（下層） --- */}
            {otherFlights.map((flight, i) => {
                const fromName = flight["出発空港"];
                const toName   = flight["到着空港"];
                const from = getLatLonByAirport(fromName);
                const to   = getLatLonByAirport(toName);
                if (!from || !to) return null;

                const { ab, ba } = getBiDirFlights(fromName, toName);

                return (
                    <Polyline
                        key={`o-${i}`}
                        pane="routes"
                        positions={[from, to]}
                        pathOptions={{ color: COLORS.base, weight: selecting ? 1 : 1, opacity: selecting ? 0.08 : 0.6 }}
                        eventHandlers={{
                            mouseover: (e) => e.target.setStyle({ weight: selecting ? 1 : 1, opacity: selecting ? 0.35 : 0.8 }),
                            mouseout:  (e) => e.target.setStyle({ weight: selecting ? 1 : 1, opacity: selecting ? 0.2  : 0.6 }),
                        }}
                    >
                        <Tooltip pane="route-tooltips" sticky direction="top" opacity={1}>
                            <div style={{ minWidth: 240 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{fromName} ⇄ {toName}</div>
                                <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontWeight: 600 }}>{fromName} → {toName}</div>
                                    {ab.length ? ab.map((f, idx) => (
                                        <div key={`ab-${idx}`}>✈ {f["出発時刻"]} → {f["到着時刻"]} [{f["便名"]}]</div>
                                    )) : <div style={{ opacity: .6 }}>該当なし</div>}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{toName} → {fromName}</div>
                                    {ba.length ? ba.map((f, idx) => (
                                        <div key={`ba-${idx}`}>✈ {f["出発時刻"]} → {f["到着時刻"]} [{f["便名"]}]</div>
                                    )) : <div style={{ opacity: .6 }}>該当なし</div>}
                                </div>
                            </div>
                        </Tooltip>
                    </Polyline>
                );
            })}

            {/* --- 選択（上層） --- */}
            {selectedFlights.map((flight, i) => {
                const fromName = flight["出発空港"];
                const toName   = flight["到着空港"];
                const from = getLatLonByAirport(fromName);
                const to   = getLatLonByAirport(toName);
                if (!from || !to) return null;

                const { ab, ba } = getBiDirFlights(fromName, toName);

                return (
                    <Polyline
                        key={`s-${i}`}
                        pane="routes"
                        positions={[from, to]}
                        pathOptions={{ color: COLORS.highlight, weight: 3, opacity: 1 }}
                        eventHandlers={{
                            mouseover: (e) => e.target.setStyle({ weight: 5, opacity: 1 }),
                            mouseout:  (e) => e.target.setStyle({ weight: 3, opacity: 0.95 }),
                        }}
                    >
                        <Tooltip pane="route-tooltips" sticky direction="top" opacity={1}>
                            <div style={{ minWidth: 240 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{fromName} ⇄ {toName}</div>
                                <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontWeight: 600 }}>{fromName} → {toName}</div>
                                    {ab.length ? ab.map((f, idx) => (
                                        <div key={`ab-${idx}`}>✈ {f["出発時刻"]} → {f["到着時刻"]} [{f["便名"]}]</div>
                                    )) : <div style={{ opacity: .6 }}>該当なし</div>}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{toName} → {fromName}</div>
                                    {ba.length ? ba.map((f, idx) => (
                                        <div key={`ba-${idx}`}>✈ {f["出発時刻"]} → {f["到着時刻"]} [{f["便名"]}]</div>
                                    )) : <div style={{ opacity: .6 }}>該当なし</div>}
                                </div>
                            </div>
                        </Tooltip>
                    </Polyline>
                );
            })}


            {/* --- 空港ポイント（最前面）--- */}
            {airports.map((airport, i) => {
                const k = norm(airport["空港名"]);
                const keepBright = selecting && connectedKeys.has(k);
                const dim = selecting && !keepBright;

                // ⭐ 重要空港（コードで判定）
                const isImportant = IMPORTANT_AIRPORT_CODES.has(airport["コード"]);

                // ⭐ 重要空港 → 星マーカー
                if (isImportant) {
                    return (
                        <Marker
                            key={`star-${airport["コード"]}`}
                            pane="points"
                            position={[airport["緯度"], airport["経度"]]}
                            icon={starIcon}
                            eventHandlers={{
                                click: (e) => {
                                    // 地図(Map)へのクリック伝播を止める
                                    e.originalEvent?.stopPropagation();
                                    const clicked = norm(airport["空港名"]);
                                    setSelectedAirport(prev =>
                                        prev && norm(prev) === clicked ? null : airport["空港名"]
                                    );
                                }
                            }}
                        >
                            <Tooltip
                                pane="airport-popups"
                                direction="top"
                                opacity={1}
                                sticky
                                className="airport-tooltip"
                            >
                                {airport["空港名"]}
                            </Tooltip>
                        </Marker>
                    );
                }

                // 🔴 通常空港 → 赤丸
                return (
                    <CircleMarker
                        key={`cm-${airport["コード"]}`}
                        pane="points"
                        center={[airport["緯度"], airport["経度"]]}
                        radius={5}
                        pathOptions={{
                            color: dim ? "#9aa4ad" : "#000000",
                            weight: 1,
                            fillColor: dim ? "#ff8888" : "#ff0000",
                            fillOpacity: dim ? 0.25 : 1,
                        }}
                        eventHandlers={{
                            click: (e) => {
                                // 地図(Map)へのクリック伝播を止める
                                L.DomEvent.stopPropagation(e.originalEvent);
                                const clicked = norm(airport["空港名"]);
                                setSelectedAirport(prev =>
                                    prev && norm(prev) === clicked ? null : airport["空港名"]
                                );
                            },
                        }}
                    >
                        <Tooltip
                            pane="airport-popups"
                            direction="top"
                            opacity={1}
                            sticky
                            className="airport-tooltip"
                        >
                            {airport["空港名"]}
                        </Tooltip>
                    </CircleMarker>
                );
            })}







            {/* 選択時の時刻表パネル */}
            {selectedAirport && (
                <div
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        background: "white",
                        padding: "10px",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        boxShadow: "0 0 5px rgba(0,0,0,.2)",
                        zIndex: 1000,
                        borderRadius: 6
                    }}
                >
                    <h3 style={{ margin: "6px 0 10px" }}>{selectedAirport} 空港発の便</h3>
                    {getRoutesFromAirport(selectedAirport).map((f, i) => (
                        <div key={i} style={{ lineHeight: 1.6 }}>
                            ✈️ {f["出発時刻"]} → {f["到着空港"]}（{f["到着時刻"]}） [{f["便名"]}]
                        </div>
                    ))}
                </div>
            )}
        </MapContainer>
    );
};

export default FlightMap;
