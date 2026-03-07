import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Play, Pause, ChevronDown, ShoppingBag, X, Check, ArrowRight, Shield, Send, Volume2, VolumeX, Minus, Plus, Trash2 } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { useInView } from 'react-intersection-observer';
import { cn } from './utils/cn';
import { formatZAR } from './utils/currency';
import { PrivacyPolicyModal, TermsOfServiceModal } from './LegalPages';

// Theme system
type Theme = 'color' | 'stealth';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'color',
  toggleTheme: () => {},
});
const useTheme = () => useContext(ThemeContext);

// Cart types
type CartItem = { size: string; quantity: number };
const MAX_QTY_PER_SIZE = 3;
const MAX_CART_ITEMS = 9;

// Default stock (used as fallback while fetching from backend)
const DEFAULT_STOCK: Record<string, number> = { S: 10, M: 15, L: 10 };

const PRODUCT = {
  name: "BS X-Ray Motor-Cross Jersey",
  price: 1499,
  description: "Premium streetwear crafted for everyday confidence. Featuring tailored fits, breathable fabrics, and timeless style for any occasion.",
  video: "/media/promovid.MP4",
  images: [
    "/media/boygirl.jpeg",
    "/media/boy.jpeg",
    "/media/pinkracer.jpeg",
    "/media/girl.jpeg",
    "/media/greenracer.jpeg"
  ],
  sizes: ["S", "M", "L"],
};

// PayFast configuration (sandbox credentials for development)
// In production, the /api/checkout route uses server-side env vars
const PAYFAST_SANDBOX_CONFIG = {
  merchant_id: '10000100',
  merchant_key: '46f0cd694581a',
  passphrase: '',
  action_url: 'https://sandbox.payfast.co.za/eng/process',
  return_url: `${window.location.origin}${window.location.pathname}?payment=success`,
  cancel_url: `${window.location.origin}${window.location.pathname}?payment=cancelled`,
  notify_url: '',
};

// MD5 signature generation (used for sandbox/fallback only)
const generatePayFastSignature = (data: Record<string, string>, passphrase?: string): string => {
  const params = Object.entries(data)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const signatureString = passphrase ? `${params}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : params;
  return md5(signatureString);
};

function md5(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s: string) {
    const n = s.length;
    let state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= n; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s: string) {
    const md5blks: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  const hex_chr = '0123456789abcdef'.split('');
  function rhex(n: number) {
    let s = '';
    for (let j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    return s;
  }
  function add32(a: number, b: number) { return (a + b) & 0xFFFFFFFF; }
  function hex(x: number[]) { return x.map(v => rhex(v)).join(''); }
  return hex(md51(string));
}

// --- Video Section ---
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
          style={{ objectPosition: 'center 30%' }}
        >
          <source src={PRODUCT.video} type="video/mp4" />
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
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white flex items-center justify-center animate-pulse">
              <div className="w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full bg-white flex items-center justify-center overflow-hidden">
                <img src="/media/logo2.jpeg" alt="BABYSITTER logo" className="w-[7rem] h-[7rem] sm:w-[10rem] sm:h-[10rem] object-cover rounded-full" />
              </div>
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-8 sm:mb-12 max-w-2xl"
          >
            CHANGING THE WORLD ONE GARMENT AT A <span className="font-black text-white">TIME</span>
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

// --- Product Section ---
interface ProductSectionProps {
  selectedSize: string | null;
  setSelectedSize: (size: string | null) => void;
  onAddToCart: () => void;
  currentImage: number;
  setCurrentImage: (idx: number) => void;
  cart: CartItem[];
  stock: Record<string, number>;
}

const ProductSection = ({ selectedSize, setSelectedSize, onAddToCart, currentImage, setCurrentImage, cart, stock }: ProductSectionProps) => {
  const [isAdded, setIsAdded] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
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

  const getStockStatus = (size: string) => {
    const sizeStock = stock[size] || 0;
    const inCart = cart.find(item => item.size === size)?.quantity || 0;
    const remaining = sizeStock - inCart;
    if (remaining <= 0) return { label: 'Out of Stock', color: 'text-red-400' };
    if (remaining <= 5) return { label: `Low Stock (${remaining} left)`, color: 'text-orange-400' };
    return { label: 'In Stock', color: 'text-green-400' };
  };

  const canAddToCart = () => {
    if (!selectedSize) return false;
    const existing = cart.find(item => item.size === selectedSize);
    const currentQty = existing?.quantity || 0;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (currentQty >= MAX_QTY_PER_SIZE) return false;
    if (totalItems >= MAX_CART_ITEMS) return false;
    if (currentQty >= (stock[selectedSize] || 0)) return false;
    return true;
  };

  const handleAdd = () => {
    if (!selectedSize) return;
    if (!canAddToCart()) {
      const existing = cart.find(item => item.size === selectedSize);
      const currentQty = existing?.quantity || 0;
      if (currentQty >= MAX_QTY_PER_SIZE) {
        setCartError(`Maximum ${MAX_QTY_PER_SIZE} per size allowed`);
      } else if (currentQty >= (stock[selectedSize] || 0)) {
        setCartError('This size is out of stock');
      } else {
        setCartError(`Maximum ${MAX_CART_ITEMS} items per order`);
      }
      setTimeout(() => setCartError(null), 3000);
      return;
    }
    setIsAdded(true);
    addToCartTimeoutRef.current = setTimeout(() => {
      onAddToCart();
      setIsAdded(false);
    }, 1000);
  };

  return (
    <section
      ref={ref}
      className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black py-12 sm:py-20 px-4 sm:px-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className={cn("absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl transition-colors duration-700", s ? "bg-gray-500/5" : "bg-purple-500/10")} />
        <div className={cn("absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl transition-colors duration-700", s ? "bg-gray-600/5" : "bg-pink-500/10")} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-square rounded-3xl overflow-hidden">
              <div className="absolute inset-0 z-0" style={{ backgroundImage: 'url(/media/bg1.png)', backgroundRepeat: 'repeat', backgroundSize: '250px', opacity: 0.2 }} />
              <motion.img
                key={currentImage}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                src={PRODUCT.images[currentImage]}
                alt={PRODUCT.name}
                className="w-full h-full object-contain relative z-10 rounded-2xl border-2 border-black"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

              <div className="absolute top-6 right-6 z-20">
                <div className={cn(
                  "px-4 py-2 rounded-full font-bold text-sm transition-colors duration-500",
                  s ? "bg-white text-black" : "bg-gradient-to-r from-orange-500 to-pink-500 text-white"
                )}>
                  NEW
                </div>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-4 mt-4 sm:mt-6">
              {PRODUCT.images.map((img, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentImage(idx)}
                  className={cn(
                    "flex-1 aspect-video rounded-xl overflow-hidden border-2 transition-all",
                    currentImage === idx ? (s ? "border-white" : "border-purple-500") : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover rounded-xl border-2 border-black" />
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
                <span className={cn("font-medium uppercase tracking-widest text-sm transition-colors duration-500", s ? "text-gray-400" : "text-purple-400")}>
                  Limited Edition
                </span>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mt-2 leading-tight">
                  {PRODUCT.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4">
                  <span className="text-3xl sm:text-4xl font-bold text-white">{formatZAR(PRODUCT.price)}</span>
                </div>
              </motion.div>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.4 }}
              className="text-gray-400 text-base sm:text-lg leading-relaxed"
            >
              {PRODUCT.description}
            </motion.p>

            {currentImage !== 0 && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">Select Size</span>
                    <button className={cn("text-sm underline transition-colors duration-500", s ? "text-gray-400 hover:text-gray-200" : "text-purple-400 hover:text-purple-300")}>
                      Size Guide
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {PRODUCT.sizes.map((size, idx) => {
                      const stockStatus = getStockStatus(size);
                      const outOfStock = stockStatus.label === 'Out of Stock';
                      return (
                        <motion.button
                          key={size}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={inView ? { opacity: 1, scale: 1 } : {}}
                          transition={{ delay: 0.5 + idx * 0.05 }}
                          whileHover={outOfStock ? {} : { scale: 1.05 }}
                          whileTap={outOfStock ? {} : { scale: 0.95 }}
                          onClick={() => !outOfStock && setSelectedSize(size)}
                          disabled={outOfStock}
                          className={cn(
                            "py-4 rounded-xl border-2 font-semibold text-lg transition-all duration-300",
                            outOfStock
                              ? "border-gray-800 bg-gray-800/30 text-gray-600 cursor-not-allowed"
                              : selectedSize === size
                                ? (s ? "border-white bg-white/10 text-white scale-105" : "border-purple-500 bg-purple-500/20 text-white scale-105")
                                : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                          )}
                        >
                          <div>{size}</div>
                          <div className={cn("text-xs mt-1 font-normal", stockStatus.color)}>{stockStatus.label}</div>
                        </motion.button>
                      );
                    })}
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
                    onClick={handleAdd}
                    disabled={!selectedSize}
                    className={cn(
                      "w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300",
                      selectedSize
                        ? (s
                          ? "bg-white text-black hover:shadow-2xl hover:shadow-white/10 hover:bg-gray-100"
                          : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white hover:shadow-2xl hover:shadow-purple-500/25")
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
                        {selectedSize ? `Add to Cart - ${formatZAR(PRODUCT.price)}` : "Select a Size"}
                      </>
                    )}
                  </motion.button>

                  {cartError && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-orange-400 text-sm text-center"
                    >
                      {cartError}
                    </motion.p>
                  )}

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
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// Map catalog selection to the image shown in checkout
const getCheckoutImage = (currentImage: number): string => {
  const checkoutImageMap: Record<number, string> = {
    1: '/media/pinkracer.jpeg',
    2: '/media/pinkracer.jpeg',
    3: '/media/greenracer.jpeg',
    4: '/media/greenracer.jpeg',
  };
  return checkoutImageMap[currentImage] || PRODUCT.images[currentImage];
};

// --- Checkout Modal ---
interface CheckoutModalProps {
  product: typeof PRODUCT;
  cart: CartItem[];
  cartTotal: number;
  onClose: () => void;
  onUpdateCart: (size: string, quantity: number) => void;
  onRemoveFromCart: (size: string) => void;
  currentImage: number;
  stock: Record<string, number>;
}

const CheckoutModal = ({ product, cart, cartTotal, onClose, onUpdateCart, onRemoveFromCart, currentImage, stock }: CheckoutModalProps) => {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({ email: "", name: "" });
  const [consent, setConsent] = useState({ terms: false, marketing: false });
  const [payfastFormData, setPayfastFormData] = useState<Record<string, string> | null>(null);
  const [payfastActionUrl, setPayfastActionUrl] = useState('');
  const orderNumber = useRef(`BS-${Math.random().toString(36).substr(2, 8).toUpperCase()}`);
  const modalRef = useRef<HTMLDivElement>(null);
  const payfastFormRef = useRef<HTMLFormElement>(null);
  const { theme } = useTheme();
  const s = theme === 'stealth';

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

  const handlePayFastSubmit = async () => {
    setIsProcessing(true);

    const itemDescription = cart
      .map(item => `${product.name} (${item.size}) x${item.quantity}`)
      .join(', ');

    // Try server-side API route first (production), fall back to client-side (sandbox)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          amount: cartTotal,
          item_name: itemDescription,
          payment_id: orderNumber.current,
          items: cart.map(item => ({ size: item.size, quantity: item.quantity })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const { action_url, ...formFields } = data;
        setPayfastActionUrl(action_url as string);
        setPayfastFormData(formFields as Record<string, string>);
        requestAnimationFrame(() => payfastFormRef.current?.submit());
        return;
      }
    } catch {
      // API not available — fall back to client-side sandbox
    }

    // Fallback: client-side signature generation (sandbox mode)
    const pfData: Record<string, string> = {
      merchant_id: PAYFAST_SANDBOX_CONFIG.merchant_id,
      merchant_key: PAYFAST_SANDBOX_CONFIG.merchant_key,
      return_url: PAYFAST_SANDBOX_CONFIG.return_url,
      cancel_url: PAYFAST_SANDBOX_CONFIG.cancel_url,
      name_first: formData.name.split(' ')[0] || '',
      name_last: formData.name.split(' ').slice(1).join(' ') || '',
      email_address: formData.email,
      m_payment_id: orderNumber.current,
      amount: cartTotal.toFixed(2),
      item_name: itemDescription,
    };

    const sig = generatePayFastSignature(pfData, PAYFAST_SANDBOX_CONFIG.passphrase || undefined);
    setPayfastActionUrl(PAYFAST_SANDBOX_CONFIG.action_url);
    setPayfastFormData({ ...pfData, signature: sig });
    requestAnimationFrame(() => payfastFormRef.current?.submit());
  };

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

          <div className={cn("p-5 sm:p-8 text-center transition-colors duration-500", s ? "bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600" : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500")}>
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

          <div className="px-5 sm:px-8 py-2 bg-gray-800">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((st) => (
                <div key={st} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    st <= step ? (s ? "bg-gray-400 text-black" : "bg-purple-500 text-white") : "bg-gray-700 text-gray-500"
                  )}>
                    {st < step ? <Check className="w-4 h-4" /> : st}
                  </div>
                  {st < 3 && (
                    <div className={cn(
                      "w-12 h-1 mx-2 rounded transition-all",
                      st < step ? (s ? "bg-gray-400" : "bg-purple-500") : "bg-gray-700"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {/* Step 1: Contact Info + POPIA Consent */}
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
                  className={cn("w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors", s ? "focus:border-gray-400" : "focus:border-purple-500")}
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
                  className={cn("w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors", s ? "focus:border-gray-400" : "focus:border-purple-500")}
                  placeholder="John Doe"
                />
              </div>

              {/* POPIA-compliant consent checkboxes */}
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={consent.terms}
                    onChange={(e) => setConsent({ ...consent, terms: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
                    required
                  />
                  <span className="text-sm text-gray-400 group-hover:text-gray-300">
                    I agree to the{' '}
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-terms'))} className={cn("underline", s ? "text-gray-300" : "text-purple-400")}>
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-privacy'))} className={cn("underline", s ? "text-gray-300" : "text-purple-400")}>
                      Privacy Policy
                    </button>
                    . I consent to the processing of my personal information as described. <span className="text-red-400">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={consent.marketing}
                    onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
                  />
                  <span className="text-sm text-gray-400 group-hover:text-gray-300">
                    I would like to receive marketing emails about new products and exclusive offers. (Optional)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!consent.terms}
                className={cn(
                  "w-full py-4 font-bold rounded-xl transition-all",
                  consent.terms
                    ? (s ? "bg-white !text-black hover:bg-gray-100 hover:shadow-lg hover:shadow-white/10" : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:shadow-purple-500/25")
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                )}
              >
                Continue to Payment
                <ArrowRight className="w-5 h-5 inline-block ml-2" />
              </button>
            </motion.form>
          )}

          {/* Step 2: Order Summary + Payment */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              {/* Cart items */}
              <div className="space-y-3 mb-6">
                {cart.map((item) => (
                  <div key={item.size} className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="flex gap-4">
                      <img src={getCheckoutImage(currentImage)} alt={product.name} className="w-16 h-16 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm">{product.name}</h3>
                        <p className="text-gray-400 text-xs">Size: {item.size}</p>
                        <p className={cn("font-bold text-sm mt-1", s ? "text-gray-300" : "text-purple-400")}>
                          {formatZAR(product.price * item.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdateCart(item.size, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-white font-medium text-sm w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateCart(item.size, item.quantity + 1)}
                          disabled={item.quantity >= MAX_QTY_PER_SIZE || item.quantity >= (stock[item.size] || 0)}
                          className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemoveFromCart(item.size)}
                          className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-gray-600 transition-colors ml-1"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order total */}
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-2">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal ({cart.reduce((sum, i) => sum + i.quantity, 0)} item{cart.reduce((sum, i) => sum + i.quantity, 0) !== 1 ? 's' : ''})</span>
                  <span>{formatZAR(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-green-400">Free</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-white font-bold">
                  <span>Total</span>
                  <span>{formatZAR(cartTotal)}</span>
                </div>
              </div>

              <div className={cn("p-4 rounded-xl border text-center", s ? "bg-gray-500/10 border-gray-500/20" : "bg-purple-500/10 border-purple-500/20")}>
                <p className="text-gray-300 text-sm">
                  You'll be redirected to <span className={cn("font-semibold", s ? "text-white" : "text-purple-400")}>PayFast</span> to complete your payment securely.
                </p>
              </div>

              {/* Hidden PayFast form */}
              <form
                ref={payfastFormRef}
                action={payfastActionUrl || PAYFAST_SANDBOX_CONFIG.action_url}
                method="POST"
                className="hidden"
              >
                {payfastFormData && Object.entries(payfastFormData).map(([key, value]) => (
                  <input type="hidden" name={key} value={value} key={key} />
                ))}
              </form>

              <button
                type="button"
                onClick={handlePayFastSubmit}
                disabled={isProcessing || cart.length === 0}
                className={cn("w-full py-4 font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed", s ? "bg-white text-black hover:bg-gray-100 hover:shadow-white/10" : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-purple-500/25")}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Redirecting to PayFast...
                  </div>
                ) : (
                  <>
                    <Shield className="w-5 h-5 inline-block mr-2" />
                    Pay {formatZAR(cartTotal)} with PayFast
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full py-2 text-gray-400 hover:text-white transition-colors"
              >
                &larr; Back
              </button>
            </motion.div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className={cn("w-24 h-24 mx-auto rounded-full flex items-center justify-center", s ? "bg-white" : "bg-gradient-to-r from-green-500 to-emerald-500")}>
                <Check className={cn("w-12 h-12", s ? "text-black" : "text-white")} />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Order Confirmed!</h3>
                <p className="text-gray-400">Check your email for tracking information</p>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                <p className="text-sm text-gray-400">Order Number</p>
                <p className={cn("text-lg font-mono", s ? "text-white" : "text-purple-400")}>{orderNumber.current}</p>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                <Shield className="w-4 h-4" />
                <span>Protected by PayFast</span>
              </div>

              <button
                onClick={onClose}
                className={cn("w-full py-4 font-bold rounded-xl hover:shadow-lg transition-all", s ? "bg-white text-black hover:bg-gray-100 hover:shadow-white/10" : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-purple-500/25")}
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

// --- Newsletter ---
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
        'service_9hur70a',
        'template_z9lxoyg',
        {
          title: 'New Newsletter Subscriber',
          name: 'Newsletter Signup',
          message: `New newsletter subscriber: ${email}`,
          email: email,
        },
        'eCPPadAcoOTV9zYlk'
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
          className={cn("flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none transition-colors duration-500", s ? "focus:border-gray-400" : "focus:border-purple-500")}
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className={cn("px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 duration-500", s ? "bg-gray-600 hover:bg-gray-500" : "bg-purple-600 hover:bg-purple-700")}
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

      <a
        href="https://whatsapp.com/channel/0029Vb6wcCeLCoWwT54KMn01"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
          s
            ? "bg-gray-700 text-white hover:bg-gray-600"
            : "bg-green-600 text-white hover:bg-green-700"
        )}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Join WhatsApp Channel
      </a>
    </div>
  );
};

// --- Footer ---
const Footer = ({ onOpenPrivacy, onOpenTerms }: { onOpenPrivacy: () => void; onOpenTerms: () => void }) => {
  const { theme } = useTheme();
  const s = theme === 'stealth';
  const linkHover = s ? "hover:text-gray-200" : "hover:text-purple-400";

  return (
    <footer className="bg-black border-t border-gray-800 py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 mb-12">
          <div className="col-span-2 md:col-span-1 space-y-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-xl overflow-hidden">
              <img src="/media/bs-logo.png" alt="BABYSITTER logo" className="w-full h-full object-contain" />
            </div>
            <p className="text-gray-500 text-center text-sm uppercase tracking-wider">CHANGING THE WORLD ONE GARMENT AT A TIME.</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="#" className={cn(linkHover, "transition-colors")}>All Products</a></li>
              <li><a href="#" className={cn(linkHover, "transition-colors")}>New Arrivals</a></li>
              <li><a href="#" className={cn(linkHover, "transition-colors")}>Best Sellers</a></li>
              <li><a href="#" className={cn(linkHover, "transition-colors")}>Sale</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-500">
              <li><a href="/help" className={cn(linkHover, "transition-colors")}>FAQ</a></li>
              <li><a href="/help#shipping" className={cn(linkHover, "transition-colors")}>Shipping</a></li>
              <li><a href="/help#returns" className={cn(linkHover, "transition-colors")}>Returns</a></li>
              <li><a href="/help#contact" className={cn(linkHover, "transition-colors")}>Contact</a></li>
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

// --- Theme Toggle ---
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isStealth = theme === 'stealth';

  return (
    <motion.button
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.2 }}
      onClick={toggleTheme}
      className={cn(
        "fixed top-6 right-4 sm:right-8 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full backdrop-blur-lg border transition-all duration-500",
        isStealth
          ? "bg-gray-900/90 border-gray-600 hover:border-gray-400"
          : "bg-black/60 border-gray-700 hover:border-purple-500/50"
      )}
      aria-label="Toggle theme"
    >
      <div className={cn(
        "w-9 h-5 rounded-full relative transition-colors duration-500",
        isStealth ? "bg-gray-600" : "bg-gradient-to-r from-purple-600 to-pink-600"
      )}>
        <motion.div
          animate={{ x: isStealth ? 0 : 18 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "w-4 h-4 rounded-full absolute top-0.5 left-0.5",
            isStealth ? "bg-gray-300" : "bg-white"
          )}
        />
      </div>
      <span className={cn(
        "text-xs font-semibold uppercase tracking-wider hidden sm:block transition-colors duration-500",
        isStealth ? "text-gray-400" : "text-gray-300"
      )}>
        {isStealth ? 'Stealth' : 'Color'}
      </span>
    </motion.button>
  );
};

// --- Floating Cart ---
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
      className={cn(
        "fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl text-white shadow-2xl flex items-center justify-center transition-colors duration-500",
        s
          ? "bg-gray-800 border border-gray-600 shadow-black/40"
          : "bg-gradient-to-r from-purple-600 to-pink-600 shadow-purple-500/25"
      )}
    >
      <ShoppingBag className="w-6 h-6" />
      {count > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            "absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center",
            s ? "bg-white text-black" : "bg-orange-500 text-white"
          )}
        >
          {count}
        </motion.div>
      )}
    </motion.button>
  );
};

// --- Payment Return Banner ---
const PaymentReturnBanner = () => {
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success') setStatus('success');
    else if (payment === 'cancelled') setStatus('cancelled');

    if (payment) {
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  if (!status) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md"
      >
        <div className={cn(
          "p-4 rounded-2xl border shadow-2xl backdrop-blur-lg flex items-center gap-3",
          status === 'success'
            ? "bg-green-500/20 border-green-500/30 text-green-400"
            : "bg-orange-500/20 border-orange-500/30 text-orange-400"
        )}>
          {status === 'success' ? (
            <Check className="w-6 h-6 flex-shrink-0" />
          ) : (
            <X className="w-6 h-6 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">
              {status === 'success' ? 'Payment Successful!' : 'Payment Cancelled'}
            </p>
            <p className="text-xs opacity-75">
              {status === 'success'
                ? 'Your order has been placed. Check your email for confirmation.'
                : 'Your payment was cancelled. No charges were made.'}
            </p>
          </div>
          <button
            onClick={() => setStatus(null)}
            className="flex-shrink-0 p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- App ---
export default function App() {
  const [showCart, setShowCart] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [theme, setTheme] = useState<Theme>('color');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [stock, setStock] = useState<Record<string, number>>(DEFAULT_STOCK);

  // Fetch live stock levels from backend
  useEffect(() => {
    fetch('/api/stock')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setStock(data); })
      .catch(() => {});
  }, []);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const toggleTheme = () => setTheme(t => t === 'color' ? 'stealth' : 'color');
  const s = theme === 'stealth';

  // Derived cart values
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * PRODUCT.price, 0);

  // Listen for legal modal events from checkout
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
    if (!selectedSize) return;
    setCart(prev => {
      const existing = prev.find(item => item.size === selectedSize);
      if (existing) {
        if (existing.quantity >= MAX_QTY_PER_SIZE) return prev;
        if (existing.quantity >= (stock[selectedSize] || 0)) return prev;
        return prev.map(item =>
          item.size === selectedSize
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      const totalItems = prev.reduce((sum, item) => sum + item.quantity, 0);
      if (totalItems >= MAX_CART_ITEMS) return prev;
      return [...prev, { size: selectedSize, quantity: 1 }];
    });
    setShowCart(true);
  };

  const handleUpdateCart = (size: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.size !== size));
      return;
    }
    if (quantity > MAX_QTY_PER_SIZE) return;
    if (quantity > (stock[size] || 0)) return;
    setCart(prev => prev.map(item =>
      item.size === size ? { ...item, quantity } : item
    ));
  };

  const handleRemoveFromCart = (size: string) => {
    setCart(prev => prev.filter(item => item.size !== size));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="bg-black min-h-screen">
        <PaymentReturnBanner />

        <motion.div
          className={cn(
            "fixed top-0 left-0 right-0 h-1 z-50 origin-left transition-colors duration-500",
            s
              ? "bg-gradient-to-r from-gray-600 via-gray-500 to-gray-400"
              : "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"
          )}
          style={{ scaleX }}
        />

        <VideoSection />
        <ProductSection
          selectedSize={selectedSize}
          setSelectedSize={setSelectedSize}
          onAddToCart={handleAddToCart}
          currentImage={currentImage}
          setCurrentImage={setCurrentImage}
          cart={cart}
          stock={stock}
        />
        <Footer onOpenPrivacy={() => setShowPrivacy(true)} onOpenTerms={() => setShowTerms(true)} />

        <ThemeToggle />
        <FloatingCart onClick={() => setShowCart(true)} count={cartCount} />

        <AnimatePresence>
          {showCart && cart.length > 0 && (
            <CheckoutModal
              product={PRODUCT}
              cart={cart}
              cartTotal={cartTotal}
              onClose={() => setShowCart(false)}
              onUpdateCart={handleUpdateCart}
              onRemoveFromCart={handleRemoveFromCart}
              currentImage={currentImage}
              stock={stock}
            />
          )}
        </AnimatePresence>

        <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
        <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      </div>
    </ThemeContext.Provider>
  );
}
