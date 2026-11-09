'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, Braces, Check, FileCode, Terminal } from 'lucide-react';
import Link from 'next/link';
import { sound } from '@/lib/audio';
import styles from './walkthrough.module.css';

const STEPS = [
  { label: 'Start with the system claim', text: 'An architectural thesis opens the design. It gives you an explicit boundary to test.', icon: FileCode },
  { label: 'Inspect the running artifact', text: 'Trace the statement directly to code, event streams, and error boundaries.', icon: Braces },
  { label: 'Examine production receipts', text: 'Measure latency, fault isolation, and verification logs with uncertainty intact.', icon: Terminal },
];

const CODE = [
  '// High-throughput orderbook stream with backpressure handling',
  'export async function subscribeToFeed(symbol: string, onUpdate: (data: Tick) => void) {',
  '  const ws = new WebSocketStream(ENDPOINT);',
  '  for await (const chunk of ws.readable) {',
  '    const frame = decodeBinaryFrame(chunk);',
  '    if (frame.sequence !== expectedSeq) {',
  '      await resyncOrderbookSnapshot(symbol);',
  '    }',
  '    onUpdate(frame.tick);',
  '  }',
  '}',
];

export function EvidenceWalkthrough() {
  const [active, setActive] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % STEPS.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + STEPS.length - 1) % STEPS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = STEPS.length - 1;
    else return;
    event.preventDefault();
    sound.playClick();
    setActive(next);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div className={styles.walkthrough}>
      <div className={styles.steps}>
        <div className={styles.tabList} role="tablist" aria-label="Follow an engineering walkthrough" aria-orientation="vertical">
          {STEPS.map(({ label, text, icon: Icon }, index) => (
            <button
              key={label}
              ref={el => { buttonRefs.current[index] = el; }}
              type="button"
              role="tab"
              id={`evidence-step-${index}`}
              aria-selected={active === index}
              aria-controls="evidence-example-panel"
              tabIndex={active === index ? 0 : -1}
              onMouseEnter={() => sound.playHover()}
              onClick={() => {
                sound.playClick();
                setActive(index);
              }}
              onKeyDown={event => navigate(event, index)}
            >
              <span className={styles.stepNumber}>0{index + 1}</span>
              <span className={styles.stepCopy}>
                <strong>{label}</strong>
                <span>{text}</span>
              </span>
              <Icon size={17} strokeWidth={1.3} aria-hidden="true" />
            </button>
          ))}
        </div>
        <Link
          href="https://github.com/yorayriniwnl"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sound.playClick()}
          className={styles.tryLink}
        >
          Inspect GitHub repositories <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className={styles.example}>
        <div className={styles.exampleBar}>
          <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
          <span>YOR / ARCHITECTURE TRACE</span>
          <span className={styles.exampleBadge}>Telemetry proof</span>
        </div>
        <div className={styles.trace} aria-hidden="true">
          <span data-active={active === 0}>DESIGN CLAIM</span>
          <i />
          <span data-active={active === 1}>CODE ARTIFACT</span>
          <i />
          <span data-active={active === 2}>VERIFIED RECEIPTS</span>
        </div>
        <div className={styles.panel} role="tabpanel" id="evidence-example-panel" aria-labelledby={`evidence-step-${active}`} tabIndex={0}>
          <div key={active} className={styles.panelContent}>
            {active === 0 && (
              <>
                <div className={styles.documentHeading}>
                  <span className={styles.documentIcon}><FileCode size={19} strokeWidth={1.3} /></span>
                  <div>
                    <strong>System Blueprint: Trading Execution</strong>
                    <span>Realtime / Low-Latency Orderbook</span>
                  </div>
                  <span className={styles.sourceTag}>SPECIFICATION</span>
                </div>
                <div className={styles.claim}>
                  <blockquote>
                    Deterministic latency.<br />
                    <span>Zero unhandled re-syncs.</span>
                  </blockquote>
                  <div className={styles.claimUnderline} />
                  <p>In high-frequency WebSocket streams, network jitter must never produce state desynchronization.</p>
                </div>
                <div className={styles.insight}>
                  <span className={styles.insightDot} />
                  <div>
                    <strong>The claim sets the benchmark.</strong>
                    <p>Track monotonic sequence IDs. Buffer incoming updates during snapshot requests to preserve strict temporal order.</p>
                  </div>
                </div>
              </>
            )}

            {active === 1 && (
              <>
                <div className={styles.documentHeading}>
                  <span className={styles.documentIcon}><Braces size={19} strokeWidth={1.3} /></span>
                  <div>
                    <strong>Source: Hyperliquid Streamer</strong>
                    <span>Python / AsyncIO / WebSockets</span>
                  </div>
                  <span className={styles.sourceTag}>IMPLEMENTED</span>
                </div>
                <div className={styles.code}>
                  {CODE.map((line, idx) => (
                    <div key={idx} data-highlight={idx === 6 || idx === 7}>
                      <span>{idx + 1}</span>
                      <code>{line}</code>
                    </div>
                  ))}
                </div>
                <div className={styles.findings}>
                  <span><Check size={12} strokeWidth={2.5} /> Sequence validation intact</span>
                  <span><i></i> Deterministic backpressure</span>
                </div>
              </>
            )}

            {active === 2 && (
              <>
                <div className={styles.documentHeading}>
                  <span className={styles.documentIcon}><Terminal size={19} strokeWidth={1.3} /></span>
                  <div>
                    <strong>Verification & Benchmarks</strong>
                    <span>Production Telemetry Report</span>
                  </div>
                  <span className={styles.sourceTag}>VERIFIED</span>
                </div>
                <div className={styles.question}>
                  <span>BENCHMARK RESULTS // P99 LATENCY &lt; 24MS</span>
                  <blockquote>
                    50,000 frames processed.<br />
                    <span>0 dropped frames.</span>
                  </blockquote>
                  <div className={styles.questionTags}>
                    <span>Automated test suite passing</span>
                    <span>100% typecheck</span>
                    <span>Zero unhandled exceptions</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className={styles.exampleFooter}>
          <span>Every system is backed by verifiable code and tests.</span>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setActive((active + 1) % STEPS.length);
            }}
          >
            <span>Next inspection</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
