'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { SignalScene } from './signal-scene';
import styles from './signal.module.css';
import { sound } from '@/lib/audio';

const STAGES = [
  { label: 'Architecture', title: 'Systems engineered with weight.', detail: 'Backend pipelines, state management, and memory boundaries built for production load.' },
  { label: 'Realtime', title: 'Low-latency state synchronization.', detail: 'WebSockets, orderbook feeds, and event architectures designed for sub-50ms responsiveness.' },
  { label: 'Applied ML', title: 'Grounded intelligence & models.', detail: 'Network intrusion detection, signal telemetry, and evaluation workflows with rigorous testing.' },
  { label: 'Evidence', title: 'Inspection, receipts, and proofs.', detail: 'Every architectural claim backed by measurable benchmarks, clear boundaries, and code.' },
];
const LABELS = ['Core Architecture', 'Realtime Sync', 'Applied ML', 'Verified Receipts'];

export function SignalConstellation() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<SignalScene | null>(null);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [surprise, setSurprise] = useState<{ id: number; name: string; label: string } | null>(null);
  const surpriseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const element = host.current!;
    let disposed = false;
    let loading = false;
    let visible = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      pausedRef.current = preference.matches;
      setPaused(preference.matches);
      scene.current?.setPaused(preference.matches);
    };
    updatePreference();
    preference.addEventListener('change', updatePreference);

    const onWarpEvent = () => {
      if (scene.current) {
        scene.current.triggerSurprise();
        const nextStage = (activeRef.current + 1) % STAGES.length;
        activeRef.current = nextStage;
        setActive(nextStage);
        scene.current.setStage(nextStage);
      }
    };
    window.addEventListener('yor-constellation-warp', onWarpEvent);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      scene.current?.setVisible(visible);
      if (!visible || loading) return;
      loading = true;
      void import('./signal-scene').then(({ createSignalScene }) => {
        if (disposed) return;
        scene.current = createSignalScene(
          element,
          Array.from(labels.current!.children) as HTMLElement[],
          () => { if (!disposed) setReady(false); },
          info => {
            if (disposed) return;
            if (surpriseTimer.current) clearTimeout(surpriseTimer.current);
            setSurprise({ id: Date.now(), ...info });
            surpriseTimer.current = setTimeout(() => {
              if (!disposed) setSurprise(null);
            }, 2600);
          }
        );
        scene.current.setStage(activeRef.current);
        scene.current.setPaused(pausedRef.current);
        scene.current.setVisible(visible);
        setReady(true);
      }).catch(() => {
        if (!disposed) element.dataset.renderer = 'fallback';
      });
    });
    observer.observe(element);
    return () => {
      disposed = true;
      if (surpriseTimer.current) clearTimeout(surpriseTimer.current);
      observer.disconnect();
      preference.removeEventListener('change', updatePreference);
      window.removeEventListener('yor-constellation-warp', onWarpEvent);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  function toggleMotion() {
    sound.playClick();
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    scene.current?.setPaused(pausedRef.current);
  }

  function selectStage(index: number) {
    sound.playClick();
    activeRef.current = index;
    setActive(index);
    scene.current?.setStage(index);
  }

  return (
    <div className={styles.engine} data-testid="signal-observatory" data-ready={ready} data-motion={paused ? 'paused' : 'playing'}>
      <div className={styles.heading}>
        <span className={styles.instrumentNumber}>YOR / 01</span>
        <span>The Signal Constellation</span>
        <span className={styles.edition}>Interactive 3D Engine</span>
      </div>
      <div className={styles.stage} ref={host} aria-hidden="true">
        {surprise && (
          <div className={styles.surpriseHud} key={surprise.id} data-testid="signal-surprise-badge" role="status">
            <div className={styles.surprisePill}>
              <span className={styles.surpriseTag}>{surprise.name}</span>
              <span className={styles.surpriseDetail}>{surprise.label}</span>
            </div>
          </div>
        )}
        <div className={styles.aura} />
        <div className={styles.crosshair} />
        <span className={styles.axisTop}>FIELD / SIGNAL</span>
        <span className={styles.axisBottom}>VECTOR / EQUILIBRIUM</span>
        <div className={styles.labels} ref={labels} aria-hidden="true">
          {LABELS.map((label, idx) => (
            <div key={label} className={styles.nodeLabel} data-node={idx} data-active={active === idx}>
              <i />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.console}>
        <div className={styles.controls}>
          <div className={styles.stages} role="tablist" aria-label="Constellation lenses">
            {STAGES.map((s, idx) => (
              <button
                key={s.label}
                type="button"
                role="tab"
                aria-pressed={active === idx}
                onMouseEnter={() => sound.playHover()}
                onClick={() => selectStage(idx)}
              >
                <span>0{idx + 1}</span>
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.motionButton}
            onClick={toggleMotion}
            aria-label={paused ? 'Play motion' : 'Pause motion'}
          >
            {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          </button>
        </div>
        <div className={styles.caption}>
          <strong>{STAGES[active].title}</strong>
          <p>{STAGES[active].detail}</p>
        </div>
      </div>
    </div>
  );
}
