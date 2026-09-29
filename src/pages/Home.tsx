import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Copy, CreditCard, Mail, Play, Plus, RotateCcw, Truck } from 'lucide-react';
import { cn } from '../utils/cn';
import GlitchGrid from '../components/GlitchGrid';
import { PrivacyPolicyModal, TermsOfServiceModal } from '../LegalPages';

const EMAIL = 'babysitterbs9@gmail.com';
const INSTAGRAM_URL = 'https://www.instagram.com/babysitter_bs/?hl=en';
const WHATSAPP_URL = 'https://whatsapp.com/channel/0029Vb6wcCeLCoWwT54KMn01';
const CATALOG_PATH = '/smilano';
const VIDEO_SRC = '/media/bs%20SHOOT.mp4';

const colors = {
  bgDeep: '#0a0a0a',
  card: '#1a1a1a',
  textPrimary: '#e5e5e5',
  textSecondary: '#a3a3a3',
  accentGlow: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.08)',
};

const navPills = [
  { label: 'Shipping', href: '#shipping', icon: Truck },
  { label: 'Returns', href: '#returns', icon: RotateCcw },
  { label: 'Payments', href: '#payments', icon: CreditCard },
  { label: 'Contact', href: '#contact', icon: Mail },
];

// ──────────────────────────────────────────────────────────────
// Garment care symbols, used as the help desk's section markers
// ──────────────────────────────────────────────────────────────
type CareKind = 'wash' | 'bleach' | 'iron' | 'dry';

const CareSymbol = ({ kind, className }: { kind: CareKind; className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden="true">
    {kind === 'wash' && (
      <>
        <path d="M3 9l3 17h20l3-17" />
        <path d="M3 9c3 3 5 3 6.5 0s3.5-3 6.5 0 5 3 6.5 0 3.5-3 6.5 0" />
        <text x="16" y="22" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" stroke="none" fill="currentColor">30</text>
      </>
    )}
    {kind === 'bleach' && <path d="M16 4L29 27H3z" />}
    {kind === 'iron' && (
      <>
        <path d="M4 25h24v-5a8 8 0 0 0-8-8H9L4 25z" />
        <circle cx="16" cy="20" r="1.3" fill="currentColor" stroke="none" />
      </>
    )}
    {kind === 'dry' && (
      <>
        <rect x="4" y="4" width="24" height="24" />
        <circle cx="16" cy="16" r="8" />
      </>
    )}
  </svg>
);

type Faq = { question: string; answer: string };
type FaqSection = { id: string; label: string; title: string; note: string; symbol: CareKind; items: Faq[] };

const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'shipping',
    label: '01',
    title: 'Shipping & Delivery',
    note: 'Getting it to your door',
    symbol: 'wash',
    items: [
      {
        question: 'How long does delivery take?',
        answer: 'Orders usually ship within 1–2 business days, with delivery in 3–5 business days for standard shipping.',
      },
      {
        question: 'How much is delivery?',
        answer:
          'Any delivery fee is shown at checkout before you pay. Where collection is offered you can choose it instead at no fee, and we’ll call you to arrange pickup.',
      },
    ],
  },
  {
    id: 'returns',
    label: '02',
    title: 'Returns & Exchanges',
    note: 'Faulty items, within 7 days',
    symbol: 'bleach',
    items: [
      {
        question: 'What is your return policy?',
        answer:
          'Items that are faulty, damaged or not as described can be returned within 7 days of delivery. Please ensure all tags are attached and the item is unworn and unwashed.',
      },
      {
        question: 'How do I make a return?',
        answer: 'Please visit our Instagram @babysitter_bs and send us a DM.',
      },
    ],
  },
  {
    id: 'payments',
    label: '03',
    title: 'Orders & Payments',
    note: 'Paying, tracking, drops',
    symbol: 'iron',
    items: [
      {
        question: 'What payment methods do you accept?',
        answer: 'All transactions are securely processed via Yoco and encrypted. We accept all major credit and debit cards.',
      },
      {
        question: 'How can I track my order?',
        answer:
          'A tracking link will be emailed to you once your order has shipped. You can also check your order status by contacting our support team.',
      },
      {
        question: 'How do I hear about new drops?',
        answer: 'Join our WhatsApp channel or follow @babysitter_bs on Instagram. New drops are announced there first.',
      },
    ],
  },
];

const Highlight = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-[#ff3b1f]/25 text-inherit rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// Hero: drop 001 gets stamped sold out, drop 002 is live

// ──────────────────────────────────────────────────────────────
// The brand film, layered so it lifts off the page: a glow sampled
// from the playing video, offset frames behind it, a tilt that
// follows the cursor, and a camcorder HUD on top.
// ──────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const timecode = (t: number) => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(Math.floor((t % 1) * 25))}`;

const FilmFrame = ({ reduce }: { reduce: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(true);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 120, damping: 14 });
  const rotateY = useSpring(tiltY, { stiffness: 120, damping: 14 });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = glowRef.current;
    const ctx = canvas?.getContext('2d');
    if (!video || !canvas || !ctx) return;
    const id = window.setInterval(() => {
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (timecodeRef.current) timecodeRef.current.textContent = timecode(video.currentTime);
    }, reduce ? 1000 : 120);
    return () => window.clearInterval(id);
  }, [reduce]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - rect.left) / rect.width - 0.5) * 8);
    tiltX.set(-((e.clientY - rect.top) / rect.height - 0.5) * 6);
  };
  const onMouseLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <div className="relative" style={{ perspective: 1200 }}>
      <canvas
        ref={glowRef}
        width={32}
        height={18}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full scale-110 blur-[70px] opacity-60 saturate-150 pointer-events-none"
      />

      <motion.div
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative"
      >
        {/* Offset plates behind the film */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl border border-white/20 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]"
          style={{
            transform: 'translate3d(22px, 22px, -60px)',
            backgroundColor: '#151515',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl border-2 border-[#ff2b4a]/70 animate-frame-jitter motion-reduce:animate-none"
          style={{ transform: 'translate3d(-12px, -10px, -30px)' }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl border-2 border-cyan-300/50 animate-frame-jitter motion-reduce:animate-none [animation-delay:-1.3s]"
          style={{ transform: 'translate3d(-7px, -15px, -30px)' }}
        />

        {/* The film */}
        <div
          className="relative rounded-2xl overflow-hidden cursor-pointer ring-1 ring-white/20 shadow-[0_50px_100px_-30px_rgba(0,0,0,1),0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ transform: 'translateZ(40px)' }}
          onClick={togglePlay}
        >
          <video
            ref={videoRef}
            className="w-full aspect-video object-cover bg-black"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>

          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply"
            style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0,0,0,0.35) 2px 3px)' }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
          />

          <div className="absolute inset-0 pointer-events-none p-3 sm:p-5 flex flex-col justify-between font-jbmono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between pl-8 sm:pl-9">
              <span className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full bg-[#ff2b4a]', playing && 'animate-pulse motion-reduce:animate-none')} />
                {playing ? 'Rec' : 'Paused'}
              </span>
              <span>BABYSITTER™</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{playing ? '▶ Play' : '❚❚ Pause'}</span>
              <span ref={timecodeRef}>00:00:00</span>
            </div>
          </div>

          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300',
              playing ? 'opacity-0 pointer-events-none' : 'opacity-100',
            )}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/15 backdrop-blur border border-white/20">
              <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>

        {/* Logo badge riding on top of the frame */}
        <div
          aria-hidden="true"
          className="absolute -top-5 -left-3 sm:-top-7 sm:-left-7 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-black ring-1 ring-white/30 shadow-2xl flex items-center justify-center"
          style={{ transform: 'translateZ(90px) rotate(-8deg)' }}
        >
          <img src="/media/bs-logo-180.png" alt="" className="w-8 h-8 sm:w-11 sm:h-11 object-contain invert" />
        </div>
      </motion.div>
    </div>
  );
};

const CatalogButton = ({ className }: { className?: string }) => (
  <Link
    to={CATALOG_PATH}
    className={cn(
      'group inline-flex items-center gap-3 px-8 py-4 rounded-full bg-white text-black font-archivo font-bold uppercase tracking-wider text-sm transition-transform duration-300 hover:-translate-y-0.5 shadow-[0_0_40px_rgba(255,255,255,0.15)]',
      className,
    )}
  >
    <span className="group-hover:animate-text-glitch motion-reduce:animate-none">View Catalog</span>
    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
  </Link>
);

// ──────────────────────────────────────────────────────────────
// Help desk: searchable FAQ printed on woven care labels
// ──────────────────────────────────────────────────────────────
const FaqRow = ({
  faq,
  id,
  open,
  onToggle,
  query,
}: {
  faq: Faq;
  id: string;
  open: boolean;
  onToggle: () => void;
  query: string;
}) => (
  <div className="border-t border-dashed border-[#0b0b0b]/25 first:border-t-0">
    <h3>
      <button
        id={`${id}-q`}
        aria-expanded={open}
        aria-controls={`${id}-a`}
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-4 text-left font-archivo font-bold text-base sm:text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b1f] rounded-sm"
      >
        <span><Highlight text={faq.question} query={query} /></span>
        <Plus className={cn('w-5 h-5 shrink-0 transition-transform duration-300', open && 'rotate-45 text-[#ff3b1f]')} />
      </button>
    </h3>
    <div
      id={`${id}-a`}
      role="region"
      aria-labelledby={`${id}-q`}
      className={cn('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
    >
      <div className="overflow-hidden">
        <p className="pb-5 pr-8 font-archivo text-[15px] leading-relaxed text-[#0b0b0b]/70">
          <Highlight text={faq.answer} query={query} />
        </p>
      </div>
    </div>
  </div>
);

const CareLabel = ({
  section,
  index,
  query,
  openKeys,
  toggle,
  baseId,
}: {
  section: FaqSection & { visible: Faq[] };
  index: number;
  query: string;
  openKeys: Set<string>;
  toggle: (key: string) => void;
  baseId: string;
}) => (
  <motion.section
    id={section.id}
    layout
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.5 }}
    className={cn(
      'relative scroll-mt-24 bg-[#fbf9f4] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:rotate-0',
      index % 2 === 0 ? 'rotate-[-0.6deg]' : 'rotate-[0.5deg]',
    )}
  >
    {/* The folded, stitched top of a sewn-in label */}
    <div className="h-4 bg-[#e7e2d6] border-b border-[#0b0b0b]/10" aria-hidden="true" />
    <div className="m-2 sm:m-3 border border-dashed border-[#0b0b0b]/30 px-4 sm:px-7 py-5 sm:py-6">
      <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-[#0b0b0b]">
        <div>
          <p className="font-jbmono text-[10px] sm:text-xs uppercase tracking-[0.25em] text-[#0b0b0b]/50">
            {section.label} — {section.note}
          </p>
          <h2 className="mt-1 font-anton uppercase text-3xl sm:text-4xl leading-none">{section.title}</h2>
        </div>
        <CareSymbol kind={section.symbol} className="w-9 h-9 sm:w-11 sm:h-11 shrink-0" />
      </div>
      <div className="mt-1">
        {section.visible.map((faq) => {
          const key = `${section.id}:${faq.question}`;
          return (
            <FaqRow
              key={key}
              id={`${baseId}-${section.id}-${section.items.indexOf(faq)}`}
              faq={faq}
              query={query}
              open={query.length > 0 || openKeys.has(key)}
              onToggle={() => toggle(key)}
            />
          );
        })}
      </div>
    </div>
  </motion.section>
);

// ──────────────────────────────────────────────────────────────
// Contact + footer
// ──────────────────────────────────────────────────────────────
const Contact = () => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.location.href = `mailto:${EMAIL}`;
    }
  };

  const tile =
    'group relative flex flex-col justify-between gap-10 p-6 sm:p-8 border border-[#f4f1ea]/20 hover:border-[#ff3b1f] hover:bg-[#ff3b1f] hover:text-[#0b0b0b] transition-colors min-h-[210px]';

  return (
    <section id="contact" className="bg-[#0b0b0b] text-[#f4f1ea] px-4 sm:px-8 py-20 sm:py-28 scroll-mt-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10 sm:mb-14">
          <h2 className="font-anton uppercase text-6xl sm:text-8xl lg:text-9xl leading-[0.85]">
            Still
            <br />
            <span className="text-transparent [-webkit-text-stroke:2px_#f4f1ea]">stuck?</span>
          </h2>
          <p className="font-archivo text-lg text-[#f4f1ea]/70 max-w-sm">
            Our team is here to help. Reach out and we’ll get back to you as soon as possible.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className={tile}>
            <div className="flex items-center justify-between font-jbmono text-xs uppercase tracking-[0.2em]">
              <span>Email</span>
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <a href={`mailto:${EMAIL}`} className="block font-archivo font-bold text-lg sm:text-xl break-all underline-offset-4 hover:underline">
                {EMAIL}
              </a>
              <button
                onClick={copyEmail}
                className="mt-4 inline-flex items-center gap-2 font-jbmono text-xs uppercase tracking-[0.2em] opacity-70 hover:opacity-100"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy address'}
              </button>
            </div>
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={tile}>
            <div className="flex items-center justify-between font-jbmono text-xs uppercase tracking-[0.2em]">
              <span>Instagram DM</span>
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div>
              <p className="font-anton uppercase text-4xl leading-none">@babysitter_bs</p>
              <p className="mt-2 font-archivo text-sm opacity-70">Returns and exchanges start here.</p>
            </div>
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={tile}>
            <div className="flex items-center justify-between font-jbmono text-xs uppercase tracking-[0.2em]">
              <span>WhatsApp channel</span>
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div>
              <p className="font-anton uppercase text-4xl leading-none">Drop alerts</p>
              <p className="mt-2 font-archivo text-sm opacity-70">Hear about the next drop first.</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
};

const Footer = ({ onOpenPrivacy, onOpenTerms }: { onOpenPrivacy: () => void; onOpenTerms: () => void }) => (
  <footer className="bg-[#0b0b0b] text-[#f4f1ea] border-t border-[#f4f1ea]/15 px-4 sm:px-8 py-10">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.2em]">
      <div className="flex items-center gap-3">
        <img src="/media/bs-logo-180.png" alt="" className="w-8 h-8 object-contain invert" />
        <span className="text-[#f4f1ea]/60">Changing the world one garment at a time.</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[#f4f1ea]/60">
        <Link to="/smilano" className="hover:text-[#f4f1ea] transition-colors">S’milano drop</Link>
        <button onClick={onOpenPrivacy} className="uppercase hover:text-[#f4f1ea] transition-colors">Privacy</button>
        <button onClick={onOpenTerms} className="uppercase hover:text-[#f4f1ea] transition-colors">Terms</button>
        <span>&copy; {new Date().getFullYear()} BABYSITTER</span>
      </div>
    </div>
  </footer>
);

export default function Home() {
  const reduce = useReducedMotion() ?? false;
  const location = useLocation();
  const baseId = useId();
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    if (!location.hash) return;
    const timer = setTimeout(() => {
      document.querySelector(location.hash)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, [location.hash, reduce]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bgDeep }}>
      <GlitchGrid />

      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: 'rgba(10, 10, 10, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderColor: colors.border,
        }}
      >
        <div className="max-w-[760px] mx-auto flex items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="text-white font-extrabold text-lg tracking-[3px] uppercase hover:opacity-80 transition-opacity"
          >
            BABYSITTER
          </Link>
          <Link
            to={CATALOG_PATH}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-white/15 bg-white/[0.06] text-[#d4d4d4] hover:bg-white/15 hover:border-white/30 hover:text-white transition-colors"
          >
            View Catalog
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-[760px] mx-auto px-6 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ backgroundColor: colors.accentGlow, color: colors.textSecondary }}
          >
            Support
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4" style={{ color: colors.textPrimary }}>
            How can we help?
          </h1>
          <p className="text-lg max-w-md mx-auto" style={{ color: colors.textSecondary }}>
            Find answers to common questions about shipping, returns, payments, and more.
          </p>
        </motion.div>

        <div className="mb-14">
          <FilmFrame reduce={reduce} />
        </div>

        <div className="flex justify-center mb-16">
          <CatalogButton />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-3 mb-16"
        >
          {navPills.map((pill) => (
            <a
              key={pill.href}
              href={pill.href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium border transition-all duration-200 hover:-translate-y-0.5 hover:text-white hover:border-white/25 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
              style={{ backgroundColor: colors.card, color: colors.textSecondary, borderColor: colors.border }}
            >
              <pill.icon className="w-4 h-4" />
              {pill.label}
            </a>
          ))}
        </motion.div>

        <div className="space-y-10 sm:space-y-12">
          {FAQ_SECTIONS.map((section, i) => (
            <CareLabel
              key={section.id}
              section={{ ...section, visible: section.items }}
              index={i}
              query=""
              openKeys={openKeys}
              toggle={toggle}
              baseId={baseId}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10">
        <Contact />
        <Footer onOpenPrivacy={() => setShowPrivacy(true)} onOpenTerms={() => setShowTerms(true)} />
      </div>

      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
    </div>
  );
}
