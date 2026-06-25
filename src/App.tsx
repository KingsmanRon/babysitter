import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Play, Pause, ChevronDown, ShoppingBag, X, Check, ArrowRight, Shield, Send, Volume2, VolumeX, Loader2, Moon, Sun } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { useInView } from 'react-intersection-observer';
import { cn } from './utils/cn';
import { useProducts } from './hooks/useProducts';
import { createOrder, createYocoCheckout, formatZarFromCents, getActiveSale, getEffectiveDisplayPriceCents, Product } from './lib/api';
import { PrivacyPolicyModal, TermsOfServiceModal } from './LegalPages';

const PROMO_VIDEO = '/media/promovid.MP4';

type Theme = 'color' | 'stealth';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'color',
  toggleTheme: () => {},
});
const useTheme = () => useContext(ThemeContext);

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isStealth = theme === 'stealth';
  return (
    <motion.button
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.2 }}
      onClick={toggleTheme}
      aria-label={isStealth ? 'Switch to color theme' : 'Switch to stealth theme'}
      aria-pressed={isStealth}
      className="fixed top-6 right-4 sm:right-8 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white text-xs font-medium hover:bg-black/80 transition-colors"
    >
      <div className={cn(
        "relative w-9 h-5 rounded-full transition-colors",
        isStealth ? "bg-gray-600" : "bg-gradient-to-r from-purple-600 to-pink-600"
      )}>
        <motion.div
          animate={{ x: isStealth ? 0 : 18 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center"
        >
          {isStealth ? <Moon className="w-2.5 h-2.5 text-gray-700" /> : <Sun className="w-2.5 h-2.5 text-orange-500" />}
        </motion.div>
      </div>
      <span className="hidden sm:block uppercase tracking-wider">{isStealth ? 'Stealth' : 'Color'}</span>
    </motion.button>
  );
};

const VideoSection = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll();
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0.3]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black">
      <motion.div
        style={{ scale, opacity }}
        className="absolute inset-0"
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Promotional video showcasing BABYSITTER clothing and accessories"
          className="w-full h-full object-cover opacity-90"
        >
          <source src={PROMO_VIDEO} type="video/mp4" />
        </video>
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4 sm:px-6"
      >
        <motion.div
          animate={{ opacity: isPlaying ? 0.02 : 1 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 100, delay: 0.8 }}
            className="mb-6"
          >
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center animate-pulse">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-black flex items-center justify-center overflow-hidden">
                <img src="/media/bs-logo.png" alt="BABYSITTER logo" className="w-14 h-14 sm:w-20 sm:h-20 object-contain" />
              </div>
            </div>
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black text-white mb-4 tracking-tighter">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
              BABYSITTER
            </span>
            <span className="text-white/80">™</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-8 sm:mb-12 max-w-2xl"
          >
            Clothing & Accessories for the <span className="font-black text-white">BOLD</span>
          </motion.p>
        </motion.div>

        <div className="flex items-center gap-3">
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.5 }}
            onClick={togglePlay}
            className="group relative flex items-center gap-2 sm:gap-3 px-5 sm:px-8 py-3 sm:py-4 bg-white/10 backdrop-blur-lg rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center group-hover:scale-110 transition-transform">
              {isPlaying ? (
                <Pause className="w-5 h-5 text-black fill-current" />
              ) : (
                <Play className="w-5 h-5 text-black fill-current ml-1" />
              )}
            </div>
            <span className="text-white font-medium">{isPlaying ? "Pause" : "Play"} Video</span>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.7 }}
            onClick={toggleMute}
            className="group w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-lg rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300 flex items-center justify-center"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
      >
        <div className="flex flex-col items-center gap-2 text-white/50">
          <span className="text-sm uppercase tracking-widest">Scroll to explore</span>
          <ChevronDown className="w-6 h-6" />
        </div>
      </motion.div>
    </section>
  );
};

interface ProductSectionProps {
  product: Product;
  selectedSize: string | null;
  setSelectedSize: (size: string | null) => void;
  onAddToCart: () => void;
}

const ProductSection = ({ product, selectedSize, setSelectedSize, onAddToCart }: ProductSectionProps) => {
  const [currentImage, setCurrentImage] = useState(0);
  const [isAdded, setIsAdded] = useState(false);
  const addToCartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme } = useTheme();
  const s = theme === 'stealth';

  const { ref, inView } = useInView({
    threshold: 0.2,
    triggerOnce: true
  });

  useEffect(() => {
    return () => {
      if (addToCartTimeoutRef.current) {
        clearTimeout(addToCartTimeoutRef.current);
      }
    };
  }, []);

  const images = product.images.length > 0
    ? product.images
    : product.image_url
      ? [product.image_url]
      : [];
  const hasDisplayImage = images.length > 1;
  const isDisplayImage = hasDisplayImage && currentImage === 0;
  const soldOut = product.stock_count <= 0;
  const activeSale = getActiveSale(product);
  const priceDisplay = formatZarFromCents(getEffectiveDisplayPriceCents(product));
  const wasPriceDisplay = activeSale ? formatZarFromCents(activeSale.compareAtPriceCents) : null;
  const discountPercentDisplay = activeSale?.discountPercent == null
    ? null
    : `${Number.isInteger(activeSale.discountPercent) ? activeSale.discountPercent : activeSale.discountPercent.toFixed(2)}% off`;

  useEffect(() => {
    if (isDisplayImage) {
      setSelectedSize(null);
    }
  }, [isDisplayImage, setSelectedSize]);

  return (
    <section
      ref={ref}
      className={cn(
        "min-h-screen py-12 sm:py-20 px-4 sm:px-6 relative overflow-hidden",
        s ? "bg-[#0a0a0a]" : "bg-gradient-to-b from-black via-gray-900 to-black"
      )}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className={cn(
          "absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl",
          s ? "bg-white/[0.03]" : "bg-purple-500/10"
        )} />
        <div className={cn(
          "absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl",
          s ? "bg-white/[0.02]" : "bg-pink-500/10"
        )} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
              {images[currentImage] && (
                <motion.img
                  key={currentImage}
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  src={images[currentImage]}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

              <div className="absolute top-6 right-6">
                <div className={cn(
                  "px-4 py-2 rounded-full text-white font-bold text-sm",
                  isDisplayImage
                    ? "bg-black/60 backdrop-blur border border-white/20"
                    : soldOut
                      ? "bg-gray-700"
                      : s
                        ? "bg-white text-black"
                        : "bg-gradient-to-r from-orange-500 to-pink-500"
                )}>
                  {isDisplayImage ? "DISPLAY" : soldOut ? "SOLD OUT" : "NEW"}
                </div>
              </div>
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 sm:gap-4 mt-4 sm:mt-6">
                {images.map((img, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentImage(idx)}
                    aria-label={idx === 0 ? 'Display image' : `View product ${idx}`}
                    className={cn(
                      "relative flex-1 aspect-video rounded-xl overflow-hidden border-2 transition-all",
                      currentImage === idx
                        ? (s ? "border-white" : "border-purple-500")
                        : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <img src={img} alt={idx === 0 ? 'Display' : `View ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 right-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/60 backdrop-blur rounded py-0.5">
                        Display
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-8"
          >
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 }}
              >
                <span className={cn(
                  "font-medium uppercase tracking-widest text-sm",
                  s ? "text-gray-300" : "text-purple-400"
                )}>
                  Limited Edition
                </span>
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mt-2 leading-tight">
                  {product.name}
                </h2>
                {!isDisplayImage && (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4">
                    {activeSale ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="text-lg sm:text-xl font-semibold text-gray-400 line-through">Was {wasPriceDisplay}</span>
                          {discountPercentDisplay && (
                            <span className={cn(
                              "px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide",
                              s ? "bg-white text-black" : "bg-orange-500/20 text-orange-300"
                            )}>
                              {discountPercentDisplay}
                            </span>
                          )}
                        </div>
                        <span className="text-3xl sm:text-4xl font-bold text-white">Now {priceDisplay}</span>
                      </div>
                    ) : (
                      <span className="text-3xl sm:text-4xl font-bold text-white">{priceDisplay}</span>
                    )}
                    {!soldOut && (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-sm font-medium",
                        product.stock_count <= 5
                          ? "bg-orange-500/20 text-orange-300"
                          : "bg-green-500/20 text-green-400"
                      )}>
                        {product.stock_count <= 5
                          ? `Only ${product.stock_count} left`
                          : "In stock"}
                      </span>
                    )}
                    {soldOut && (
                      <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">
                        Sold out
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            </div>

            {product.description && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.4 }}
                className="text-gray-400 text-base sm:text-lg leading-relaxed"
              >
                {product.description}
              </motion.p>
            )}

            {isDisplayImage ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.5 }}
                className={cn(
                  "rounded-2xl border p-5 text-center",
                  s ? "bg-white/5 border-white/15" : "bg-white/5 border-white/10"
                )}
              >
                <p className="text-gray-300 text-sm sm:text-base">
                  This is a display image. Select a product below to view sizes and add to cart.
                </p>
              </motion.div>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">Select Size</span>
                    <button className={cn(
                      "text-sm underline",
                      s ? "text-gray-300 hover:text-white" : "text-purple-400 hover:text-purple-300"
                    )}>
                      Size Guide
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {product.sizes.map((size, idx) => (
                      <motion.button
                        key={size}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ delay: 0.5 + idx * 0.05 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedSize(size)}
                        disabled={soldOut}
                        className={cn(
                          "py-4 rounded-xl border-2 font-semibold text-lg transition-all duration-300",
                          selectedSize === size
                            ? s
                              ? "border-white bg-white/10 text-white scale-105"
                              : "border-purple-500 bg-purple-500/20 text-white scale-105"
                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600",
                          soldOut && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {size}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.7 }}
                  className="space-y-4"
                >
                  <motion.button
                    whileHover={soldOut || !selectedSize ? undefined : { scale: 1.02 }}
                    whileTap={soldOut || !selectedSize ? undefined : { scale: 0.98 }}
                    onClick={() => {
                      if (selectedSize && !soldOut) {
                        setIsAdded(true);
                        addToCartTimeoutRef.current = setTimeout(() => {
                          onAddToCart();
                          setIsAdded(false);
                        }, 800);
                      }
                    }}
                    disabled={!selectedSize || soldOut}
                    className={cn(
                      "w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300",
                      selectedSize && !soldOut
                        ? s
                          ? "bg-white text-black hover:shadow-2xl hover:shadow-white/20"
                          : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white hover:shadow-2xl hover:shadow-purple-500/25"
                        : "bg-gray-700 text-gray-500 cursor-not-allowed"
                    )}
                  >
                    {soldOut ? (
                      <>
                        <X className="w-6 h-6" />
                        Sold Out
                      </>
                    ) : isAdded ? (
                      <>
                        <Check className="w-6 h-6" />
                        Added to Cart!
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-6 h-6" />
                        {selectedSize ? `Add to Cart - ${priceDisplay}` : "Select a Size"}
                      </>
                    )}
                  </motion.button>

                  <div className="flex items-center justify-center gap-6 text-gray-500 text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>Secure Checkout</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>Yoco Payments</span>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

interface CheckoutModalProps {
  product: Product;
  size: string;
  onClose: () => void;
}

const CheckoutModal = ({ product, size, onClose }: CheckoutModalProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    line1: "",
    line2: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
  });
  const [consent, setConsent] = useState({ terms: false, marketing: false });
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const s = theme === 'stealth';

  const stableOnClose = useCallback(onClose, [onClose]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modal.querySelectorAll<HTMLElement>(focusableSelector);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stableOnClose();
        return;
      }
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, stableOnClose]);

  const handlePay = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const order = await createOrder({
        customerEmail: formData.email,
        customerName: formData.name,
        shipping: {
          phone: formData.phone,
          line1: formData.line1,
          line2: formData.line2,
          suburb: formData.suburb,
          city: formData.city,
          province: formData.province,
          postalCode: formData.postalCode,
        },
        items: [{ productId: product.id, size, quantity: 1 }],
      });
      const { redirectUrl } = await createYocoCheckout(order.id);
      window.location.href = redirectUrl;
    } catch (err) {
      setErrorMsg((err as Error).message || "Could not start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  const priceDisplay = formatZarFromCents(getEffectiveDisplayPriceCents(product));
  const primaryImage = product.images[0] ?? product.image_url ?? '';
  const fieldClass = cn(
    "w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors",
    s ? "focus:border-white" : "focus:border-purple-500"
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <motion.div
        ref={modalRef}
        initial={{ scale: 0.9, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 50 }}
        transition={{ type: "spring", damping: 25 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-gray-900 rounded-t-3xl sm:rounded-3xl overflow-hidden border border-gray-800 shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
      >
        <div className="relative">
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className={cn(
            "p-5 sm:p-8 text-center",
            s ? "bg-[#1a1a1a]" : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500"
          )}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className={cn(
                "w-20 h-20 mx-auto mb-4 rounded-2xl backdrop-blur flex items-center justify-center",
                s ? "bg-white/10 border border-white/15" : "bg-white/20"
              )}
            >
              <ShoppingBag className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-white">
              {step === 1 ? "Checkout" : "Payment"}
            </h2>
            <p className="text-white/70 mt-1">
              {step === 1 ? "Enter your details" : "Complete your purchase"}
            </p>
          </div>

          <div className="px-5 sm:px-8 py-2 bg-gray-800">
            <div className="flex items-center justify-between">
              {[1, 2].map((stepNum) => (
                <div key={stepNum} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    stepNum <= step
                      ? s ? "bg-white text-black" : "bg-purple-500 text-white"
                      : "bg-gray-700 text-gray-500"
                  )}>
                    {stepNum < step ? <Check className="w-4 h-4" /> : stepNum}
                  </div>
                  {stepNum < 2 && (
                    <div className={cn(
                      "w-12 h-1 mx-2 rounded transition-all",
                      stepNum < step
                        ? s ? "bg-white" : "bg-purple-500"
                        : "bg-gray-700"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {step === 1 && (
            <motion.form
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={(e) => { e.preventDefault(); if (consent.terms) setStep(2); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className={cn(
                    "w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors",
                    s ? "focus:border-white" : "focus:border-purple-500"
                  )}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className={cn(
                    "w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors",
                    s ? "focus:border-white" : "focus:border-purple-500"
                  )}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={fieldClass}
                  placeholder="071 234 5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Street Address</label>
                <input
                  type="text"
                  required
                  value={formData.line1}
                  onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                  className={fieldClass}
                  placeholder="123 Main Road"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Apartment, suite, etc. <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.line2}
                  onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                  className={fieldClass}
                  placeholder="Unit 4B, complex name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Suburb</label>
                  <input
                    type="text"
                    required
                    value={formData.suburb}
                    onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                    className={fieldClass}
                    placeholder="Suburb"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">City / Town</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={fieldClass}
                    placeholder="City"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Province</label>
                  <select
                    required
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="" disabled>Select province</option>
                    <option>Eastern Cape</option>
                    <option>Free State</option>
                    <option>Gauteng</option>
                    <option>KwaZulu-Natal</option>
                    <option>Limpopo</option>
                    <option>Mpumalanga</option>
                    <option>North West</option>
                    <option>Northern Cape</option>
                    <option>Western Cape</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Postal Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    className={fieldClass}
                    placeholder="0001"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={consent.terms}
                    onChange={(e) => setConsent({ ...consent, terms: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
                  />
                  <span className="text-xs text-gray-400 leading-relaxed">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-terms'))}
                      className={cn("underline", s ? "text-gray-300 hover:text-white" : "text-purple-400 hover:text-purple-300")}
                    >
                      Terms of Service
                    </button>
                    {' '}and{' '}
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-privacy'))}
                      className={cn("underline", s ? "text-gray-300 hover:text-white" : "text-purple-400 hover:text-purple-300")}
                    >
                      Privacy Policy
                    </button>
                    . I consent to the processing of my personal information as described. <span className="text-red-400">*</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent.marketing}
                    onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
                  />
                  <span className="text-xs text-gray-400 leading-relaxed">
                    I would like to receive marketing emails about new products and exclusive offers. (Optional)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!consent.terms}
                className={cn(
                  "w-full py-4 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                  s
                    ? "bg-white text-black hover:shadow-lg hover:shadow-white/20"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/25"
                )}
              >
                Continue to Payment
                <ArrowRight className="w-5 h-5 inline-block ml-2" />
              </button>
            </motion.form>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 mb-6">
                <div className="flex gap-4">
                  {primaryImage && (
                    <img src={primaryImage} alt={product.name} className="w-20 h-20 rounded-lg object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{product.name}</h3>
                    <p className="text-gray-400 text-sm">Size: {size}</p>
                    <p className={cn("font-bold mt-1", s ? "text-white" : "text-purple-400")}>{priceDisplay}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-2">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span>{priceDisplay}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-green-400">Free</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-white font-bold">
                  <span>Total</span>
                  <span>{priceDisplay}</span>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-xl border text-center",
                s ? "bg-white/5 border-white/15" : "bg-purple-500/10 border-purple-500/20"
              )}>
                <p className="text-gray-300 text-sm">
                  You'll be redirected to <span className={cn("font-semibold", s ? "text-white" : "text-purple-400")}>Yoco</span> to complete your payment securely.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={isProcessing}
                className={cn(
                  "w-full py-4 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                  s
                    ? "bg-white text-black hover:shadow-lg hover:shadow-white/20"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/25"
                )}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Redirecting to Yoco...
                  </div>
                ) : (
                  <>
                    <Shield className="w-5 h-5 inline-block mr-2" />
                    Pay {priceDisplay} with Yoco
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isProcessing}
                className="w-full py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                ← Back
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const Newsletter = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const { theme } = useTheme();
  const s = theme === 'stealth';

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');

    try {
      await emailjs.send(
        'service_babysitter',
        'template_newsletter',
        {
          subscriber_email: email,
          to_email: 'babysitterbs9@gmail.com',
          message: `New newsletter subscriber: ${email}`,
        },
        'YOUR_EMAILJS_PUBLIC_KEY'
      );
      setStatus('sent');
      setEmail('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div>
      <h4 className="text-white font-semibold mb-4">Newsletter</h4>
      <p className="text-gray-500 mb-4">Get exclusive offers and product updates</p>
      <form onSubmit={handleSubscribe} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email"
          className={cn(
            "flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none",
            s ? "focus:border-white" : "focus:border-purple-500"
          )}
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className={cn(
            "px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50",
            s ? "bg-white text-black hover:bg-gray-200" : "bg-purple-600 hover:bg-purple-700"
          )}
        >
          {status === 'sending' ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : status === 'sent' ? (
            <Check className="w-5 h-5" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>
      {status === 'sent' && (
        <p className="text-green-400 text-sm mt-2">Subscribed successfully!</p>
      )}
      {status === 'error' && (
        <p className="text-red-400 text-sm mt-2">Something went wrong. Try again.</p>
      )}

      <div className="flex flex-wrap gap-3 mt-4">
        <a
          href="https://whatsapp.com/channel/0029Vb6wcCeLCoWwT54KMn01"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
            s
              ? "bg-gray-700 text-white hover:bg-gray-600"
              : "bg-green-600 text-white hover:bg-green-700"
          )}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Join WhatsApp Channel
        </a>
        <a
          href="https://www.instagram.com/babysitter_bs/?hl=en"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
            s
              ? "bg-gray-700 text-white hover:bg-gray-600"
              : "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:from-purple-700 hover:via-pink-600 hover:to-orange-500"
          )}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
          Follow on Instagram
        </a>
      </div>
    </div>
  );
};

interface FooterProps {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

const Footer = ({ onOpenPrivacy, onOpenTerms }: FooterProps) => {
  const { theme } = useTheme();
  const s = theme === 'stealth';
  const linkHover = s ? "hover:text-gray-200" : "hover:text-purple-400";
  return (
    <footer className={cn(
      "border-t border-gray-800 py-10 sm:py-16 px-4 sm:px-6",
      s ? "bg-[#0a0a0a]" : "bg-black"
    )}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 mb-12">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden">
                <img src="/media/bs-logo.png" alt="BABYSITTER logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold text-white">BABYSITTER</span>
            </div>
            <p className="text-gray-500 uppercase tracking-[3px] text-xs">Changing the world one garment at a time.</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="#" className={cn("transition-colors", linkHover)}>All Products</a></li>
              <li><a href="#" className={cn("transition-colors", linkHover)}>New Arrivals</a></li>
              <li><a href="#" className={cn("transition-colors", linkHover)}>Best Sellers</a></li>
              <li><a href="#" className={cn("transition-colors", linkHover)}>Sale</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="/help" className={cn("transition-colors", linkHover)}>FAQ</a></li>
              <li><a href="/help#shipping" className={cn("transition-colors", linkHover)}>Shipping</a></li>
              <li><a href="/help#returns" className={cn("transition-colors", linkHover)}>Returns</a></li>
              <li><a href="/help#contact" className={cn("transition-colors", linkHover)}>Contact</a></li>
            </ul>
          </div>

          <div className="col-span-2 md:col-span-1">
            <Newsletter />
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">&copy; {new Date().getFullYear()} BABYSITTER. All rights reserved.</p>
          <div className="flex items-center gap-4 text-gray-500 text-sm">
            <button onClick={onOpenPrivacy} className="hover:text-white transition-colors">Privacy Policy</button>
            <button onClick={onOpenTerms} className="hover:text-white transition-colors">Terms of Service</button>
          </div>
        </div>
      </div>
    </footer>
  );
};

const FloatingCart = ({ onClick, count }: { onClick: () => void; count: number }) => {
  const { theme } = useTheme();
  const s = theme === 'stealth';
  return (
    <motion.button
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay: 2, type: "spring" }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label="Open cart"
      className={cn(
        "fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-2xl flex items-center justify-center",
        s
          ? "bg-white text-black shadow-white/20"
          : "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-purple-500/25"
      )}
    >
      <ShoppingBag className="w-6 h-6" />
      {count > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            "absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center",
            s ? "bg-gray-800 text-white" : "bg-orange-500 text-white"
          )}
        >
          {count}
        </motion.div>
      )}
    </motion.button>
  );
};

export default function App() {
  const { products, loading, error } = useProducts();
  const product = products[0] ?? null;

  const [theme, setTheme] = useState<Theme>('color');
  const toggleTheme = useCallback(() => setTheme(t => t === 'color' ? 'stealth' : 'color'), []);

  const [showCart, setShowCart] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
    const openPrivacy = () => setShowPrivacy(true);
    const openTerms = () => setShowTerms(true);
    window.addEventListener('open-privacy', openPrivacy);
    window.addEventListener('open-terms', openTerms);
    return () => {
      window.removeEventListener('open-privacy', openPrivacy);
      window.removeEventListener('open-terms', openTerms);
    };
  }, []);

  const handleAddToCart = () => {
    setCartCount(prev => prev + 1);
    setShowCart(true);
  };

  const s = theme === 'stealth';

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={cn("min-h-screen", s ? "bg-[#0a0a0a]" : "bg-black")}>
        <motion.div
          className={cn(
            "fixed top-0 left-0 right-0 h-1 z-50 origin-left",
            s ? "bg-white" : "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"
          )}
          style={{ scaleX }}
        />

        <ThemeToggle />

        <VideoSection />

        {loading && !product && (
          <section className={cn("min-h-[40vh] flex items-center justify-center", s ? "bg-[#0a0a0a]" : "bg-black")}>
            <Loader2 className={cn("w-8 h-8 animate-spin", s ? "text-white" : "text-purple-400")} />
          </section>
        )}

        {!loading && !product && (
          <section className={cn("min-h-[40vh] flex items-center justify-center px-6", s ? "bg-[#0a0a0a]" : "bg-black")}>
            <div className="max-w-md text-center space-y-2">
              <h3 className="text-xl font-bold text-white">No products available</h3>
              <p className="text-gray-400 text-sm">
                {error ?? "Check back soon — new drops coming."}
              </p>
            </div>
          </section>
        )}

        {product && (
          <ProductSection
            product={product}
            selectedSize={selectedSize}
            setSelectedSize={setSelectedSize}
            onAddToCart={handleAddToCart}
          />
        )}

        <Footer onOpenPrivacy={() => setShowPrivacy(true)} onOpenTerms={() => setShowTerms(true)} />

        <FloatingCart onClick={() => setShowCart(true)} count={cartCount} />

        <AnimatePresence>
          {showCart && product && selectedSize && product.stock_count > 0 && (
            <CheckoutModal
              product={product}
              size={selectedSize}
              onClose={() => setShowCart(false)}
            />
          )}
        </AnimatePresence>

        <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
        <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      </div>
    </ThemeContext.Provider>
  );
}
