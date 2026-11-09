import { ArrowDown, ArrowRight, ArrowUpRight, Cpu, Fingerprint, Layers, MessagesSquare, Network, ScanSearch, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import Link from 'next/link';
import { SignalConstellation } from '@/components/home/SignalConstellation';
import { EvidenceWalkthrough } from '@/components/home/EvidenceWalkthrough';
import { PlatformHeader } from '@/components/navigation/PlatformHeader';
import styles from './home.module.css';

const PROJECTS = [
  {
    index: 'SYS / 01',
    title: 'CandidateX',
    badge: 'FLAGSHIP / LIVE',
    subtitle: 'Evidence-First Hiring Intelligence Platform',
    desc: 'Brings live evidence review into a human-led technical interview workflow. Connects resume claims to public code artifacts, telemetry, and focused interview probes.',
    tags: ['Next.js 16', 'FastAPI', 'PostgreSQL', 'Three.js', 'Playwright'],
    link: 'https://github.com/yorayriniwnl/CandidateX',
  },
  {
    index: 'SYS / 02',
    title: 'Yor Zenith',
    badge: 'SHIPPED / OPEN',
    subtitle: 'Rooftop Solar Intelligence & Planning',
    desc: 'Geospatial feasibility, solar irradiance modeling, subsidy calculation, and financial yield return in one inspectable planning surface.',
    tags: ['TypeScript', 'Python', 'Geospatial ML', 'PostgreSQL', 'Vite'],
    link: 'https://github.com/yorayriniwnl/Yor-Zenith',
  },
  {
    index: 'SYS / 03',
    title: 'Trading Telemetry & Orderbook',
    badge: 'REALTIME / HIGH-THROUGHPUT',
    subtitle: 'Low-Latency Market Execution Streamer',
    desc: 'High-frequency orderbook feeds with deterministic backpressure handling, monotonic sequence checks, and risk circuit breakers.',
    tags: ['Python', 'AsyncIO', 'WebSockets', 'Redis', 'Telemetry'],
    link: 'https://github.com/yorayriniwnl/Hyperliquid_Analysis',
  },
  {
    index: 'SYS / 04',
    title: 'Hybrid Network Intrusion Detection',
    badge: 'RESEARCH / ML',
    subtitle: 'Statistical Anomaly & Neural Threat Classifier',
    desc: 'Two-stage network intrusion detection system combining flow-level statistical anomaly heuristics with deep neural threat classification.',
    tags: ['Python', 'PyTorch', 'Scikit-Learn', 'Packet Inspection', 'Security'],
    link: 'https://github.com/yorayriniwnl/Hybrid-Intelligent-Network-Intrusion-Detection-System',
  },
  {
    index: 'SYS / 05',
    title: 'Taskflow Engine',
    badge: 'CORE / RUNTIME',
    subtitle: 'Distributed Job Orchestrator & Event Broker',
    desc: 'Distributed async task queue and DAG workflow pipeline with automatic retries, dead-letter isolation, and Redis-backed state replication.',
    tags: ['TypeScript', 'Node.js', 'Redis', 'Docker', 'Distributed Systems'],
    link: 'https://github.com/yorayriniwnl/Taskflow',
  },
  {
    index: 'SYS / 06',
    title: 'Mentor-Mentee System',
    badge: 'PLATFORM / INSTITUTION',
    subtitle: 'Academic OS & Role-Based Workflows',
    desc: 'Full-stack platform tracking student progress, milestone deliverables, and automated evaluation workflows for university engineering programs.',
    tags: ['Full-Stack', 'FastAPI', 'PostgreSQL', 'Tailwind CSS', 'Docker'],
    link: 'https://github.com/yorayriniwnl/mentor-mentee-system',
  },
];

export default function HomePage() {
  return (
    <div className={styles.home}>
      <PlatformHeader />
      
      <main className={styles.homeMain} id="main-content">
        {/* HERO SECTION */}
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.statusDot} />
              BACKEND ARCHITECTURE · FULL-STACK SYSTEMS
            </p>
            <h1 id="home-title">
              Architecture with weight.<br />
              <span>Systems with receipts.</span>
            </h1>
            <p className={styles.heroDescription}>
              I design backend-heavy product systems, realtime streaming architectures, applied ML workflows, and evidence-grounded engineering with Python, TypeScript, PostgreSQL, and Redis.
            </p>
            <div className={styles.heroActions}>
              <a href="#projects" className={styles.primaryAction}>
                Explore Shipped Systems
                <span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </span>
              </a>
              <a href="#craft" className={styles.secondaryAction}>
                The Evidence Loop <ArrowDown size={14} aria-hidden="true" />
              </a>
            </div>
            <p className={styles.heroNote}>
              <span />
              Evidence informs. Code proves. People decide.
            </p>
          </div>

          <div className={styles.heroVisual} id="signals">
            <SignalConstellation />
          </div>

          <div className={styles.heroFootnote}>
            <span>ENGINEERED FOR RESILIENCE</span>
            <a href="#projects">
              Follow the systems <ArrowDown size={12} aria-hidden="true" />
            </a>
            <span>EST. IN CURIOSITY / BUILT FOR PRODUCTION</span>
          </div>
        </section>

        {/* METRIC / PRINCIPLE RAIL */}
        <div className={styles.principleRail} aria-label="Engineering metrics">
          <p>
            Careful systems.<br />
            <strong>Deterministic outcomes.</strong>
          </p>
          <div>
            <strong>08<span> /</span></strong>
            <span>Shipped systems &amp; tools</span>
          </div>
          <div>
            <strong>&lt; 50ms<span> /</span></strong>
            <span>Realtime state sync latency</span>
          </div>
          <div>
            <strong>Verified<span> /</span></strong>
            <span>Tests &amp; reproducible receipts</span>
          </div>
        </div>

        {/* SYSTEMS / PROJECTS GRID */}
        <section id="projects" className={styles.section} aria-labelledby="projects-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>01 / THE WORK &amp; SYSTEMS</p>
              <h2 id="projects-title">
                Shipped products.<br />
                <span>Engineered with intention.</span>
              </h2>
            </div>
            <p>
              Each system addresses a real boundary condition: concurrency, state persistence, geospatial telemetry, or verifiable intelligence.
            </p>
          </div>

          <div className={styles.projectsGrid}>
            {PROJECTS.map((project) => (
              <article key={project.title} className={styles.projectCard}>
                <div className={styles.projectMeta}>
                  <span className={styles.projectIndex}>{project.index}</span>
                  <span className={styles.projectBadge}>{project.badge}</span>
                </div>
                <h3>{project.title}</h3>
                <p className={styles.projectSubtitle}>{project.subtitle}</p>
                <p className={styles.projectDesc}>{project.desc}</p>
                <div className={styles.projectTags}>
                  {project.tags.map((tag) => (
                    <span key={tag} className={styles.projectTag}>{tag}</span>
                  ))}
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.projectAction}
                    aria-label={`View ${project.title} on GitHub`}
                  >
                    Inspect Code <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* EVIDENCE WALKTHROUGH SECTION */}
        <section id="craft" className={styles.section} aria-labelledby="craft-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>02 / THE EVIDENCE LOOP</p>
              <h2 id="craft-title">
                From an architectural claim.<br />
                <span>To verifiable code.</span>
              </h2>
            </div>
            <p>
              Good engineering is more than choosing the right stack. It is knowing what can fail and inspecting the evidence.
            </p>
          </div>
          <EvidenceWalkthrough />
        </section>

        {/* TRUST & ENGINEERING PRINCIPLES */}
        <section className={styles.section} aria-labelledby="trust-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>03 / THE PRACTICE</p>
              <h2 id="trust-title">
                The craft is in<br />
                <span>the connections.</span>
              </h2>
            </div>
            <p>
              Software architecture that prioritizes transparency, boundary safety, and performance.
            </p>
          </div>

          <div className={styles.trustGrid}>
            <article>
              <Layers size={25} strokeWidth={1.2} aria-hidden="true" />
              <span className={styles.trustNumber}>01</span>
              <h3>Product Engineering</h3>
              <p>Interfaces, typed APIs, and deterministic backend pipelines that make the product experience dependable under load.</p>
            </article>

            <article>
              <Network size={25} strokeWidth={1.2} aria-hidden="true" />
              <span className={styles.trustNumber}>02</span>
              <h3>Realtime Architecture</h3>
              <p>WebSockets, event queues, state synchronization, and the invisible design decisions behind responsive systems.</p>
            </article>

            <article>
              <Terminal size={25} strokeWidth={1.2} aria-hidden="true" />
              <span className={styles.trustNumber}>03</span>
              <h3>Evidence-Led Research</h3>
              <p>Applied ML, careful latency measurements, intrusion heuristics, and engineering case studies with reproducible receipts.</p>
            </article>
          </div>
        </section>

        {/* ABOUT SECTION */}
        <section id="about" className={styles.section} aria-labelledby="about-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>04 / THE PERSON BEHIND THE CODE</p>
              <h2 id="about-title">
                Curious by<br />
                <span>design.</span>
              </h2>
            </div>
            <p>
              Studying Computer Science and Communication Engineering with a focus on systems that feel as good as they run.
            </p>
          </div>

          <div className={styles.aboutCard}>
            <div className={styles.aboutProfile}>
              <h3>Ayush Roy <span className="text-[#a491b8] font-normal text-lg">/ YOR</span></h3>
              <p>
                I care about how software <em>feels</em> as much as how it works. I build backend-heavy product systems, explore applied machine learning, and enjoy untangling complicated technical problems into crisp, accessible software.
              </p>
              <p>
                Away from conventional backend engineering, I design interactive visual scenes, study financial orderbooks, and build developer tools.
              </p>
            </div>

            <div className={styles.factsList}>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>Focus</span>
                <span className={styles.factValue}>Backend Architecture · Full-Stack Systems</span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>Education</span>
                <span className={styles.factValue}>B.Tech in CS &amp; CE at KIIT (Graduating 2027)</span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>Primary Stack</span>
                <span className={styles.factValue}>Python · TypeScript · FastAPI · Next.js · PostgreSQL · Redis</span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>Location</span>
                <span className={styles.factValue}>Bhubaneswar, Odisha, India</span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>Availability</span>
                <span className={styles.factValue}><span className="text-[#34d399]">●</span> Open to Software Engineering Roles</span>
              </div>
            </div>
          </div>
        </section>

        {/* CLOSING CALLOUT */}
        <section id="contact" className={styles.closing} aria-labelledby="closing-title">
          <div className={styles.closingOrbit} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className={styles.sectionEyebrow}>LOOK CLOSER. BUILD TOGETHER.</p>
          <h2 id="closing-title">
            Have something<br />
            <span>worth building?</span>
          </h2>
          <Link
            href="mailto:ayushroy.dev@gmail.com"
            className={styles.primaryAction}
          >
            <span>Reach out directly (ayushroy.dev@gmail.com)</span>
            <span>
              <ArrowRight size={17} aria-hidden="true" />
            </span>
          </Link>
          <p className={styles.closingNote}>
            Interesting challenge, engineering opportunity, or good conversation? I&apos;m listening.
          </p>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerIdentity}>
            <Link href="/" className={styles.footerBrand}>
              YOR <span>/ AYUSH ROY</span>
            </Link>
            <p>
              Backend systems. Realtime architectures.<br />
              Candidate intelligence with receipts.
            </p>
          </div>

          <div className={styles.footerColumn}>
            <h2>Systems</h2>
            <a href="https://github.com/yorayriniwnl/CandidateX" target="_blank" rel="noopener noreferrer">CandidateX</a>
            <a href="https://github.com/yorayriniwnl/Yor-Zenith" target="_blank" rel="noopener noreferrer">Yor Zenith</a>
            <a href="https://github.com/yorayriniwnl/Taskflow" target="_blank" rel="noopener noreferrer">Taskflow</a>
          </div>

          <div className={styles.footerColumn}>
            <h2>Navigation</h2>
            <a href="#projects">Shipped Work</a>
            <a href="#craft">The Evidence Loop</a>
            <a href="#about">About &amp; Background</a>
            <a href="#contact">Contact</a>
          </div>

          <div className={styles.footerColumn}>
            <h2>Profiles &amp; Code</h2>
            <a href="https://github.com/yorayriniwnl" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            <a href="https://www.linkedin.com/in/yorayriniwnl" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
            <a href="mailto:ayushroy.dev@gmail.com">Email ↗</a>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.footerCompany}>
            <span>COMPANY</span>
            <strong>Yor Ayrin - iwnl Private Limited.</strong>
          </p>
          <span>DESIGNED WITH CURIOSITY. BUILT WITH CARE.</span>
        </div>
      </footer>
    </div>
  );
}
