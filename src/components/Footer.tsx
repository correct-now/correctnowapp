import { Link } from "react-router-dom";
import { Mail, Twitter, Linkedin, Github, Globe, ShieldCheck, Sparkles } from "lucide-react";

const productLinks = [
  { label: "Features", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Languages", to: "/languages" },
  { label: "Editor", to: "/editor" },
];

const companyLinks = [
  { label: "About Us", to: "/about" },
  { label: "Blog", to: "/blog" },
  { label: "Contact", to: "/contact" },
];

const resourceLinks = [
  { label: "Chrome Extension", to: "/features" },
  { label: "Help Center", to: "/contact" },
  { label: "Status", to: "/" },
];

const legalLinks = [
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Refund Policy", to: "/refund-policy" },
  { label: "Disclaimer", to: "/disclaimer" },
];

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-gray-200 bg-gradient-to-b from-white to-gray-50">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-14 md:py-16">
        {/* Top grid: brand + 4 link columns */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-10">
          {/* Brand block — spans 2 cols on md+ */}
          <div className="col-span-2 md:col-span-2">
            <Link to="/" aria-label="CorrectNow home" className="inline-block mb-4">
              <img
                src="/Icon/correctnow logo final2.png"
                alt="CorrectNow"
                className="brand-logo"
                loading="lazy"
              />
            </Link>
            <p className="text-sm text-gray-600 leading-relaxed max-w-xs mb-5">
              AI-powered grammar checker and proofreader for 50+ languages. Write with confidence everywhere.
            </p>
            <a
              href="mailto:info@correctnow.app"
              className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-primary transition-colors mb-5"
            >
              <Mail className="w-4 h-4" />
              info@correctnow.app
            </a>

            {/* Social */}
            <div className="flex items-center gap-2">
              {[
                { Icon: Twitter, href: "https://twitter.com", label: "Twitter" },
                { Icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
                { Icon: Github, href: "https://github.com", label: "GitHub" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-2.5">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-gray-600 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2.5">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-gray-600 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4">Resources</h4>
            <ul className="space-y-2.5">
              {resourceLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-gray-600 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {legalLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-gray-600 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-12 pt-8 border-t border-gray-200/80 grid sm:grid-cols-3 gap-5 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Private & secure — your text is never stored</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            <span>50+ languages supported globally</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span>Powered by advanced AI</span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-gray-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p>© {year} CorrectNow. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span>Made with care for writers worldwide</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
