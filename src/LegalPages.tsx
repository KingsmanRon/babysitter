import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal = ({ isOpen, onClose }: LegalModalProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Privacy Policy</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-gray-300 text-sm leading-relaxed">
            <p className="text-gray-400">Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">1. Introduction</h3>
              <p>
                BABYSITTER™ ("we", "us", or "our") is committed to protecting your personal information in compliance with the
                Protection of Personal Information Act 4 of 2013 (POPIA) and all applicable South African data protection legislation.
                This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website and services.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">2. Information We Collect</h3>
              <p>We collect the following personal information when you make a purchase or interact with our site:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li>Full name and email address (provided during checkout)</li>
                <li>Payment information (processed securely by PayFast — we do not store card details)</li>
                <li>Order details (items purchased, sizes, order numbers)</li>
                <li>Device and browser information (for site performance and security)</li>
                <li>Email address (if you subscribe to our newsletter)</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">3. Purpose of Processing</h3>
              <p>We process your personal information for the following purposes:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li>To process and fulfil your orders</li>
                <li>To communicate order confirmations and shipping updates</li>
                <li>To send marketing communications (only with your explicit consent)</li>
                <li>To improve our website and services</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">4. Third-Party Service Providers</h3>
              <p>We share your personal information with the following trusted third parties, solely for the purposes outlined above:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li><strong className="text-gray-200">PayFast</strong> — for secure payment processing (PCI DSS compliant)</li>
                <li><strong className="text-gray-200">Vercel</strong> — for website hosting and content delivery</li>
                <li><strong className="text-gray-200">EmailJS</strong> — for transactional email delivery</li>
              </ul>
              <p className="mt-2">We do not sell, rent, or trade your personal information to any other third parties.</p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">5. Your Rights Under POPIA</h3>
              <p>As a data subject, you have the right to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li>Request access to the personal information we hold about you</li>
                <li>Request correction or deletion of your personal information</li>
                <li>Object to the processing of your personal information</li>
                <li>Withdraw consent for marketing communications at any time</li>
                <li>Lodge a complaint with the Information Regulator</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">6. Data Retention</h3>
              <p>
                We retain your personal information only for as long as necessary to fulfil the purposes for which it was collected,
                or as required by law. Order records are retained for a minimum of 5 years for tax and legal compliance.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">7. Security</h3>
              <p>
                We implement appropriate technical and organisational measures to protect your personal information against
                unauthorised access, alteration, disclosure, or destruction. All payment transactions are processed through
                PayFast's PCI DSS compliant infrastructure with 3D Secure authentication.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">8. Cookies</h3>
              <p>
                Our website uses essential cookies to ensure proper functionality. We do not use tracking cookies or third-party
                advertising cookies. By using our website, you consent to the use of essential cookies.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">9. Information Officer</h3>
              <p>
                For any queries regarding this Privacy Policy or to exercise your rights under POPIA, please contact our Information Officer:
              </p>
              <p className="mt-2 text-gray-400">
                Email: <a href="mailto:babysitterbs9@gmail.com" className="text-purple-400 hover:text-purple-300 underline">babysitterbs9@gmail.com</a>
              </p>
              <p className="mt-1 text-gray-500 text-xs">
                You may also lodge a complaint with the Information Regulator at: <a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer" className="underline">inforegulator.org.za</a>
              </p>
            </section>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export const TermsOfServiceModal = ({ isOpen, onClose }: LegalModalProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Terms of Service</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-gray-300 text-sm leading-relaxed">
            <p className="text-gray-400">Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">1. General</h3>
              <p>
                These Terms of Service govern your use of the BABYSITTER™ website and the purchase of products from our online store.
                By placing an order, you agree to be bound by these terms. BABYSITTER™ is a South African registered business.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">2. Products & Pricing</h3>
              <p>
                All prices are displayed in South African Rand (ZAR) and include VAT where applicable. We reserve the right to
                change prices at any time without prior notice. Prices are confirmed at the time of order placement.
              </p>
              <p className="mt-2">
                Product images are for illustration purposes. While we strive for accuracy, slight variations in colour may occur
                due to screen settings.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">3. Orders & Payment</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>All payments are processed securely through PayFast, a registered South African payment gateway.</li>
                <li>We accept credit cards, debit cards, EFT, and SnapScan via PayFast.</li>
                <li>An order is confirmed only after successful payment. You will receive a confirmation email with your order number.</li>
                <li>We reserve the right to cancel any order if fraud is suspected.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">4. Shipping & Delivery</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>We offer free standard shipping within South Africa on all orders.</li>
                <li>Delivery times are estimated at 5–10 business days depending on your location.</li>
                <li>We are not liable for delays caused by the courier service or circumstances beyond our control.</li>
                <li>Risk of loss passes to the buyer upon delivery to the shipping address provided.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">5. Returns & Refunds</h3>
              <p>In accordance with the Consumer Protection Act 68 of 2008 (CPA):</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li>You may return goods within 7 days of delivery if they are defective, damaged, or not as described.</li>
                <li>Items must be unworn, unwashed, and in their original packaging with all tags attached.</li>
                <li>Refunds will be processed within 14 business days of receiving the returned item.</li>
                <li>Return shipping costs are the responsibility of the buyer unless the item is defective.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">6. Intellectual Property</h3>
              <p>
                All content on this website — including logos, images, text, designs, and trademarks — is the property of
                BABYSITTER™ and is protected under South African intellectual property law. Unauthorised reproduction,
                distribution, or use of any content is prohibited.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">7. Limitation of Liability</h3>
              <p>
                To the maximum extent permitted by South African law, BABYSITTER™ shall not be liable for any indirect,
                incidental, or consequential damages arising from the use of our website or the purchase of our products.
                Our total liability shall not exceed the purchase price of the product(s) in question.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">8. Governing Law</h3>
              <p>
                These Terms of Service are governed by the laws of the Republic of South Africa. Any disputes shall be
                subject to the exclusive jurisdiction of the South African courts.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-base mb-2">9. Contact</h3>
              <p>
                For any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mt-2 text-gray-400">
                Email: <a href="mailto:babysitterbs9@gmail.com" className="text-purple-400 hover:text-purple-300 underline">babysitterbs9@gmail.com</a>
              </p>
            </section>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
