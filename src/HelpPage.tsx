import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, Truck, RotateCcw, CreditCard, HelpCircle, Mail, ArrowLeft } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

// --- Colors ---
const colors = {
  bgDeep: '#0C1219',
  bgPrimary: '#111A24',
  card: '#162030',
  cardHover: '#1B2840',
  textPrimary: '#E8ECF1',
  textSecondary: '#8A9BB5',
  textMuted: '#556B85',
  accent: '#4A9EAD',
  accentBright: '#5DC4D6',
  accentGlow: 'rgba(74, 158, 173, 0.15)',
  border: 'rgba(255, 255, 255, 0.06)',
  borderHover: 'rgba(255, 255, 255, 0.1)',
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
      {
        question: 'Do you ship internationally?',
        answer: 'Yes, we ship to most countries. International shipping costs are calculated at checkout based on your location and order weight.',
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
        answer: 'Please visit our returns portal and enter your order number. You\'ll receive a prepaid shipping label and instructions to send back your item.',
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
        answer: 'We accept Visa, MasterCard, American Express, and EFT. All transactions are securely processed via PayFast and encrypted.',
      },
      {
        question: 'How can I track my order?',
        answer: 'A tracking link will be emailed to you once your order has shipped. You can also check your order status by contacting our support team.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Products & Support',
    subtitle: 'Account help and product information',
    icon: HelpCircle,
    items: [
      {
        question: 'How can I edit my account information?',
        answer: 'Log in to your account and visit the "Account Details" section to update your personal information, address, and preferences.',
      },
      {
        question: 'Where can I find a size guide?',
        answer: 'Detailed sizing charts are available on each product page. Simply click the "Size Guide" link below the size selector to view measurements for that item.',
      },
    ],
  },
];

const navPills = [
  { label: 'Shipping', href: '#shipping', icon: Truck },
  { label: 'Returns', href: '#returns', icon: RotateCcw },
  { label: 'Payments', href: '#payments', icon: CreditCard },
  { label: 'Support', href: '#support', icon: HelpCircle },
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
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}) => (
  <div
    style={{
      backgroundColor: isOpen ? colors.cardHover : colors.card,
      borderColor: isOpen ? 'rgba(74, 158, 173, 0.2)' : colors.border,
      boxShadow: isOpen ? '0 0 30px rgba(74, 158, 173, 0.08)' : 'none',
    }}
    className="rounded-xl border transition-all duration-300"
  >
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
    >
      <span style={{ color: colors.textPrimary }} className="font-medium text-[15px] pr-4">
        {question}
      </span>
      <ChevronDown
        className="w-5 h-5 flex-shrink-0 transition-transform"
        style={{
          color: isOpen ? colors.accentBright : colors.textMuted,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s',
        }}
      />
    </button>
    <div
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

// --- Main Page ---
export default function HelpPage() {
  const [openItems, setOpenItems] = useState<Record<string, number | null>>({});

  const toggleItem = (sectionId: string, index: number) => {
    setOpenItems(prev => ({
      ...prev,
      [sectionId]: prev[sectionId] === index ? null : index,
    }));
  };

  // Handle hash scrolling on load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const el = document.querySelector(hash);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, []);

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
            linear-gradient(rgba(255,255,255,0.008) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.008) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Sticky Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: 'rgba(12, 18, 25, 0.8)',
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
            BABYSITTER™
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-250"
            style={{
              backgroundColor: colors.accentGlow,
              color: colors.accentBright,
              border: `1px solid rgba(74, 158, 173, 0.2)`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(74, 158, 173, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(74, 158, 173, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = colors.accentGlow;
              e.currentTarget.style.borderColor = 'rgba(74, 158, 173, 0.2)';
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
              color: colors.accentBright,
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
                e.currentTarget.style.borderColor = 'rgba(74, 158, 173, 0.3)';
                e.currentTarget.style.color = colors.accentBright;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(74, 158, 173, 0.1)';
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
                    <section.icon className="w-6 h-6" style={{ color: colors.accentBright }} />
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
                <div className="space-y-3">
                  {section.items.map((item, idx) => (
                    <AccordionItem
                      key={idx}
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
            className="rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden"
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
            }}
          >
            {/* Top gradient line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
              }}
            />

            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: colors.accentGlow }}
            >
              <Mail className="w-7 h-7" style={{ color: colors.accentBright }} />
            </div>

            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: colors.textPrimary }}
            >
              Still have questions?
            </h3>
            <p
              className="mb-6 max-w-md mx-auto"
              style={{ color: colors.textSecondary }}
            >
              Our team is here to help. Reach out and we'll get back to you as soon as possible.
            </p>

            <a
              href="mailto:babysitterbs9@gmail.com"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-sm uppercase tracking-wider transition-all duration-250"
              style={{
                backgroundColor: colors.accent,
                color: '#fff',
                boxShadow: `0 0 30px rgba(74, 158, 173, 0.3)`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = colors.accentBright;
                e.currentTarget.style.boxShadow = '0 0 40px rgba(74, 158, 173, 0.5)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = colors.accent;
                e.currentTarget.style.boxShadow = '0 0 30px rgba(74, 158, 173, 0.3)';
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
            &copy; {new Date().getFullYear()} BABYSITTER™. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
