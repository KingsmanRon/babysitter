import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  MotionValue,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { ArrowDown, ArrowLeft, ArrowUpRight, Loader2, MapPin, Package, Play, Shield, ShoppingBag, Truck, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { useProducts } from '../hooks/useProducts';
import {
  createOrder,
  createYocoCheckout,
  formatZarFromCents,
  FulfilmentMethod,
  getEffectiveDisplayPriceCents,
  Product,
} from '../lib/api';
import { PrivacyPolicyModal, TermsOfServiceModal } from '../LegalPages';

const PRODUCT_SLUG = 'smilano-tee';
// Shown until the product row loads; checkout always uses the server price.
const FALLBACK_PRICE_CENTS = 50000;
const FALLBACK_DELIVERY_FEE_CENTS = 10000;
const FALLBACK_SIZES = ['S', 'M', 'L', 'XL'];

const SHIRT_IMAGE = '/media/SSML.jpeg';
const CREW_IMAGE = '/media/4gents.jpeg';
const YOUTUBE_ID = 'WjZKta5Fm5g';
const YOUTUBE_URL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;

const HEADWORD = 'S’milano';
const WORD_CLASS = '(noun/verb):';
const DEFINITION =
  'A contemporary, high-velocity youth subculture and musical movement originating from the urban peripheries of South Africa, most notably the Vaal region and parts of Pretoria.';
const EMPHASIS = new Set(['high-velocity', 'Vaal', 'Pretoria.']);

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const shortZar = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;

const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ──────────────────────────────────────────────────────────────
// Chrome
// ──────────────────────────────────────────────────────────────
const Grain = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-[70] opacity-[0.09] mix-blend-multiply"
    style={{ backgroundImage: GRAIN }}
  />
);

const TopBar = ({ onQueue, priceLabel }: { onQueue: () => void; priceLabel: string }) => (
  <header className="fixed top-0 inset-x-0 z-50 text-white mix-blend-difference">
    <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4">
      <Link
        to="/"
        className="flex items-center gap-2 font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.2em] hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="w-4 h-4" />
        Babysitter™
      </Link>
      <span className="hidden md:block font-anton text-2xl tracking-wide">S’MILANO</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onQueue}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-white/80 font-jbmono text-[11px] sm:text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="hidden sm:inline">Queue the track</span>
          <span className="sm:hidden">Track</span>
        </button>
        <button
          onClick={() => scrollToId('cop')}
          className="px-3 sm:px-4 py-2 rounded-full border border-white/80 font-jbmono text-[11px] sm:text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors"
        >
          Cop · {priceLabel}
        </button>
      </div>
    </div>
  </header>
);

const PriceBadge = ({ label, reduce }: { label: string; reduce: boolean }) => (
  <div className="relative w-28 h-28 sm:w-36 sm:h-36">
    <motion.svg
      viewBox="0 0 200 200"
      className="absolute inset-0 w-full h-full"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
      aria-hidden="true"
    >
      <defs>
        <path id="smilano-badge-circle" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" />
      </defs>
      <circle cx="100" cy="100" r="100" fill="#ff3b1f" />
      <text fill="#0b0b0b" fontSize="17" letterSpacing="3.2" fontFamily="JetBrains Mono, monospace" fontWeight="700">
        <textPath href="#smilano-badge-circle">S’MILANO SAVED MY LIFE ✶ VAAL ✶ PTA ✶ </textPath>
      </text>
    </motion.svg>
    <span className="absolute inset-0 flex items-center justify-center font-anton text-3xl sm:text-4xl text-[#0b0b0b]">
      {label}
    </span>
  </div>
);

// ──────────────────────────────────────────────────────────────
// 01 — Hero: the slogan pulls apart as you scroll
// ──────────────────────────────────────────────────────────────
const Hero = ({ priceLabel, reduce }: { priceLabel: string; reduce: boolean }) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const xLeft = useTransform(scrollYProgress, [0, 1], ['0%', '-38%']);
  const xRight = useTransform(scrollYProgress, [0, 1], ['-20%', '22%']);
  const posterY = useTransform(scrollYProgress, [0, 1], ['0%', '28%']);
  const posterRotate = useTransform(scrollYProgress, [0, 1], [-5, 7]);
  const posterScale = useTransform(scrollYProgress, [0, 1], [1, 0.82]);
  const fade = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  const line = 'font-anton uppercase whitespace-nowrap text-[min(26vw,30vh)]/[0.86] select-none';

  return (
    <section ref={ref} className="relative h-[190vh] bg-[#d9d5cf]" aria-label="S’milano saved my life">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">
        <div aria-hidden="true" className="relative z-0 flex flex-col gap-[1.5vh]">
          <motion.div style={reduce ? undefined : { x: xLeft }} className={cn(line, 'text-[#0b0b0b] pl-[4vw]')}>
            S’milano
          </motion.div>
          <motion.div
            style={reduce ? undefined : { x: xRight }}
            className={cn(line, 'text-transparent [-webkit-text-stroke:2px_#0b0b0b] sm:[-webkit-text-stroke:3px_#0b0b0b]')}
          >
            Saved my · Saved my
          </motion.div>
          <motion.div style={reduce ? undefined : { x: xLeft }} className={cn(line, 'text-[#0b0b0b] pl-[30vw]')}>
            Life
          </motion.div>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <motion.figure
            initial={reduce ? false : { opacity: 0, y: 80, rotate: -12 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 70, damping: 16, delay: 0.2 }}
            className="relative"
          >
            <motion.div
              style={reduce ? undefined : { y: posterY, rotate: posterRotate, scale: posterScale }}
              className="relative w-[64vw] sm:w-[40vw] lg:w-[30vw] max-w-[440px] bg-[#f4f2ee] p-3 sm:p-4 pb-10 sm:pb-12 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)]"
            >
              <span aria-hidden="true" className="absolute -top-3 left-6 w-20 h-6 bg-[#f1e7c9]/80 -rotate-6 shadow-sm" />
              <span aria-hidden="true" className="absolute -top-3 right-8 w-16 h-6 bg-[#f1e7c9]/80 rotate-3 shadow-sm" />
              <img src={SHIRT_IMAGE} alt="Black S’MILANO SAVED MY LIFE t-shirt with oversized cracked white print" className="w-full h-auto" />
              <figcaption className="absolute bottom-3 sm:bottom-4 left-4 right-4 flex justify-between font-jbmono text-[10px] sm:text-xs uppercase tracking-widest text-[#0b0b0b]/70">
                <span>Fig. 01 — The tee</span>
                <span className="hidden sm:inline">Black / White</span>
              </figcaption>
            </motion.div>
            <div className="absolute -right-10 -bottom-10 sm:-right-16 sm:-bottom-12 pointer-events-auto">
              <PriceBadge label={priceLabel} reduce={reduce} />
            </div>
          </motion.figure>
        </div>

        <motion.div
          style={reduce ? undefined : { opacity: fade }}
          className="absolute bottom-6 inset-x-4 sm:inset-x-8 z-20 flex items-end justify-between font-jbmono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#0b0b0b]"
        >
          <div className="space-y-1">
            <p>New drop</p>
            <p className="text-[#0b0b0b]/60">Vaal ⟶ Pretoria ⟶ Everywhere</p>
          </div>
          <div className="flex items-center gap-2">
            Scroll
            <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
              <ArrowDown className="w-4 h-4" />
            </motion.span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────
// 02 — Marquee that speeds up (and reverses) with your scroll
// ──────────────────────────────────────────────────────────────
const VelocityMarquee = ({ children, baseVelocity, reduce }: { children: React.ReactNode; baseVelocity: number; reduce: boolean }) => {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], { clamp: false });
  const x = useTransform(baseX, (v) => `${wrap(-50, -25, v)}%`);
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    let moveBy = direction.current * baseVelocity * (delta / 1000);
    if (velocityFactor.get() < 0) direction.current = -1;
    else if (velocityFactor.get() > 0) direction.current = 1;
    moveBy += direction.current * moveBy * velocityFactor.get();
    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div className="overflow-hidden whitespace-nowrap flex">
      <motion.div style={{ x }} className="flex whitespace-nowrap">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden={i > 0} className="block pr-8">
            {children}
          </span>
        ))}
      </motion.div>
    </div>
  );
};

const MarqueeBand = ({ reduce }: { reduce: boolean }) => (
  <section aria-label="S’milano marquee" className="relative z-20 bg-[#0b0b0b] py-6 sm:py-10 -mt-[1px] overflow-hidden">
    <div className="-rotate-2 scale-[1.04] bg-[#ff3b1f] py-3 sm:py-4 text-[#0b0b0b] font-anton uppercase text-4xl sm:text-6xl tracking-wide">
      <VelocityMarquee baseVelocity={-3} reduce={reduce}>
        S’milano saved my life ✶ High-velocity ✶ Vaal ✶ Pretoria ✶ Urban peripheries ✶
      </VelocityMarquee>
    </div>
    <div className="rotate-1 mt-3 sm:mt-4 text-[#d9d5cf] font-jbmono uppercase text-xs sm:text-sm tracking-[0.3em]">
      <VelocityMarquee baseVelocity={2} reduce={reduce}>
        noun / verb — youth subculture — musical movement — south africa — babysitter™ —
      </VelocityMarquee>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────
// 03 — The definition, revealed word by word
// ──────────────────────────────────────────────────────────────
const RevealWord = ({
  children,
  progress,
  range,
  emphasis,
  reduce,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  emphasis: boolean;
  reduce: boolean;
}) => {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span
      style={reduce ? undefined : { opacity }}
      className={cn('inline-block mr-[0.26em]', emphasis && 'text-[#ff3b1f]')}
    >
      {children}
    </motion.span>
  );
};

const Definition = ({ reduce }: { reduce: boolean }) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.65'] });
  const words = DEFINITION.split(' ');

  return (
    <section ref={ref} className="relative bg-[#0b0b0b] text-[#f4f2ee] px-4 sm:px-8 py-24 sm:py-40">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16">
        <aside className="lg:col-span-3 order-2 lg:order-1 font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.2em] text-[#f4f2ee]/50 space-y-6 lg:pt-6">
          <div className="border-t border-[#f4f2ee]/20 pt-3">
            <p className="text-[#f4f2ee]/30">Entry</p>
            <p className="text-[#f4f2ee]">001 / Lexicon</p>
          </div>
          <div className="border-t border-[#f4f2ee]/20 pt-3">
            <p className="text-[#f4f2ee]/30">Origin</p>
            <p className="text-[#f4f2ee]">Vaal · Pretoria, ZA</p>
          </div>
          <div className="border-t border-[#f4f2ee]/20 pt-3">
            <p className="text-[#f4f2ee]/30">Usage</p>
            <p className="text-[#f4f2ee] normal-case tracking-normal font-archivo text-base italic">
              “S’milano saved my life.”
            </p>
          </div>
        </aside>

        <div className="lg:col-span-9 order-1 lg:order-2">
          <h2 className="font-anton text-[23vw] sm:text-[18vw] lg:text-[12rem] leading-[0.82] tracking-tight">
            {HEADWORD}
          </h2>
          <p className="mt-4 sm:mt-6 font-jbmono text-sm sm:text-lg text-[#ff3b1f] tracking-widest">{WORD_CLASS}</p>
          <p className="mt-8 sm:mt-10 font-archivo font-medium text-[1.65rem] sm:text-4xl lg:text-5xl leading-[1.15] tracking-tight max-w-5xl">
            {words.map((word, i) => (
              <RevealWord
                key={i}
                progress={scrollYProgress}
                range={[i / words.length, (i + 1) / words.length]}
                emphasis={EMPHASIS.has(word)}
                reduce={reduce}
              >
                {word}
              </RevealWord>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────
// 04 — Lookbook: the crew photo opens up as it enters
// ──────────────────────────────────────────────────────────────
const Lookbook = ({ reduce }: { reduce: boolean }) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const clipPath = useTransform(
    scrollYProgress,
    [0.05, 0.45],
    ['inset(14% 22% 14% 22% round 28px)', 'inset(0% 0% 0% 0% round 4px)'],
  );
  const imgY = useTransform(scrollYProgress, [0, 1], ['-7%', '7%']);
  const imgScale = useTransform(scrollYProgress, [0.05, 0.45], [1.25, 1.05]);
  const headlineX = useTransform(scrollYProgress, [0, 1], ['6%', '-10%']);

  return (
    <section ref={ref} className="relative bg-[#d9d5cf] text-[#0b0b0b] px-4 sm:px-8 py-24 sm:py-36 overflow-hidden">
      <motion.p
        aria-hidden="true"
        style={reduce ? undefined : { x: headlineX }}
        className="absolute top-8 sm:top-10 left-0 font-anton uppercase text-[22vw] leading-none whitespace-nowrap text-[#0b0b0b]/[0.06] select-none"
      >
        Worn by the movement
      </motion.p>

      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-5 space-y-6">
          <p className="font-jbmono text-xs uppercase tracking-[0.25em] text-[#0b0b0b]/60">Fig. 02 — In the wild</p>
          <h2 className="font-anton uppercase text-6xl sm:text-7xl lg:text-8xl leading-[0.88]">
            Four deep.
            <br />
            <span className="text-[#ff3b1f]">One message.</span>
          </h2>
          <p className="font-archivo text-lg sm:text-xl leading-relaxed max-w-md text-[#0b0b0b]/75">
            Oversized, heavyweight, black. The print hits like the music — loud, cracked, unapologetic. Throw it over cargo,
            camo, shorts or a skirt. It already knows where it’s from.
          </p>
          <ul className="font-jbmono text-xs uppercase tracking-[0.2em] divide-y divide-[#0b0b0b]/15 border-y border-[#0b0b0b]/15 max-w-md">
            <li className="flex justify-between py-3"><span>Colour</span><span>Black / cracked white</span></li>
            <li className="flex justify-between py-3"><span>Fit</span><span>Oversized</span></li>
            <li className="flex justify-between py-3"><span>Sizes</span><span>S — XL</span></li>
          </ul>
        </div>

        <div className="lg:col-span-7">
          <motion.div
            style={reduce ? undefined : { clipPath }}
            className="relative mx-auto w-full max-w-[520px] aspect-[9/16] overflow-hidden bg-[#0b0b0b]"
          >
            <motion.img
              src={CREW_IMAGE}
              alt="Four men wearing the S’MILANO SAVED MY LIFE tee in front of a red abstract painting"
              style={reduce ? undefined : { y: imgY, scale: imgScale }}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-between font-jbmono text-[10px] sm:text-xs uppercase tracking-widest text-white">
              <span>04 / 04 in black</span>
              <span>S’milano saved my life</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────
// 05 — Soundtrack: once playing, the player docks and follows you
// ──────────────────────────────────────────────────────────────
const Equalizer = ({ active, reduce }: { active: boolean; reduce: boolean }) => (
  <div className="flex items-end gap-[3px] h-4" aria-hidden="true">
    {[0.5, 1, 0.7, 0.9, 0.4].map((h, i) => (
      <motion.span
        key={i}
        className="w-[3px] bg-[#ff3b1f] origin-bottom h-full"
        initial={{ scaleY: h }}
        animate={active && !reduce ? { scaleY: [h, 1, 0.3, 0.8, h] } : { scaleY: 0.25 }}
        transition={{ duration: 0.9 + i * 0.12, repeat: Infinity, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

interface SoundtrackProps {
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  reduce: boolean;
}

const Soundtrack = ({ playing, onPlay, onStop, reduce }: SoundtrackProps) => {
  const { ref, inView } = useInView({ threshold: 0.25 });
  const docked = playing && !inView;

  return (
    <section ref={ref} id="soundtrack" className="relative bg-[#0b0b0b] text-[#f4f2ee] px-4 sm:px-8 py-24 sm:py-36 scroll-mt-16">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-5 space-y-8">
          <div className="flex items-center gap-3 font-jbmono text-xs uppercase tracking-[0.25em] text-[#f4f2ee]/60">
            <Equalizer active={playing} reduce={reduce} />
            {playing ? 'Now playing' : 'Queued up'}
          </div>
          <h2 className="font-anton uppercase text-6xl sm:text-7xl lg:text-8xl leading-[0.88]">
            Turn it
            <br />
            <span className="text-transparent [-webkit-text-stroke:2px_#f4f2ee]">all the way</span>
            <br />
            up.
          </h2>
          <p className="font-archivo text-lg text-[#f4f2ee]/70 max-w-md">
            You can’t read about S’milano. You have to hear it. Press play, then keep scrolling — the track rides along with you
            to checkout.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {!playing ? (
              <button
                onClick={onPlay}
                className="group flex items-center gap-3 pl-2 pr-6 py-2 rounded-full bg-[#ff3b1f] text-[#0b0b0b] font-archivo font-bold uppercase tracking-wide hover:bg-[#f4f2ee] transition-colors"
              >
                <span className="w-10 h-10 rounded-full bg-[#0b0b0b] text-[#ff3b1f] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </span>
                Play the track
              </button>
            ) : (
              <button
                onClick={onStop}
                className="flex items-center gap-2 px-5 py-3 rounded-full border border-[#f4f2ee]/40 font-archivo font-bold uppercase tracking-wide hover:bg-[#f4f2ee] hover:text-[#0b0b0b] transition-colors"
              >
                <X className="w-4 h-4" />
                Stop
              </button>
            )}
            <a
              href={YOUTUBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-4 py-3 font-jbmono text-xs uppercase tracking-widest text-[#f4f2ee]/60 hover:text-[#f4f2ee] transition-colors"
            >
              Open on YouTube <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="relative aspect-video w-full">
            {!playing && (
              <button
                onClick={onPlay}
                aria-label="Play the S’milano track"
                className="group absolute inset-0 overflow-hidden rounded-sm border border-[#f4f2ee]/15 bg-[#141414] flex items-center justify-center"
              >
                <img
                  src={`https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg`}
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-60 transition-all duration-500"
                />
                <motion.div
                  animate={reduce ? undefined : { rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  className="relative w-[46%] aspect-square rounded-full shadow-2xl"
                  style={{ background: 'repeating-radial-gradient(circle at center, #111 0 2px, #1d1d1d 2px 4px)' }}
                >
                  <div className="absolute inset-[30%] rounded-full overflow-hidden border-4 border-[#ff3b1f]">
                    <img src={SHIRT_IMAGE} alt="" className="w-full h-full object-cover scale-[1.6]" />
                  </div>
                  <div className="absolute inset-[48%] rounded-full bg-[#0b0b0b]" />
                </motion.div>
                <span className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#ff3b1f] text-[#0b0b0b] flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl">
                  <Play className="w-7 h-7 fill-current ml-1" />
                </span>
              </button>
            )}

            {playing && (
              <div
                className={cn(
                  'z-40 overflow-hidden bg-black shadow-2xl transition-all duration-500',
                  docked
                    ? 'fixed bottom-4 left-4 w-[62vw] max-w-[320px] aspect-video rounded-lg border border-[#ff3b1f]'
                    : 'absolute inset-0 rounded-sm border border-[#f4f2ee]/15',
                )}
              >
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&playsinline=1`}
                  title="S’milano soundtrack"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
                {docked && (
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button
                      onClick={() => scrollToId('soundtrack')}
                      aria-label="Back to the player"
                      className="w-7 h-7 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-[#ff3b1f] transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onStop}
                      aria-label="Stop the track"
                      className="w-7 h-7 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-[#ff3b1f] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────
// 06 — Cop it: size, collect or deliver (+R100), checkout
// ──────────────────────────────────────────────────────────────
interface CopSectionProps {
  product: Product | null;
  loading: boolean;
  priceCents: number;
  deliveryFeeCents: number;
  onCheckout: (size: string, fulfilment: FulfilmentMethod) => void;
}

const CopSection = ({ product, loading, priceCents, deliveryFeeCents, onCheckout }: CopSectionProps) => {
  const [size, setSize] = useState<string | null>(null);
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>('delivery');
  const [activeImage, setActiveImage] = useState(0);

  const images = product && product.images.length > 0 ? product.images : [SHIRT_IMAGE, CREW_IMAGE];
  const sizes = product && product.sizes.length > 0 ? product.sizes : FALLBACK_SIZES;
  const available = !!product && product.stock_count > 0;
  const soldOut = !!product && product.stock_count <= 0;
  const totalCents = priceCents + (fulfilment === 'delivery' ? deliveryFeeCents : 0);
  // Units left in a size, or null when the product only tracks a total.
  const sizeLeft = (s: string) => (product?.size_stock ? product.size_stock[s] ?? 0 : null);
  const sizeSoldOut = (s: string) => !available || (sizeLeft(s) ?? 1) <= 0;
  const selectedLeft = size ? sizeLeft(size) : null;
  const lowStockCount = selectedLeft ?? product?.stock_count ?? 0;

  // Realtime stock can sell out the chosen size while the page is open.
  useEffect(() => {
    if (size && sizeSoldOut(size)) setSize(null);
  });

  const options: Array<{ id: FulfilmentMethod; title: string; note: string; price: string; icon: typeof Truck }> = [
    {
      id: 'delivery',
      title: 'Deliver it',
      note: 'Straight to your door',
      price: deliveryFeeCents > 0 ? `+ ${shortZar(deliveryFeeCents)}` : 'Free',
      icon: Truck,
    },
    {
      id: 'collection',
      title: 'Collect it',
      note: 'We’ll call to arrange pickup',
      price: 'No fee',
      icon: MapPin,
    },
  ];

  return (
    <section id="cop" className="relative bg-[#f4f2ee] text-[#0b0b0b] px-4 sm:px-8 py-24 sm:py-36 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between border-b-2 border-[#0b0b0b] pb-4 mb-10 sm:mb-16">
          <h2 className="font-anton uppercase text-6xl sm:text-8xl lg:text-9xl leading-[0.85]">Cop it.</h2>
          <p className="font-jbmono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-right text-[#0b0b0b]/60">
            Fig. 03
            <br />
            The checkout
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="relative aspect-square bg-[#ebebeb] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.img
                  key={images[activeImage]}
                  src={images[activeImage]}
                  alt={activeImage === 0 ? 'S’MILANO SAVED MY LIFE tee, front' : 'S’MILANO SAVED MY LIFE tee, worn'}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </AnimatePresence>
              <span className="absolute top-4 left-4 px-3 py-1 bg-[#ff3b1f] font-jbmono text-[10px] sm:text-xs font-bold uppercase tracking-widest">
                {soldOut ? 'Sold out' : 'New drop'}
              </span>
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-3 mt-3">
                {images.map((img, i) => (
                  <button
                    key={img}
                    onClick={() => setActiveImage(i)}
                    aria-label={`View image ${i + 1}`}
                    className={cn(
                      'aspect-square overflow-hidden bg-[#ebebeb] border-2 transition-all',
                      i === activeImage ? 'border-[#0b0b0b]' : 'border-transparent opacity-60 hover:opacity-100',
                    )}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 space-y-8">
            <div>
              <p className="font-jbmono text-xs uppercase tracking-[0.25em] text-[#0b0b0b]/60">BABYSITTER™ × S’milano</p>
              <h3 className="mt-2 font-anton uppercase text-5xl sm:text-6xl leading-[0.9]">
                {product?.name ?? 'S’MILANO SAVED MY LIFE'}
              </h3>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="font-anton text-5xl">{shortZar(priceCents)}</span>
                {product && !soldOut && lowStockCount > 0 && lowStockCount <= 5 && (
                  <span className="px-3 py-1 bg-[#ff3b1f]/15 text-[#c62a12] font-jbmono text-xs uppercase tracking-widest">
                    Only {lowStockCount} left{selectedLeft !== null && size ? ` in ${size}` : ''}
                  </span>
                )}
              </div>
              {product?.description && (
                <p className="mt-4 font-archivo text-lg text-[#0b0b0b]/70 leading-relaxed">{product.description}</p>
              )}
            </div>

            <fieldset>
              <legend className="font-jbmono text-xs uppercase tracking-[0.25em] mb-3">01 — Size</legend>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}>
                {sizes.map((s) => {
                  const out = sizeSoldOut(s);
                  return (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      disabled={out}
                      aria-pressed={size === s}
                      aria-label={out && available ? `${s}, sold out` : s}
                      className={cn(
                        'py-4 font-anton text-xl border-2 border-[#0b0b0b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        out && available && 'line-through',
                        size === s ? 'bg-[#0b0b0b] text-[#f4f2ee]' : 'hover:bg-[#0b0b0b]/5',
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-jbmono text-xs uppercase tracking-[0.25em] mb-3">02 — Get it</legend>
              <div className="grid sm:grid-cols-2 gap-2">
                {options.map((opt) => {
                  const Icon = opt.icon;
                  const selected = fulfilment === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setFulfilment(opt.id)}
                      aria-pressed={selected}
                      className={cn(
                        'relative text-left p-4 border-2 border-[#0b0b0b] transition-colors',
                        selected ? 'bg-[#0b0b0b] text-[#f4f2ee]' : 'hover:bg-[#0b0b0b]/5',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="w-5 h-5" />
                        <span className={cn('font-jbmono text-xs font-bold uppercase', selected ? 'text-[#ff3b1f]' : '')}>
                          {opt.price}
                        </span>
                      </div>
                      <p className="mt-3 font-archivo font-bold uppercase tracking-wide">{opt.title}</p>
                      <p className={cn('font-archivo text-sm', selected ? 'text-[#f4f2ee]/60' : 'text-[#0b0b0b]/60')}>{opt.note}</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="border-y-2 border-[#0b0b0b] py-4 space-y-1 font-jbmono text-sm uppercase tracking-wider">
              <div className="flex justify-between"><span>Tee</span><span>{formatZarFromCents(priceCents)}</span></div>
              <div className="flex justify-between">
                <span>{fulfilment === 'delivery' ? 'Delivery' : 'Collection'}</span>
                <span>{fulfilment === 'delivery' && deliveryFeeCents > 0 ? formatZarFromCents(deliveryFeeCents) : 'Free'}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2"><span>Total</span><span>{formatZarFromCents(totalCents)}</span></div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => size && available && onCheckout(size, fulfilment)}
                disabled={!size || !available}
                className={cn(
                  'group w-full py-5 flex items-center justify-center gap-3 font-anton uppercase text-2xl tracking-wide transition-colors',
                  size && available
                    ? 'bg-[#0b0b0b] text-[#f4f2ee] hover:bg-[#ff3b1f] hover:text-[#0b0b0b]'
                    : 'bg-[#0b0b0b]/15 text-[#0b0b0b]/40 cursor-not-allowed',
                )}
              >
                {loading && !product ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : !product ? (
                  'Dropping soon'
                ) : soldOut ? (
                  'Sold out'
                ) : size ? (
                  <>
                    <ShoppingBag className="w-6 h-6" />
                    Cop it — {shortZar(totalCents)}
                  </>
                ) : (
                  'Pick a size'
                )}
              </button>
              <p className="flex items-center justify-center gap-2 font-jbmono text-[10px] sm:text-xs uppercase tracking-widest text-[#0b0b0b]/50">
                <Shield className="w-3.5 h-3.5" /> Secure checkout with Yoco
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

interface CheckoutSheetProps {
  product: Product;
  size: string;
  fulfilment: FulfilmentMethod;
  onChangeFulfilment: (f: FulfilmentMethod) => void;
  priceCents: number;
  deliveryFeeCents: number;
  onClose: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  // True while a legal modal is open on top, so Escape/Tab belong to it.
  paused: boolean;
}

const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];

const CheckoutSheet = ({
  product,
  size,
  fulfilment,
  onChangeFulfilment,
  priceCents,
  deliveryFeeCents,
  onClose,
  onOpenTerms,
  onOpenPrivacy,
  paused,
}: CheckoutSheetProps) => {
  const [form, setForm] = useState({
    email: '',
    name: '',
    phone: '',
    line1: '',
    line2: '',
    suburb: '',
    city: '',
    province: '',
    postalCode: '',
  });
  const [terms, setTerms] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDelivery = fulfilment === 'delivery';
  const feeCents = isDelivery ? deliveryFeeCents : 0;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, paused]);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      const order = await createOrder({
        customerEmail: form.email,
        customerName: form.name,
        fulfilment,
        shipping: {
          phone: form.phone,
          line1: form.line1,
          line2: form.line2,
          suburb: form.suburb,
          city: form.city,
          province: form.province,
          postalCode: form.postalCode,
        },
        items: [{ productId: product.id, size, quantity: 1 }],
      });
      const { redirectUrl } = await createYocoCheckout(order.id);
      window.location.href = redirectUrl;
    } catch (err) {
      setErrorMsg((err as Error).message || 'Could not start checkout. Please try again.');
      setProcessing(false);
    }
  };

  const field =
    'w-full px-4 py-3 bg-transparent border-2 border-[#0b0b0b]/20 text-[#0b0b0b] placeholder-[#0b0b0b]/35 font-archivo focus:outline-none focus:border-[#0b0b0b] transition-colors';
  const label = 'block font-jbmono text-[10px] uppercase tracking-[0.2em] text-[#0b0b0b]/60 mb-1.5';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-stretch sm:justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <motion.div
        ref={panelRef}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[94vh] sm:max-h-none h-auto sm:h-full overflow-y-auto bg-[#f4f2ee] text-[#0b0b0b]"
      >
        <div className="sticky top-0 z-10 bg-[#0b0b0b] text-[#f4f2ee] px-5 sm:px-8 py-5 flex items-center justify-between">
          <div>
            <p className="font-jbmono text-[10px] uppercase tracking-[0.25em] text-[#f4f2ee]/50">Checkout</p>
            <h2 className="font-anton uppercase text-3xl">Almost yours.</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="w-10 h-10 rounded-full border border-[#f4f2ee]/30 flex items-center justify-center hover:bg-[#ff3b1f] hover:border-[#ff3b1f] hover:text-[#0b0b0b] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 sm:px-8 py-6 space-y-6">
          <div className="flex gap-4 items-center border-2 border-[#0b0b0b] p-3">
            <img src={product.images[0] ?? product.image_url ?? SHIRT_IMAGE} alt="" className="w-20 h-20 object-cover bg-[#ebebeb]" />
            <div className="flex-1 min-w-0">
              <p className="font-anton uppercase text-xl leading-tight truncate">{product.name}</p>
              <p className="font-jbmono text-xs uppercase tracking-widest text-[#0b0b0b]/60">Size {size} · Qty 1</p>
            </div>
            <p className="font-anton text-2xl">{shortZar(priceCents)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery or collection">
            {(['delivery', 'collection'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={fulfilment === f}
                onClick={() => onChangeFulfilment(f)}
                className={cn(
                  'flex items-center justify-center gap-2 py-3 border-2 border-[#0b0b0b] font-archivo font-bold uppercase text-sm tracking-wide transition-colors',
                  fulfilment === f ? 'bg-[#0b0b0b] text-[#f4f2ee]' : 'hover:bg-[#0b0b0b]/5',
                )}
              >
                {f === 'delivery' ? <Truck className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                {f === 'delivery' ? `Deliver +${shortZar(deliveryFeeCents)}` : 'Collect'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="sm-email">Email</label>
              <input id="sm-email" type="email" required value={form.email} onChange={update('email')} className={field} placeholder="you@example.com" />
            </div>
            <div>
              <label className={label} htmlFor="sm-name">Full name</label>
              <input id="sm-name" type="text" required value={form.name} onChange={update('name')} className={field} placeholder="Your name" />
            </div>
            <div>
              <label className={label} htmlFor="sm-phone">Phone</label>
              <input id="sm-phone" type="tel" required value={form.phone} onChange={update('phone')} className={field} placeholder="071 234 5678" />
            </div>

            <AnimatePresence initial={false}>
              {isDelivery ? (
                <motion.div
                  key="address"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div>
                    <label className={label} htmlFor="sm-line1">Street address</label>
                    <input id="sm-line1" type="text" required value={form.line1} onChange={update('line1')} className={field} placeholder="123 Main Road" />
                  </div>
                  <div>
                    <label className={label} htmlFor="sm-line2">Apartment, unit, complex (optional)</label>
                    <input id="sm-line2" type="text" value={form.line2} onChange={update('line2')} className={field} placeholder="Unit 4B" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label} htmlFor="sm-suburb">Suburb</label>
                      <input id="sm-suburb" type="text" required value={form.suburb} onChange={update('suburb')} className={field} placeholder="Suburb" />
                    </div>
                    <div>
                      <label className={label} htmlFor="sm-city">City / town</label>
                      <input id="sm-city" type="text" required value={form.city} onChange={update('city')} className={field} placeholder="Vanderbijlpark" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label} htmlFor="sm-province">Province</label>
                      <select id="sm-province" required value={form.province} onChange={update('province')} className={field}>
                        <option value="" disabled>Select</option>
                        {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label} htmlFor="sm-postal">Postal code</label>
                      <input id="sm-postal" type="text" inputMode="numeric" required value={form.postalCode} onChange={update('postalCode')} className={field} placeholder="1911" />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.p
                  key="collect"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden font-archivo text-sm text-[#0b0b0b]/70 border-l-4 border-[#ff3b1f] pl-3"
                >
                  No delivery fee. Once you’ve paid we’ll call you on the number above to arrange collection.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="border-y-2 border-[#0b0b0b] py-4 space-y-1 font-jbmono text-sm uppercase tracking-wider">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatZarFromCents(priceCents)}</span></div>
            <div className="flex justify-between">
              <span>{isDelivery ? 'Delivery' : 'Collection'}</span>
              <span>{feeCents > 0 ? formatZarFromCents(feeCents) : 'Free'}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2"><span>Total</span><span>{formatZarFromCents(priceCents + feeCents)}</span></div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#0b0b0b]"
            />
            <span className="font-archivo text-xs text-[#0b0b0b]/70 leading-relaxed">
              I agree to the{' '}
              <button type="button" onClick={onOpenTerms} className="underline hover:text-[#0b0b0b]">Terms of Service</button>
              {' '}and{' '}
              <button type="button" onClick={onOpenPrivacy} className="underline hover:text-[#0b0b0b]">Privacy Policy</button>
              , and consent to the processing of my personal information as described.
            </span>
          </label>

          {errorMsg && (
            <div className="p-3 border-2 border-[#c62a12] bg-[#ff3b1f]/10 text-[#c62a12] font-archivo text-sm">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={!terms || processing}
            className="w-full py-5 flex items-center justify-center gap-3 bg-[#0b0b0b] text-[#f4f2ee] font-anton uppercase text-2xl tracking-wide hover:bg-[#ff3b1f] hover:text-[#0b0b0b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0b0b0b] disabled:hover:text-[#f4f2ee]"
          >
            {processing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Redirecting to Yoco…
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Pay {formatZarFromCents(priceCents + feeCents)}
              </>
            )}
          </button>
          <p className="text-center font-jbmono text-[10px] uppercase tracking-widest text-[#0b0b0b]/50 pb-4">
            You’ll finish paying securely on Yoco
          </p>
        </form>
      </motion.div>
    </motion.div>
  );
};

// ──────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────
const SmilanoFooter = ({ onOpenPrivacy, onOpenTerms }: { onOpenPrivacy: () => void; onOpenTerms: () => void }) => (
  <footer className="bg-[#0b0b0b] text-[#f4f2ee] px-4 sm:px-8 pt-20 pb-10 overflow-hidden">
    <p
      aria-hidden="true"
      className="font-anton uppercase text-[19vw] leading-[0.8] text-transparent [-webkit-text-stroke:1px_rgba(244,242,238,0.35)] whitespace-nowrap select-none"
    >
      Saved my life
    </p>
    <div className="max-w-7xl mx-auto mt-12 flex flex-col md:flex-row md:items-center justify-between gap-6 font-jbmono text-xs uppercase tracking-[0.2em]">
      <Link to="/" className="flex items-center gap-2 hover:text-[#ff3b1f] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to BABYSITTER™
      </Link>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[#f4f2ee]/60">
        <a href="/help#shipping" className="hover:text-[#f4f2ee] transition-colors">Shipping</a>
        <a href="/help#returns" className="hover:text-[#f4f2ee] transition-colors">Returns</a>
        <a href="https://www.instagram.com/babysitter_bs/?hl=en" target="_blank" rel="noopener noreferrer" className="hover:text-[#f4f2ee] transition-colors">Instagram</a>
        <a href="https://whatsapp.com/channel/0029Vb6wcCeLCoWwT54KMn01" target="_blank" rel="noopener noreferrer" className="hover:text-[#f4f2ee] transition-colors">WhatsApp</a>
        <button onClick={onOpenPrivacy} className="uppercase hover:text-[#f4f2ee] transition-colors">Privacy</button>
        <button onClick={onOpenTerms} className="uppercase hover:text-[#f4f2ee] transition-colors">Terms</button>
      </div>
    </div>
    <p className="max-w-7xl mx-auto mt-8 font-jbmono text-[10px] uppercase tracking-[0.2em] text-[#f4f2ee]/40">
      &copy; {new Date().getFullYear()} BABYSITTER. All rights reserved.
    </p>
  </footer>
);

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────
export default function Smilano() {
  const reduce = useReducedMotion() ?? false;
  const { products, loading } = useProducts();
  const product = products.find((p) => p.slug === PRODUCT_SLUG) ?? null;
  const priceCents = product ? getEffectiveDisplayPriceCents(product) : FALLBACK_PRICE_CENTS;
  const deliveryFeeCents = product ? product.delivery_fee_cents ?? 0 : FALLBACK_DELIVERY_FEE_CENTS;
  const priceLabel = shortZar(priceCents);

  const [playing, setPlaying] = useState(false);
  const [checkout, setCheckout] = useState<{ size: string; fulfilment: FulfilmentMethod } | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'S’MILANO SAVED MY LIFE | BABYSITTER™';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  const queueTrack = useCallback(() => {
    setPlaying(true);
    scrollToId('soundtrack');
  }, []);

  const closeCheckout = useCallback(() => setCheckout(null), []);

  return (
    <div className="min-h-screen bg-[#0b0b0b] font-archivo antialiased selection:bg-[#ff3b1f] selection:text-[#0b0b0b]">
      <motion.div
        className="fixed top-0 inset-x-0 h-1 z-[60] origin-left bg-[#ff3b1f]"
        style={{ scaleX: progress }}
      />
      <Grain />
      <TopBar onQueue={queueTrack} priceLabel={priceLabel} />

      <main>
        <Hero priceLabel={priceLabel} reduce={reduce} />
        <MarqueeBand reduce={reduce} />
        <Definition reduce={reduce} />
        <Lookbook reduce={reduce} />
        <Soundtrack playing={playing} onPlay={() => setPlaying(true)} onStop={() => setPlaying(false)} reduce={reduce} />
        <CopSection
          product={product}
          loading={loading}
          priceCents={priceCents}
          deliveryFeeCents={deliveryFeeCents}
          onCheckout={(size, fulfilment) => setCheckout({ size, fulfilment })}
        />
      </main>

      <SmilanoFooter onOpenPrivacy={() => setShowPrivacy(true)} onOpenTerms={() => setShowTerms(true)} />

      <AnimatePresence>
        {checkout && product && (
          <CheckoutSheet
            product={product}
            size={checkout.size}
            fulfilment={checkout.fulfilment}
            onChangeFulfilment={(fulfilment) => setCheckout((c) => (c ? { ...c, fulfilment } : c))}
            priceCents={priceCents}
            deliveryFeeCents={deliveryFeeCents}
            onClose={closeCheckout}
            onOpenTerms={() => setShowTerms(true)}
            onOpenPrivacy={() => setShowPrivacy(true)}
            paused={showPrivacy || showTerms}
          />
        )}
      </AnimatePresence>

      {/* Above the checkout sheet so the links inside it open on top. */}
      <div className="relative z-[90]">
        <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
        <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      </div>

    </div>
  );
}
