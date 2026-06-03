import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { Menu, X } from "lucide-react";

const navItems = [
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/blog", label: "Blog" },
  { to: "/pricing", label: "Pricing" },
  { to: "/languages", label: "Languages" },
  { to: "/contact", label: "Contact" },
];

const Header = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const db = getFirebaseDb();
    const unsub = onAuthStateChanged(auth, async (current) => {
      setIsAuthenticated(Boolean(current));
      if (!current) { setUserName(""); return; }
      setUserName(current.displayName || "User");
      if (db) {
        const ref = firestoreDoc(db, `users/${current.uid}`);
        onSnapshot(ref, () => {});
      }
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
    navigate("/");
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-xl border-b border-gray-200/80 shadow-sm"
          : "bg-white/80 backdrop-blur-md border-b border-gray-100"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center flex-shrink-0">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="h-9 sm:h-10 w-auto object-contain"
              loading="eager"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label }) => {
              const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    active
                      ? "text-gray-900 bg-gray-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2.5">
            {!isAuthenticated ? (
              <>
                <Link to="/auth">
                  <Button variant="ghost" size="sm" className="h-9 px-4 text-sm font-medium text-gray-700">
                    Log in
                  </Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button size="sm" className="h-9 px-4 text-sm font-semibold rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20">
                    Get Started Free
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/">
                <Button size="sm" className="h-9 px-4 text-sm font-semibold rounded-full bg-primary hover:bg-primary/90 text-white">
                  Dashboard
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            onClick={() => setIsMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          isMobileOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-gray-100 bg-white/98 backdrop-blur-xl px-4 pt-3 pb-5 space-y-1">
          {navItems.map(({ to, label }) => {
            const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="pt-3 flex flex-col gap-2.5">
            {!isAuthenticated ? (
              <>
                <Link to="/auth" className="w-full">
                  <Button variant="outline" className="w-full h-11 text-sm font-medium rounded-xl">
                    Log in
                  </Button>
                </Link>
                <Link to="/auth?mode=register" className="w-full">
                  <Button className="w-full h-11 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                    Get Started Free
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/" className="w-full">
                  <Button className="w-full h-11 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white">
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full h-11 text-sm text-gray-600" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
