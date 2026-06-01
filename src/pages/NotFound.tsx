import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search, Sparkles, FileQuestion } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const popularLinks = [
  { label: "Editor", to: "/editor", desc: "Check your text now" },
  { label: "Pricing", to: "/pricing", desc: "Plans & billing" },
  { label: "Features", to: "/features", desc: "What CorrectNow can do" },
  { label: "Contact", to: "/contact", desc: "Get in touch" },
];

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404: route not found ->", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      <main className="flex-1 relative overflow-hidden">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-blue-100/60 via-indigo-200/40 to-violet-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-emerald-100/40 via-blue-100/40 to-indigo-200/40 blur-3xl" />

        <div className="relative container max-w-4xl mx-auto px-4 py-20 md:py-28">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700 mb-7">
              <FileQuestion className="w-3.5 h-3.5" />
              Page not found
            </div>

            {/* Big 404 */}
            <h1 className="text-[7rem] sm:text-[9rem] md:text-[11rem] font-extrabold leading-none tracking-tighter bg-gradient-to-br from-gray-900 via-gray-700 to-gray-400 bg-clip-text text-transparent select-none">
              404
            </h1>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mt-2 mb-4">
              We couldn't find that page
            </h2>

            <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto mb-3 leading-relaxed">
              The page you're looking for may have been moved, renamed, or never existed.
            </p>
            {location.pathname && (
              <p className="text-xs text-gray-400 font-mono mb-9 break-all">
                {location.pathname}
              </p>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
              <Button
                className="group rounded-full bg-gradient-to-r from-gray-900 to-gray-700 text-white px-7 py-5 text-base font-semibold hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all w-full sm:w-auto"
                onClick={() => navigate("/")}
              >
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-gray-300 text-gray-700 px-7 py-5 text-base font-semibold hover:bg-gray-100 hover:text-gray-800 hover:border-gray-400 transition-all w-full sm:w-auto"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </div>

            {/* Popular destinations */}
            <div className="max-w-2xl mx-auto">
              <p className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
                <Sparkles className="w-3.5 h-3.5" />
                Popular destinations
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {popularLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-primary hover:bg-primary/5 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <Search className="w-4 h-4 text-gray-500 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">
                        {l.label}
                      </p>
                      <p className="text-xs text-gray-500">{l.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
