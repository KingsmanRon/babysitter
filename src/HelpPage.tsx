import { useState, useEffect, useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, Truck, RotateCcw, CreditCard, Mail, ArrowLeft, Play } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

// --- Stealth Grey Colors ---
const colors = {
  bgDeep: '#0a0a0a',
  bgPrimary: '#111111',
  card: '#1a1a1a',
  cardHover: '#222222',
  textPrimary: '#e5e5e5',
  textSecondary: '#a3a3a3',
  textMuted: '#737373',
  accent: '#d4d4d4',
  accentBright: '#ffffff',
  accentGlow: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.15)',
};

// --- FAQ Data ---
const faqSections = [
  {
    id: 'shipping',
    title: 'Shipping & Delivery',
    subtitle: 'Everything about getting your order to your door',
    icon: Truck,
    items: [
      {
        question: 'How long does delivery take?',
        answer: 'Orders usually ship within 1–2 business days, with delivery in 3–5 business days for standard shipping.',
      },
      {
        question: 'Do you offer free delivery?',
        answer: 'Yes, free standard shipping is available on all orders over a qualifying amount. The threshold will be displayed at checkout.',
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns & Exchanges',
    subtitle: 'Hassle-free returns within 30 days',
    icon: RotateCcw,
    items: [
      {
        question: 'What is your return policy?',
        answer: 'Items can be returned within 30 days of purchase in their original condition. Please ensure all tags are attached and the item is unworn and unwashed.',
      },
      {
        question: 'How do I make a return?',
        answer: 'Please visit our Instagram @babysitter_bs and send us a DM.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Orders & Payments',
    subtitle: 'Payment options and order tracking',
    icon: CreditCard,
    items: [
      {
        question: 'What payment methods do you accept?',
        answer: 'All transactions are securely processed via PayFast and encrypted.',
      },
      {
        question: 'How can I track my order?',
        answer: 'A tracking link will be emailed to you once your order has shipped. You can also check your order status by contacting our support team.',
      },
    ],
  },
];

const navPills = [
  { label: 'Shipping', href: '#shipping', icon: Truck },
  { label: 'Returns', href: '#returns', icon: RotateCcw },
  { label: 'Payments', href: '#payments', icon: CreditCard },
  { label: 'Contact', href: '#contact', icon: Mail },
];

// --- Animated Section Wrapper ---
const FadeInSection = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
      }}
    >
      {children}
    </div>
  );
};

// --- Accordion Item ---
const AccordionItem = ({
  question,
  answer,
  isOpen,
  onClick,
  id,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
  id: string;
}) => {
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return (
    <div
      style={{
        backgroundColor: isOpen ? colors.cardHover : colors.card,
        borderColor: isOpen ? 'rgba(255, 255, 255, 0.15)' : colors.border,
        boxShadow: isOpen ? '0 0 30px rgba(255, 255, 255, 0.03)' : 'none',
      }}
      className="rounded-xl border transition-all duration-300"
    >
      <button
        id={buttonId}
        onClick={onClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between p-5 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a] rounded-xl"
        style={{ '--tw-ring-color': colors.accent } as React.CSSProperties}
      >
        <span style={{ color: colors.textPrimary }} className="font-medium text-[15px] pr-4">
          {question}
        </span>
        <ChevronDown
          className="w-5 h-5 flex-shrink-0 transition-transform"
          aria-hidden="true"
          style={{
            color: isOpen ? colors.accentBright : colors.textMuted,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s',
          }}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!isOpen}
        style={{
          maxHeight: isOpen ? '200px' : '0',
          opacity: isOpen ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-out',
          overflow: 'hidden',
        }}
      >
        <p
          style={{ color: colors.textSecondary }}
          className="px-5 pb-5 text-[14px] leading-relaxed"
        >
          {answer}
        </p>
      </div>
    </div>
  );
};

// --- Main Page ---
export default function HelpPage() {
  const [openItems, setOpenItems] = useState<Record<string, number | null>>({});
  const location = useLocation();
  const baseId = useId();

  const toggleItem = (sectionId: string, index: number) => {
    setOpenItems(prev => ({
      ...prev,
      [sectionId]: prev[sectionId] === index ? null : index,
    }));
  };

  // Hash-based scrolling using useLocation()
  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      const timer = setTimeout(() => {
        const el = document.querySelector(hash);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location.hash]);

  const handleVideoPlay = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const video = container.querySelector('video');
    const overlay = container.querySelector('.video-overlay') as HTMLElement;
    if (video) {
      if (video.paused) {
        video.play();
        if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
      } else {
        video.pause();
        if (overlay) { overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto'; }
      }
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: colors.bgDeep,
        scrollBehavior: 'smooth',
      }}
    >
      {/* Grid texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Sticky Nav */}
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
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-250"
            style={{
              backgroundColor: colors.accentGlow,
              color: colors.accent,
              border: `1px solid rgba(255, 255, 255, 0.12)`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = colors.accentGlow;
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = colors.accent;
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 max-w-[760px] mx-auto px-6 pt-28 pb-20" style={{ scrollPaddingTop: '100px' }}>
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-6"
            style={{
              backgroundColor: colors.accentGlow,
              color: colors.textSecondary,
            }}
          >
            Support
          </span>
          <h1
            className="text-4xl sm:text-5xl font-extrabold mb-4"
            style={{ color: colors.textPrimary }}
          >
            How can we help?
          </h1>
          <p
            className="text-lg max-w-md mx-auto"
            style={{ color: colors.textSecondary }}
          >
            Find answers to common questions about shipping, returns, payments, and more.
          </p>
        </motion.div>

        {/* Video Section */}
        <FadeInSection className="mb-16">
          <div
            className="rounded-2xl overflow-hidden relative cursor-pointer group"
            style={{
              border: `1px solid ${colors.border}`,
              boxShadow: '0 0 60px rgba(0, 0, 0, 0.4)',
            }}
            onClick={handleVideoPlay}
          >
            <video
              className="w-full aspect-video object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            >
              <source src="/media/bs SHOOT.mp4" type="video/mp4" />
            </video>
            <div
              className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 video-overlay"
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
              </div>
            </div>
          </div>
        </FadeInSection>

        {/* Section Nav Pills */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-3 mb-16"
        >
          {navPills.map(pill => (
            <a
              key={pill.href}
              href={pill.href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-250"
              style={{
                backgroundColor: colors.card,
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.color = colors.textSecondary;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <pill.icon className="w-4 h-4" />
              {pill.label}
            </a>
          ))}
        </motion.div>

        {/* FAQ Sections */}
        <div className="space-y-16">
          {faqSections.map(section => (
            <FadeInSection key={section.id}>
              <section id={section.id} style={{ scrollMarginTop: '100px' }}>
                {/* Section Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: colors.accentGlow }}
                  >
                    <section.icon className="w-6 h-6" style={{ color: colors.accent }} />
                  </div>
                  <div>
                    <h2
                      className="text-xl font-bold"
                      style={{ color: colors.textPrimary }}
                    >
                      {section.title}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textMuted }}>
                      {section.subtitle}
                    </p>
                  </div>
                </div>

                {/* Accordion */}
                <div className="space-y-3" role="group" aria-label={section.title}>
                  {section.items.map((item, idx) => (
                    <AccordionItem
                      key={idx}
                      id={`${baseId}-${section.id}-${idx}`}
                      question={item.question}
                      answer={item.answer}
                      isOpen={openItems[section.id] === idx}
                      onClick={() => toggleItem(section.id, idx)}
                    />
                  ))}
                </div>
              </section>
            </FadeInSection>
          ))}
        </div>

        {/* Contact CTA */}
        <FadeInSection className="mt-20">
          <div
            id="contact"
            className="rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden"
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              scrollMarginTop: '100px',
            }}
          >
            {/* Top gradient line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${colors.textMuted}, transparent)`,
              }}
            />

            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: colors.accentGlow }}
            >
              <Mail className="w-7 h-7" style={{ color: colors.accent }} />
            </div>

            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: colors.textPrimary }}
            >
              Still have questions?
            </h3>
            <p
              className="mb-4 max-w-md mx-auto"
              style={{ color: colors.textSecondary }}
            >
              Our team is here to help. Reach out and we'll get back to you as soon as possible.
            </p>

            <p
              className="mb-6 text-sm"
              style={{ color: colors.textMuted }}
            >
              <Mail className="w-4 h-4 inline-block mr-1.5 -mt-0.5" style={{ color: colors.accent }} />
              <a
                href="mailto:babysitterbs9@gmail.com"
                className="underline underline-offset-2 transition-colors"
                style={{ color: colors.accent }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = colors.accent; }}
              >
                babysitterbs9@gmail.com
              </a>
            </p>

            <a
              href="mailto:babysitterbs9@gmail.com"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-sm uppercase tracking-wider transition-all duration-250"
              style={{
                backgroundColor: '#fff',
                color: '#000',
                boxShadow: '0 0 30px rgba(255, 255, 255, 0.1)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#e5e5e5';
                e.currentTarget.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Mail className="w-4 h-4" />
              Get in Touch
            </a>
          </div>
        </FadeInSection>

        {/* Footer */}
        <div className="mt-20 pt-8 text-center" style={{ borderTop: `1px solid ${colors.border}` }}>
          <p
            className="text-xs uppercase tracking-[3px] mb-3"
            style={{ color: colors.textMuted }}
          >
            CHANGING THE WORLD ONE GARMENT AT A TIME.
          </p>
          <p className="text-xs" style={{ color: colors.textMuted }}>
            &copy; {new Date().getFullYear()} BABYSITTER. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
