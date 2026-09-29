import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Copy, Mail, Plus, Search, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { PrivacyPolicyModal, TermsOfServiceModal } from '../LegalPages';

const EMAIL = 'babysitterbs9@gmail.com';
const INSTAGRAM_URL = 'https://www.instagram.com/babysitter_bs/?hl=en';
const WHATSAPP_URL = 'https://whatsapp.com/channel/0029Vb6wcCeLCoWwT54KMn01';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

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
const TopBar = () => (
  <header className="absolute top-0 inset-x-0 z-30">
    <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-8 py-5">
      <Link to="/" className="flex items-center gap-3" aria-label="BABYSITTER home">
        <img src="/media/bs-logo-180.png" alt="" className="w-10 h-10 object-contain invert" />
        <span className="hidden sm:block font-anton text-xl tracking-[0.12em] text-[#f4f1ea]">BABYSITTER™</span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3 font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.2em] text-[#f4f1ea]">
        <a href="#help" className="px-3 py-2 hover:text-[#ff3b1f] transition-colors">Help</a>
        <a href="#contact" className="hidden sm:block px-3 py-2 hover:text-[#ff3b1f] transition-colors">Contact</a>
        <Link
          to="/smilano"
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-[#f4f1ea]/40 hover:bg-[#f4f1ea] hover:text-[#0b0b0b] transition-colors"
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-[#ff3b1f] animate-ping motion-reduce:animate-none" />
            <span className="relative w-2 h-2 rounded-full bg-[#ff3b1f]" />
          </span>
          Live drop
        </Link>
      </nav>
    </div>
  </header>
);

const Hero = ({ reduce }: { reduce: boolean }) => (
  <section className="relative overflow-hidden bg-[#0b0b0b] text-[#f4f1ea] pt-28 sm:pt-32">
    <div aria-hidden="true" className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: GRAIN }} />
    <TopBar />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-8">
      <p className="font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.3em] text-[#f4f1ea]/50">
        Drop 001 — The original tee
      </p>

      <div className="relative mt-4">
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
          className="font-anton uppercase leading-[0.85] text-[19vw] sm:text-[17vw] xl:text-[15.5rem] tracking-tight"
        >
          Babysitter<span className="align-top text-[0.3em] text-[#f4f1ea]/60">™</span>
        </motion.h1>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 2.4, rotate: -24 }}
          animate={{ opacity: 1, scale: 1, rotate: -9 }}
          transition={{ delay: 0.55, type: 'spring', stiffness: 260, damping: 14 }}
          className="absolute right-[2%] top-[38%] sm:right-[6%] sm:top-[30%] pointer-events-none select-none"
        >
          <div
            className="border-[5px] sm:border-[7px] border-double border-[#ff3b1f] text-[#ff3b1f] bg-[#0b0b0b]/85 px-4 sm:px-7 py-1 sm:py-2 font-anton uppercase text-4xl sm:text-7xl lg:text-8xl tracking-wide leading-none shadow-[0_0_40px_rgba(255,59,31,0.25)]"
          >
            Sold out
          </div>
        </motion.div>
      </div>

      <div className="mt-8 sm:mt-12 grid lg:grid-cols-12 gap-8 lg:gap-12 items-end pb-16 sm:pb-24">
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="lg:col-span-5 font-archivo text-xl sm:text-2xl leading-snug text-[#f4f1ea]/80 max-w-md"
        >
          Every piece of Drop 001 has found a home. Thank you for wearing it.{' '}
          <span className="text-[#f4f1ea]">The next one is already here.</span>
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05 }}
          className="lg:col-span-7"
        >
          <Link
            to="/smilano"
            className="group grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] bg-[#f4f1ea] text-[#0b0b0b] overflow-hidden hover:-translate-y-1 transition-transform duration-300"
          >
            <div className="relative bg-[#ebebeb]">
              <img
                src="/media/SSML.jpeg"
                alt="S’MILANO SAVED MY LIFE tee"
                className="absolute inset-0 w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-500"
              />
            </div>
            <div className="p-4 sm:p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between font-jbmono text-[10px] sm:text-xs uppercase tracking-[0.2em]">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ff3b1f]" /> Drop 002 · Live now
                </span>
                <span className="hidden sm:inline text-[#0b0b0b]/50">S — XL</span>
              </div>
              <p className="font-anton uppercase text-3xl sm:text-5xl leading-[0.9]">S’milano saved my life</p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-anton text-2xl sm:text-3xl">R500</span>
                <span className="flex items-center gap-2 font-archivo font-bold uppercase text-sm tracking-wide">
                  Enter<span className="hidden sm:inline -ml-1">the drop</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </div>
          </Link>
        </motion.div>
      </div>
    </div>

    <div className="relative border-y border-[#f4f1ea]/15 bg-[#ff3b1f] text-[#0b0b0b] overflow-hidden py-3" aria-hidden="true">
      <div className="flex w-max animate-marquee motion-reduce:animate-none font-anton uppercase text-2xl sm:text-3xl tracking-wide whitespace-nowrap">
        {[0, 1].map((i) => (
          <span key={i} className="pr-6">
            Drop 001 — sold out ✶ Thank you ✶ Drop 002 — live now ✶ Changing the world one garment at a time ✶ Drop 001 —
            sold out ✶ Thank you ✶ Drop 002 — live now ✶ Changing the world one garment at a time ✶
          </span>
        ))}
      </div>
    </div>
  </section>
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

const HelpDesk = () => {
  const [query, setQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const baseId = useId();
  const q = query.trim();

  const sections = useMemo(
    () =>
      FAQ_SECTIONS.map((s) => ({
        ...s,
        visible: q
          ? s.items.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(q.toLowerCase()))
          : s.items,
      })).filter((s) => s.visible.length > 0),
    [q],
  );
  const matchCount = sections.reduce((n, s) => n + s.visible.length, 0);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section id="help" className="relative bg-[#ece8de] text-[#0b0b0b] px-4 sm:px-8 py-20 sm:py-28 scroll-mt-4">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-10 space-y-8">
            <div>
              <p className="font-jbmono text-xs uppercase tracking-[0.3em] text-[#0b0b0b]/50">Help desk</p>
              <h2 className="mt-3 font-anton uppercase text-6xl sm:text-7xl leading-[0.88]">
                Care
                <br />
                instructions.
              </h2>
              <p className="mt-4 font-archivo text-lg text-[#0b0b0b]/70 max-w-sm">
                For you and your order. Search it, or pick a label.
              </p>
            </div>

            <label className="relative block">
              <span className="sr-only">Search help</span>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#0b0b0b]/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Delivery, returns, tracking…"
                className="w-full pl-12 pr-11 py-4 bg-[#fbf9f4] [&::-webkit-search-cancel-button]:appearance-none border-2 border-[#0b0b0b] font-archivo text-base placeholder-[#0b0b0b]/35 focus:outline-none focus:shadow-[4px_4px_0_#ff3b1f] transition-shadow"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center hover:text-[#ff3b1f]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
            <p className="font-jbmono text-xs uppercase tracking-[0.2em] text-[#0b0b0b]/50" aria-live="polite">
              {q ? `${matchCount} answer${matchCount === 1 ? '' : 's'} for “${q}”` : `${matchCount} answers on file`}
            </p>

            <nav aria-label="Help topics" className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {FAQ_SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="group flex items-center gap-3 px-3 py-3 border-2 border-[#0b0b0b] hover:bg-[#0b0b0b] hover:text-[#f4f1ea] transition-colors"
                >
                  <CareSymbol kind={s.symbol} className="w-6 h-6 shrink-0" />
                  <span className="font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.15em]">{s.title}</span>
                </a>
              ))}
              <a
                href="#contact"
                className="flex items-center gap-3 px-3 py-3 border-2 border-[#0b0b0b] hover:bg-[#0b0b0b] hover:text-[#f4f1ea] transition-colors"
              >
                <CareSymbol kind="dry" className="w-6 h-6 shrink-0" />
                <span className="font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.15em]">Contact us</span>
              </a>
            </nav>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8 sm:space-y-10">
          {sections.map((section, i) => (
            <CareLabel
              key={section.id}
              section={section}
              index={i}
              query={q}
              openKeys={openKeys}
              toggle={toggle}
              baseId={baseId}
            />
          ))}
          {sections.length === 0 && (
            <div className="border-2 border-dashed border-[#0b0b0b]/40 p-8 sm:p-12 text-center">
              <p className="font-anton uppercase text-4xl">Nothing on the label.</p>
              <p className="mt-3 font-archivo text-[#0b0b0b]/70">
                No answer matches “{q}”. Ask us directly and a human will get back to you.
              </p>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-[#0b0b0b] text-[#f4f1ea] font-archivo font-bold uppercase text-sm tracking-wide hover:bg-[#ff3b1f] hover:text-[#0b0b0b] transition-colors"
              >
                Ask us <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

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
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // /help#returns and friends deep-link straight to a label; plain /help opens the help desk.
  useEffect(() => {
    const target = location.hash || (location.pathname === '/help' ? '#help' : '');
    if (!target) return;
    const timer = setTimeout(() => {
      document.querySelector(target)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(timer);
  }, [location.hash, location.pathname, reduce]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] font-archivo antialiased selection:bg-[#ff3b1f] selection:text-[#0b0b0b]">
      <main>
        <Hero reduce={reduce} />
        <HelpDesk />
        <Contact />
      </main>
      <Footer onOpenPrivacy={() => setShowPrivacy(true)} onOpenTerms={() => setShowTerms(true)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
    </div>
  );
}
