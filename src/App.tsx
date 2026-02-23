import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Play, Pause, ChevronDown, ShoppingBag, X, Check, ArrowRight, Shield, Send, Volume2, VolumeX } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { useInView } from 'react-intersection-observer';
import { cn } from './utils/cn';

const PRODUCT = {
  name: "BABYSITTER™",
  price: 249,
  description: "Premium streetwear crafted for everyday confidence. Featuring tailored fits, breathable fabrics, and timeless style for any occasion.",
  video: "/media/promovid.MP4",
  images: [
    "/media/boygirl.jpeg",
    "/media/boy.jpeg",
    "/media/pinkracer.jpeg",
    "/media/girl.jpeg",
    "/media/greenracer.jpeg"
  ],
  sizes: ["XS", "S", "M", "L", "XL", "XXL"],
};

// --- Fix #1: Video play/pause now calls .play()/.pause() on the element ---
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
        {/* Fix #9d: Added aria-label for video accessibility */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Promotional video showcasing BABYSITTER clothing and accessories"
          className="w-full h-full object-cover opacity-90"
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
      className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black py-12 sm:py-20 px-4 sm:px-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
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
                <div className="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full text-white font-bold text-sm">
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
                    currentImage === idx ? "border-purple-500" : "border-transparent opacity-50 hover:opacity-100"
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
                <span className="text-purple-400 font-medium uppercase tracking-widest text-sm">
                  Limited Edition
                </span>
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mt-2 leading-tight">
                  {PRODUCT.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4">
                  <span className="text-3xl sm:text-4xl font-bold text-white">R{PRODUCT.price}</span>
                  <span className="text-lg sm:text-xl text-gray-500 line-through">R450</span>
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
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// PayFast configuration
// ──────────────────────────────────────────────────────────────────────
// HOW TO SET UP PAYFAST:
//
// 1. Create a PayFast account at https://www.payfast.co.za
// 2. Go to Settings → Integration to get your merchant_id and merchant_key
// 3. For testing, use the sandbox credentials below (already set):
//      merchant_id:  10000100
//      merchant_key: 46f0cd694581a
//      passphrase:   (leave empty for sandbox)
// 4. Set action_url to sandbox for testing:
//      https://sandbox.payfast.co.za/eng/process
// 5. For PRODUCTION, update:
//      merchant_id  → your real Merchant ID from PayFast dashboard
//      merchant_key → your real Merchant Key
//      passphrase   → your passphrase from Settings → Integration
//      action_url   → https://www.payfast.co.za/eng/process
// 6. notify_url (ITN): When you have a backend server, set this to
//    your server endpoint (e.g. https://yourdomain.co.za/api/payfast/notify)
//    PayFast sends POST requests here to confirm payment status.
//    Without this, you rely on the return_url redirect only.
//
// FLOW: Customer fills in details → clicks Pay → redirected to PayFast →
//       pays via card/EFT/SnapScan → redirected back to return_url or cancel_url
// ──────────────────────────────────────────────────────────────────────
const PAYFAST_CONFIG = {
  merchant_id: '10000100',
  merchant_key: '46f0cd694581a',
  passphrase: '',  // Set your passphrase for production (Settings → Integration)
  action_url: 'https://sandbox.payfast.co.za/eng/process',
  return_url: `${window.location.origin}${window.location.pathname}?payment=success`,
  cancel_url: `${window.location.origin}${window.location.pathname}?payment=cancelled`,
  notify_url: '',
};

// Generate PayFast MD5 signature (required for production)
const generatePayFastSignature = (data: Record<string, string>, passphrase?: string): string => {
  const params = Object.entries(data)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const signatureString = passphrase ? `${params}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : params;
  // MD5 hash — using SubtleCrypto would be async; for simplicity, we use a
  // lightweight MD5 implementation inline. In production, consider a server-side
  // signature generation for security.
  return md5(signatureString);
};

// Lightweight MD5 implementation for PayFast signature
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
  const [signature, setSignature] = useState('');
  const orderNumber = useRef(`BS-${Math.random().toString(36).substr(2, 8).toUpperCase()}`);
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

    // Build the PayFast parameter object in the exact order PayFast expects
    const pfData: Record<string, string> = {
      merchant_id: PAYFAST_CONFIG.merchant_id,
      merchant_key: PAYFAST_CONFIG.merchant_key,
      return_url: PAYFAST_CONFIG.return_url,
      cancel_url: PAYFAST_CONFIG.cancel_url,
      ...(PAYFAST_CONFIG.notify_url ? { notify_url: PAYFAST_CONFIG.notify_url } : {}),
      name_first: formData.name.split(' ')[0] || '',
      name_last: formData.name.split(' ').slice(1).join(' ') || '',
      email_address: formData.email,
      m_payment_id: orderNumber.current,
      amount: product.price.toFixed(2),
      item_name: `${product.name} - Size ${size}`,
    };

    // Generate and set the signature, then submit on next render
    const sig = generatePayFastSignature(pfData, PAYFAST_CONFIG.passphrase || undefined);
    setSignature(sig);

    // Use requestAnimationFrame to ensure the signature input is rendered before submit
    requestAnimationFrame(() => {
      payfastFormRef.current?.submit();
    });
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

          <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-5 sm:p-8 text-center">
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

        <div className="p-5 sm:p-8">
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
                {signature && <input type="hidden" name="signature" value={signature} />}
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
    <footer className="bg-black border-t border-gray-800 py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 mb-12">
          <div className="col-span-2 md:col-span-1 space-y-4">
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

          <div className="col-span-2 md:col-span-1">
            <Newsletter />
          </div>
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
      className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-2xl shadow-purple-500/25 flex items-center justify-center"
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
// Detect PayFast return URL params
const PaymentReturnBanner = () => {
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success') setStatus('success');
    else if (payment === 'cancelled') setStatus('cancelled');

    // Clean up URL params after reading
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
      <PaymentReturnBanner />

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
