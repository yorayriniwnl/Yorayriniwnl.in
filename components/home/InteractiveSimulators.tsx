'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity, ShieldCheck, Sun, Play, Pause, RefreshCw, Zap, Database } from 'lucide-react';
import { sound } from '@/lib/audio';

export function InteractiveSimulators() {
  const [activeTab, setActiveTab] = useState<'orderbook' | 'threat' | 'solar'>('orderbook');

  return (
    <div className="w-full rounded-2xl bg-[#0d0915] border border-[#b89bd318] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#b89bd318]">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#b29ecb]">
            LAB // REALTIME MICRO-SIMULATORS
          </span>
          <h3 className="text-xl sm:text-2xl font-medium tracking-tight text-[#eee4f8] mt-1">
            Interactive Engineering Telemetry
          </h3>
        </div>

        <div className="flex p-1 rounded-xl bg-[#ffffff05] border border-[#b89bd318] font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setActiveTab('orderbook');
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'orderbook'
                ? 'bg-[#b89bd320] text-[#e8dbf7] shadow-[0_0_12px_rgba(184,155,211,0.2)]'
                : 'text-[#8e7b9f] hover:text-[#c4b4d6]'
            }`}
          >
            <Activity size={13} />
            <span>L2 Orderbook</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setActiveTab('threat');
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'threat'
                ? 'bg-[#b89bd320] text-[#e8dbf7] shadow-[0_0_12px_rgba(184,155,211,0.2)]'
                : 'text-[#8e7b9f] hover:text-[#c4b4d6]'
            }`}
          >
            <ShieldCheck size={13} />
            <span>Neural Threat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setActiveTab('solar');
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'solar'
                ? 'bg-[#b89bd320] text-[#e8dbf7] shadow-[0_0_12px_rgba(184,155,211,0.2)]'
                : 'text-[#8e7b9f] hover:text-[#c4b4d6]'
            }`}
          >
            <Sun size={13} />
            <span>Solar Yield</span>
          </button>
        </div>
      </div>

      {/* Simulator Content */}
      <div className="pt-6">
        {activeTab === 'orderbook' && <OrderbookSimulator />}
        {activeTab === 'threat' && <ThreatDetectionSimulator />}
        {activeTab === 'solar' && <SolarYieldSimulator />}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 1. L2 ORDERBOOK TELEMETRY SIMULATOR
// -------------------------------------------------------------
function OrderbookSimulator() {
  const [bids, setBids] = useState<{ price: number; size: number }[]>([]);
  const [asks, setAsks] = useState<{ price: number; size: number }[]>([]);
  const [spread, setSpread] = useState(0.01);
  const [lastTrade, setLastTrade] = useState<{ price: number; size: number; side: 'buy' | 'sell' }>({
    price: 3412.5,
    size: 1.45,
    side: 'buy',
  });
  const [tps, setTps] = useState(1240);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    // Generate initial orderbook
    let basePrice = 3412.5;
    const initialBids = Array.from({ length: 5 }, (_, i) => ({
      price: +(basePrice - (i + 1) * 0.25).toFixed(2),
      size: +(Math.random() * 8 + 0.5).toFixed(2),
    }));
    const initialAsks = Array.from({ length: 5 }, (_, i) => ({
      price: +(basePrice + (i + 1) * 0.25).toFixed(2),
      size: +(Math.random() * 8 + 0.5).toFixed(2),
    }));
    setBids(initialBids);
    setAsks(initialAsks);

    if (!running) return;

    const interval = setInterval(() => {
      const delta = (Math.random() - 0.49) * 0.15;
      basePrice = Math.max(3000, +(basePrice + delta).toFixed(2));
      const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
      const size = +(Math.random() * 4 + 0.2).toFixed(3);

      setLastTrade({ price: basePrice, size, side });
      setSpread(+(Math.random() * 0.05 + 0.01).toFixed(2));
      setTps(Math.round(1100 + Math.random() * 300));

      setBids(
        Array.from({ length: 5 }, (_, i) => ({
          price: +(basePrice - (i + 1) * 0.25).toFixed(2),
          size: +(Math.random() * 8 + 0.5).toFixed(2),
        }))
      );
      setAsks(
        Array.from({ length: 5 }, (_, i) => ({
          price: +(basePrice + (i + 1) * 0.25).toFixed(2),
          size: +(Math.random() * 8 + 0.5).toFixed(2),
        }))
      );
    }, 280);

    return () => clearInterval(interval);
  }, [running]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#a491b8]">
        <div className="flex items-center gap-4">
          <span>PAIR: <strong className="text-[#eee4f8]">ETH/USDC-PERP</strong></span>
          <span>LATENCY: <strong className="text-[#34d399]">&lt; 14ms</strong></span>
          <span>THROUGHPUT: <strong className="text-[#c6b1ef]">{tps} ticks/s</strong></span>
        </div>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setRunning(!running);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#b89bd320] bg-[#ffffff05] text-[#d6c4f0]"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          <span>{running ? 'Pause Stream' : 'Resume'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bids */}
        <div className="p-4 rounded-xl bg-[#090610] border border-[#34d39925]">
          <div className="flex justify-between text-[11px] font-mono text-[#72bb9b] pb-2 border-b border-[#34d39915]">
            <span>BID PRICE (USDC)</span>
            <span>SIZE (ETH)</span>
          </div>
          <div className="space-y-1.5 mt-2 font-mono text-xs">
            {bids.map((b) => (
              <div key={b.price} className="flex justify-between items-center text-[#9be4c8]">
                <span>{b.price.toFixed(2)}</span>
                <span className="text-[#5ca789]">{b.size.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Asks */}
        <div className="p-4 rounded-xl bg-[#090610] border border-[#f8717125]">
          <div className="flex justify-between text-[11px] font-mono text-[#cf7878] pb-2 border-b border-[#f8717115]">
            <span>ASK PRICE (USDC)</span>
            <span>SIZE (ETH)</span>
          </div>
          <div className="space-y-1.5 mt-2 font-mono text-xs">
            {asks.map((a) => (
              <div key={a.price} className="flex justify-between items-center text-[#f8a5a5]">
                <span>{a.price.toFixed(2)}</span>
                <span className="text-[#b55858]">{a.size.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker tape */}
      <div className="p-3 rounded-lg bg-[#ffffff03] border border-[#b89bd315] flex items-center justify-between font-mono text-xs">
        <span className="text-[#8e7b9f]">LAST MATCHED EXECUTION:</span>
        <span className={lastTrade.side === 'buy' ? 'text-[#34d399]' : 'text-[#f87171]'}>
          {lastTrade.side.toUpperCase()} {lastTrade.size} ETH @ ${lastTrade.price.toFixed(2)}
        </span>
        <span className="text-[#8e7b9f]">SPREAD: ${spread}</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. NEURAL THREAT DETECTION SIMULATOR
// -------------------------------------------------------------
function ThreatDetectionSimulator() {
  const [packets, setPackets] = useState<
    { id: string; ip: string; proto: string; score: number; status: 'CLEAN' | 'SUSPECT' | 'MITIGATED' }[]
  >([]);
  const [sensitivity, setSensitivity] = useState(0.85);

  useEffect(() => {
    const protocols = ['TCP/TLS', 'UDP/QUIC', 'HTTPS', 'SSH', 'DNS-OVER-HTTPS'];
    const ips = ['192.168.1.42', '10.0.8.12', '172.16.254.1', '89.208.29.11', '45.154.255.8'];

    const interval = setInterval(() => {
      const score = +(Math.random()).toFixed(3);
      let status: 'CLEAN' | 'SUSPECT' | 'MITIGATED' = 'CLEAN';
      if (score > sensitivity) status = 'MITIGATED';
      else if (score > sensitivity * 0.75) status = 'SUSPECT';

      const newPacket = {
        id: Math.random().toString(16).substring(2, 8).toUpperCase(),
        ip: ips[Math.floor(Math.random() * ips.length)],
        proto: protocols[Math.floor(Math.random() * protocols.length)],
        score,
        status,
      };

      setPackets((prev) => [newPacket, ...prev.slice(0, 5)]);
    }, 450);

    return () => clearInterval(interval);
  }, [sensitivity]);

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-[#ffffff03] border border-[#b89bd315]">
        <div className="flex items-center gap-3">
          <span className="text-[#a491b8]">CLASSIFIER SENSITIVITY THRESHOLD:</span>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={sensitivity}
            onChange={(e) => setSensitivity(+e.target.value)}
            className="w-32 accent-[#c6b1ef]"
          />
          <strong className="text-[#d8c5f0]">{sensitivity.toFixed(2)}</strong>
        </div>
        <span className="text-[#34d399] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#34d399] animate-ping" />
          FLOW INSPECTOR LIVE
        </span>
      </div>

      <div className="space-y-2">
        {packets.map((p) => (
          <div
            key={p.id + p.score}
            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
              p.status === 'MITIGATED'
                ? 'bg-[#f8717108] border-[#f8717140] text-[#fca5a5]'
                : p.status === 'SUSPECT'
                ? 'bg-[#fbbf2408] border-[#fbbf2435] text-[#fde68a]'
                : 'bg-[#ffffff02] border-[#b89bd315] text-[#c9b8de]'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="text-[#8e7b9f]">PKT-{p.id}</span>
              <span>{p.ip}</span>
              <span className="text-[#8e7b9f]">{p.proto}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>ANOMALY: {p.score.toFixed(3)}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider ${
                  p.status === 'MITIGATED'
                    ? 'bg-[#f8717120] text-[#f87171]'
                    : p.status === 'SUSPECT'
                    ? 'bg-[#fbbf2420] text-[#fbbf24]'
                    : 'bg-[#34d39915] text-[#34d399]'
                }`}
              >
                {p.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 3. SOLAR YIELD & GEOSPATIAL CALCULATOR
// -------------------------------------------------------------
function SolarYieldSimulator() {
  const [roofArea, setRoofArea] = useState(120);
  const [tilt, setTilt] = useState(25);
  const [efficiency, setEfficiency] = useState(21.4);

  // Solar yield projection equation
  const annualKWh = Math.round(roofArea * (efficiency / 100) * 1650 * (1 - Math.abs(tilt - 28) * 0.008));
  const co2OffsetTons = +(annualKWh * 0.00085).toFixed(1);
  const annualSavingsINR = Math.round(annualKWh * 7.5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#ffffff03] border border-[#b89bd315] space-y-2">
          <div className="flex justify-between text-xs font-mono text-[#a491b8]">
            <span>ROOF SURFACE AREA</span>
            <strong className="text-[#eee4f8]">{roofArea} m²</strong>
          </div>
          <input
            type="range"
            min="40"
            max="500"
            step="10"
            value={roofArea}
            onChange={(e) => setRoofArea(+e.target.value)}
            className="w-full accent-[#c6b1ef]"
          />
        </div>

        <div className="p-4 rounded-xl bg-[#ffffff03] border border-[#b89bd315] space-y-2">
          <div className="flex justify-between text-xs font-mono text-[#a491b8]">
            <span>PANEL TILT ANGLE</span>
            <strong className="text-[#eee4f8]">{tilt}°</strong>
          </div>
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={tilt}
            onChange={(e) => setTilt(+e.target.value)}
            className="w-full accent-[#c6b1ef]"
          />
        </div>

        <div className="p-4 rounded-xl bg-[#ffffff03] border border-[#b89bd315] space-y-2">
          <div className="flex justify-between text-xs font-mono text-[#a491b8]">
            <span>PHOTOVOLTAIC EFFICIENCY</span>
            <strong className="text-[#eee4f8]">{efficiency}%</strong>
          </div>
          <input
            type="range"
            min="16"
            max="24"
            step="0.2"
            value={efficiency}
            onChange={(e) => setEfficiency(+e.target.value)}
            className="w-full accent-[#c6b1ef]"
          />
        </div>
      </div>

      {/* Calculated telemetry stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 rounded-xl bg-[#120d1c] border border-[#b89bd320]">
        <div>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#8e7b9f]">
            PROJECTED ANNUAL OUTPUT
          </span>
          <p className="text-2xl font-semibold text-[#e8dbf7] font-mono mt-1">
            {annualKWh.toLocaleString()} <span className="text-xs font-normal text-[#a491b8]">kWh/year</span>
          </p>
        </div>

        <div>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#8e7b9f]">
            CO₂ EMISSION OFFSET
          </span>
          <p className="text-2xl font-semibold text-[#34d399] font-mono mt-1">
            {co2OffsetTons} <span className="text-xs font-normal text-[#9be4c8]">metric tons</span>
          </p>
        </div>

        <div>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#8e7b9f]">
            EST. ANNUAL ELECTRICITY SAVINGS
          </span>
          <p className="text-2xl font-semibold text-[#c6b1ef] font-mono mt-1">
            ₹{annualSavingsINR.toLocaleString()} <span className="text-xs font-normal text-[#a491b8]">/yr</span>
          </p>
        </div>
      </div>
    </div>
  );
}
