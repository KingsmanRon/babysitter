import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Play, Pause, ChevronDown, ShoppingBag, X, Check, ArrowRight, Shield, Send } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { useInView } from 'react-intersection-observer';
import { cn } from './utils/cn';

const PRODUCT = {
  name: "BABYSITTER™",
  price: 249,
  description: "Premium streetwear crafted for everyday confidence. Featuring tailored fits, breathable fabrics, and timeless style for any occasion.",
  video: "/media/promovid.MP4",
  images: [
    "/media/boy.jpeg",
    "/media/girl.jpeg",
    "/media/pinkracer.jpeg",
    "/media/greenracer.jpeg"
  ],
  sizes: ["XS", "S", "M", "L", "XL", "XXL"],
};

// --- Fix #1: Video play/pause now calls .play()/.pause() on the element ---
const VideoSection = () => {
  const [isPlaying, setIsPlaying] = useState(true);
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

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black">
      <motion.div
        style={{ scale, opacity }}
        className="absolute inset-0"
      >
        {/* Fix #9d: Added aria-label for video accessibility */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Promotional video showcasing BABYSITTER clothing and accessories"
          className="w-full h-full object-cover opacity-60"
        >
          <source src={PRODUCT.video} type="video/mp4" />
        </video>
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6"
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
            <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center animate-pulse">
              <div className="w-28 h-28 rounded-full bg-black flex items-center justify-center overflow-hidden">
                <img src="/media/bs-logo.png" alt="BABYSITTER logo" className="w-20 h-20 object-contain" />
              </div>
            </div>
          </motion.div>

          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black text-white mb-4 tracking-tighter">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
              BABYSITTER
            </span>
            <span className="text-white/80">™</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-xl md:text-2xl text-gray-300 mb-12 max-w-2xl"
          >
            Clothing & Accessories for the <span className="font-black text-white">BOLD</span>
          </motion.p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5 }}
          onClick={togglePlay}
          className="group relative flex items-center gap-3 px-8 py-4 bg-white/10 backdrop-blur-lg rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center group-hover:scale-110 transition-transform">
            {isPlaying ? (
              <Pause className="w-5 h-5 text-black fill-current" />
            ) : (
              <Play className="w-5 h-5 text-black fill-current ml-1" />
            )}
          </div>
          <span className="text-white font-medium">{isPlaying ? "Pause" : "Play"} Video</span>
        </motion.button>
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

// --- Fix #3: ProductSection now receives lifted state via props ---
// --- Fix #8: setTimeout is cleaned up on unmount via ref ---
interface ProductSectionProps {
  selectedSize: string | null;
  setSelectedSize: (size: string | null) => void;
  onAddToCart: () => void;
}

const ProductSection = ({ selectedSize, setSelectedSize, onAddToCart }: ProductSectionProps) => {
  const [currentImage, setCurrentImage] = useState(0);
  const [isAdded, setIsAdded] = useState(false);
  const addToCartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <section
      ref={ref}
      className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black py-20 px-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
              <motion.img
                key={currentImage}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                src={PRODUCT.images[currentImage]}
                alt={PRODUCT.name}
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

              <div className="absolute top-6 right-6">
                <div className="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full text-white font-bold text-sm">
                  NEW
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              {PRODUCT.images.map((img, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentImage(idx)}
                  className={cn(
                    "flex-1 aspect-video rounded-xl overflow-hidden border-2 transition-all",
                    currentImage === idx ? "border-purple-500" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover" />
                </motion.button>
              ))}
            </div>
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
                <span className="text-purple-400 font-medium uppercase tracking-widest text-sm">
                  Limited Edition
                </span>
                <h2 className="text-5xl md:text-6xl font-black text-white mt-2 leading-tight">
                  {PRODUCT.name}
                </h2>
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-4xl font-bold text-white">R{PRODUCT.price}</span>
                  <span className="text-xl text-gray-500 line-through">R450</span>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                    33% OFF
                  </span>
                </div>
              </motion.div>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.4 }}
              className="text-gray-400 text-lg leading-relaxed"
            >
              {PRODUCT.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Select Size</span>
                <button className="text-purple-400 text-sm underline hover:text-purple-300">
                  Size Guide
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {PRODUCT.sizes.map((size, idx) => (
                  <motion.button
                    key={size}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.5 + idx * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedSize(size)}
                    className={cn(
                      "py-4 rounded-xl border-2 font-semibold text-lg transition-all duration-300",
                      selectedSize === size
                        ? "border-purple-500 bg-purple-500/20 text-white scale-105"
                        : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (selectedSize) {
                    setIsAdded(true);
                    addToCartTimeoutRef.current = setTimeout(() => {
                      onAddToCart();
                      setIsAdded(false);
                    }, 1000);
                  }
                }}
                disabled={!selectedSize}
                className={cn(
                  "w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300",
                  selectedSize
                    ? "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white hover:shadow-2xl hover:shadow-purple-500/25"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                )}
              >
                {isAdded ? (
                  <>
                    <Check className="w-6 h-6" />
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-6 h-6" />
                    {selectedSize ? `Add to Cart - R${PRODUCT.price}` : "Select a Size"}
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
                  <span>PayFast Payment</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// PayFast configuration
const PAYFAST_CONFIG = {
  merchant_id: '10000100',       // Replace with your PayFast Merchant ID
  merchant_key: '46f0cd694581a',  // Replace with your PayFast Merchant Key
  // Use sandbox for testing, switch to www.payfast.co.za for production
  action_url: 'https://sandbox.payfast.co.za/eng/process',
  return_url: window.location.origin,  // Redirect after successful payment
  cancel_url: window.location.origin,  // Redirect if payment is cancelled
  notify_url: '',                       // Your server ITN endpoint (set when you have a backend)
};

// --- Fix #5: Order number generated once via useRef ---
// --- Fix #6: size prop guarded with default ---
// --- Fix #9c: Focus trapping in modal ---
const CheckoutModal = ({ product, size, onClose }: { product: typeof PRODUCT; size: string; onClose: () => void }) => {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
  });
  const orderNumber = useRef(`#BS-${Math.random().toString(36).substr(2, 8).toUpperCase()}`);
  const modalRef = useRef<HTMLDivElement>(null);

  const stableOnClose = useCallback(onClose, [onClose]);

  // Focus trapping
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

  const payfastFormRef = useRef<HTMLFormElement>(null);

  const handlePayFastSubmit = () => {
    setIsProcessing(true);
    // Submit the hidden PayFast form to redirect to PayFast's payment page
    payfastFormRef.current?.submit();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
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
        className="w-full max-w-lg bg-gray-900 rounded-3xl overflow-hidden border border-gray-800 shadow-2xl"
      >
        <div className="relative">
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"
            >
              {step === 3 ? (
                <Check className="w-10 h-10 text-white" />
              ) : (
                <ShoppingBag className="w-10 h-10 text-white" />
              )}
            </motion.div>
            <h2 className="text-2xl font-bold text-white">
              {step === 1 ? "Checkout" : step === 2 ? "Payment" : "Order Confirmed!"}
            </h2>
            <p className="text-white/70 mt-1">
              {step === 1 ? "Enter your details" : step === 2 ? "Complete your purchase" : "Thank you for your order"}
            </p>
          </div>

          <div className="px-8 py-2 bg-gray-800">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    s <= step ? "bg-purple-500 text-white" : "bg-gray-700 text-gray-500"
                  )}>
                    {s < step ? <Check className="w-4 h-4" /> : s}
                  </div>
                  {s < 3 && (
                    <div className={cn(
                      "w-12 h-1 mx-2 rounded transition-all",
                      s < step ? "bg-purple-500" : "bg-gray-700"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <motion.form
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={(e) => { e.preventDefault(); setStep(2); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
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
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="John Doe"
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all"
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
                  <img src={product.images[0]} alt={product.name} className="w-20 h-20 rounded-lg object-cover" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{product.name}</h3>
                    <p className="text-gray-400 text-sm">Size: {size}</p>
                    <p className="text-purple-400 font-bold mt-1">R{product.price}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-2">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span>R{product.price}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-green-400">Free</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-white font-bold">
                  <span>Total</span>
                  <span>R{product.price}</span>
                </div>
              </div>

              <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20 text-center">
                <p className="text-gray-300 text-sm">
                  You'll be redirected to <span className="text-purple-400 font-semibold">PayFast</span> to complete your payment securely.
                </p>
              </div>

              {/* Hidden PayFast form — submits directly to PayFast's hosted payment page */}
              <form
                ref={payfastFormRef}
                action={PAYFAST_CONFIG.action_url}
                method="POST"
                className="hidden"
              >
                <input type="hidden" name="merchant_id" value={PAYFAST_CONFIG.merchant_id} />
                <input type="hidden" name="merchant_key" value={PAYFAST_CONFIG.merchant_key} />
                <input type="hidden" name="return_url" value={PAYFAST_CONFIG.return_url} />
                <input type="hidden" name="cancel_url" value={PAYFAST_CONFIG.cancel_url} />
                {PAYFAST_CONFIG.notify_url && (
                  <input type="hidden" name="notify_url" value={PAYFAST_CONFIG.notify_url} />
                )}
                <input type="hidden" name="name_first" value={formData.name.split(' ')[0] || ''} />
                <input type="hidden" name="name_last" value={formData.name.split(' ').slice(1).join(' ') || ''} />
                <input type="hidden" name="email_address" value={formData.email} />
                <input type="hidden" name="m_payment_id" value={orderNumber.current} />
                <input type="hidden" name="amount" value={product.price.toFixed(2)} />
                <input type="hidden" name="item_name" value={`${product.name} - Size ${size}`} />
              </form>

              <button
                type="button"
                onClick={handlePayFastSubmit}
                disabled={isProcessing}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Redirecting to PayFast...
                  </div>
                ) : (
                  <>
                    <Shield className="w-5 h-5 inline-block mr-2" />
                    Pay R{product.price} with PayFast
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full py-2 text-gray-400 hover:text-white transition-colors"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <Check className="w-12 h-12 text-white" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Order Confirmed!</h3>
                <p className="text-gray-400">Check your email for tracking information</p>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                <p className="text-sm text-gray-400">Order Number</p>
                {/* Fix #5: Order number stable across re-renders */}
                <p className="text-lg font-mono text-purple-400">{orderNumber.current}</p>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                <Shield className="w-4 h-4" />
                <span>Protected by PayFast</span>
              </div>

              <button
                onClick={onClose}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all"
              >
                Continue Shopping
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
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="bg-black border-t border-gray-800 py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden">
                <img src="/media/bs-logo.png" alt="BABYSITTER logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold text-white">BABYSITTER</span>
            </div>
            <p className="text-gray-500">Clothing & accessories for the bold.</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="#" className="hover:text-purple-400 transition-colors">All Products</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">New Arrivals</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">Best Sellers</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">Sale</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="#" className="hover:text-purple-400 transition-colors">FAQ</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">Shipping</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">Returns</a></li>
              <li><a href="#" className="hover:text-purple-400 transition-colors">Contact</a></li>
            </ul>
          </div>

          <Newsletter />
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Fix #9a: Dynamic copyright year */}
          <p className="text-gray-500 text-sm">&copy; {new Date().getFullYear()} BABYSITTER. All rights reserved.</p>
          <div className="flex items-center gap-4 text-gray-500 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

const FloatingCart = ({ onClick, count }: { onClick: () => void; count: number }) => {
  return (
    <motion.button
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay: 2, type: "spring" }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-2xl shadow-purple-500/25 flex items-center justify-center"
    >
      <ShoppingBag className="w-6 h-6" />
      {count > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 w-6 h-6 bg-orange-500 rounded-full text-xs font-bold flex items-center justify-center"
        >
          {count}
        </motion.div>
      )}
    </motion.button>
  );
};

// --- Fix #3: Single source of truth for cart state, lifted to App ---
// --- Fix #4: cartCount setter is now available and wired up ---
// --- Fix #6: Modal only renders when selectedSize is truthy (no null assertion needed) ---
export default function App() {
  const [showCart, setShowCart] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const handleAddToCart = () => {
    setCartCount(prev => prev + 1);
    setShowCart(true);
  };

  return (
    <div className="bg-black min-h-screen">
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 z-50 origin-left"
        style={{ scaleX }}
      />

      <VideoSection />
      <ProductSection
        selectedSize={selectedSize}
        setSelectedSize={setSelectedSize}
        onAddToCart={handleAddToCart}
      />
      <Footer />

      <FloatingCart onClick={() => setShowCart(true)} count={cartCount} />

      <AnimatePresence>
        {showCart && selectedSize && (
          <CheckoutModal
            product={PRODUCT}
            size={selectedSize}
            onClose={() => setShowCart(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
