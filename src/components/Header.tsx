import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { Menu, X, Pencil } from "lucide-react";

/** Full marketing nav — shown only to guests */
const publicNavItems = [
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/blog", label: "Blog" },
  { to: "/pricing", label: "Pricing" },
  { to: "/languages", label: "Languages" },
  { to: "/contact", label: "Contact" },
];

/** Minimal nav — shown to authenticated users on every page (matches dashboard header) */
const authNavItems = [
  { to: "/pricing", label: "Pricing" },
  { to: "/blog", label: "Blog" },
];

const Header = () => {
  // Initialize auth synchronously from the cached Firebase user so navigating
  // from the dashboard to Pricing/Blog never flashes the guest nav.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const a = getFirebaseAuth();
    return !!a?.currentUser;
  });
  const [userName, setUserName] = useState<string>(() => {
    const a = getFirebaseAuth();
    return (a?.currentUser as any)?.displayName || "";
  });
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
          ? "bg-white/95 backdrop-blur-xl border-b border-gray-200/70 shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]"
          : "bg-white/90 backdrop-blur-md border-b border-gray-100"
      }`}
    >
      {/* DS container: max 1280px, 32px desktop / 24px tablet / 16px mobile */}
      <div className="ds-container">
        <div className="flex items-center justify-between h-[72px]">

          {/* Logo — brand-logo class: 36px mobile, 40px sm+ */}
          <Link to="/" className="flex items-center flex-shrink-0">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="brand-logo"
              loading="eager"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {isAuthenticated ? (
              /* Authenticated: compact nav matching the dashboard header */
              <>
                <Button
                  size="sm"
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-[8px] px-4 gap-1.5"
                  onClick={() => navigate("/")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  New Doc
                </Button>
                {authNavItems.map(({ to, label }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`px-3 py-2 text-[14px] font-medium rounded-[8px] transition-all duration-150 ${
                        active ? "text-gray-900 bg-gray-100" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </>
            ) : (
              /* Guest: full marketing nav */
              publicNavItems.map(({ to, label }) => {
                const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`px-3 py-2 text-[14px] font-medium rounded-[8px] transition-all duration-150 ${
                      active ? "text-gray-900 bg-gray-100" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })
            )}
          </nav>

          {/* Desktop CTAs / avatar */}
          <div className="hidden lg:flex items-center gap-2">
            {!isAuthenticated ? (
              <>
                <Link to="/auth">
                  <Button variant="ghost" size="sm" className="h-11 px-4 text-[14px] font-medium text-gray-600">
                    Log in
                  </Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button size="sm" className="h-11 px-5 text-[14px] font-semibold rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    Get Started Free
                  </Button>
                </Link>
              </>
            ) : (
              /* Avatar chip — consistent with dashboard header's right zone */
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center text-[13px] font-bold">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[14px] font-medium text-gray-600 hidden md:block group-hover:text-blue-600 transition-colors truncate max-w-[110px]">
                  {userName}
                </span>
              </button>
            )}
          </div>

          {/* Hamburger — tablet/mobile only */}
          <button
            className="lg:hidden p-2 rounded-[8px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            onClick={() => setIsMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile/tablet dropdown menu */}
      <div
        className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          isMobileOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-gray-100 bg-white px-4 pt-3 pb-5 space-y-1">
          {(isAuthenticated ? authNavItems : publicNavItems).map(({ to, label }) => {
            const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`block px-4 py-3 rounded-[10px] text-[14px] font-medium transition-colors ${
                  active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2 mt-2">
            {!isAuthenticated ? (
              <>
                <Link to="/auth" className="w-full">
                  <Button variant="outline" className="w-full h-12 text-[14px] font-medium rounded-[10px]">
                    Log in
                  </Button>
                </Link>
                <Link to="/auth?mode=register" className="w-full">
                  <Button className="w-full h-12 text-[14px] font-semibold rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white">
                    Get Started Free
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/editor" className="w-full">
                  <Button className="w-full h-12 text-[14px] font-semibold rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white">
                    New Doc
                  </Button>
                </Link>
                <Link to="/" className="w-full">
                  <Button variant="outline" className="w-full h-12 text-[14px] font-medium rounded-[10px]">
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full h-11 text-[14px] text-gray-600" onClick={handleSignOut}>
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
