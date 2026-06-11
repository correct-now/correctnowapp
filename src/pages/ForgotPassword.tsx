import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Mail, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Header from "@/components/Header";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-detect API base URL: use env var in development, empty string (relative URLs) in production
  const apiBase = import.meta.env.DEV 
    ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:8787")
    : ""; // In production, use relative URLs (same domain)
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch(`${apiBase}/api/auth/send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, continueUrl: window.location.origin }),
      }).catch(() => {});
      // Always show the same confirmation regardless of whether the email is
      // registered — never reveal account existence (anti-enumeration).
      setIsSubmitted(true);
      toast.success("If an account exists for that email, a reset link is on its way.");
    } catch {
      setIsSubmitted(true);
      toast.success("If an account exists for that email, a reset link is on its way.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 flex flex-col">
      <Header />

      {/* Decorative orbs */}
      <div className="pointer-events-none fixed -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-blue-200/40 via-indigo-200/30 to-violet-200/30 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -right-32 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-emerald-100/40 via-blue-100/30 to-indigo-200/30 blur-3xl" />

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
      <div className="relative w-full max-w-md">

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-blue-500/5 p-7 sm:p-8">
          <div className="text-center mb-6">
            {!isSubmitted ? (
              <>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  Forgot your password?
                </h2>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                  No worries — enter your email and we'll send reset instructions.
                </p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  Check your email
                </h2>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                  We sent a password reset link to{" "}
                  <span className="text-gray-900 font-semibold">{email}</span>
                </p>
              </>
            )}
          </div>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="accent"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                "Reset password"
              )}
            </Button>

            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </form>
        ) : (
          <div className="space-y-4">
            <Button
              variant="accent"
              className="w-full"
              onClick={() => window.open("mailto:", "_blank")}
            >
              Open email app
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the email?{" "}
              <button
                onClick={() => setIsSubmitted(false)}
                className="text-accent hover:underline"
              >
                Click to resend
              </button>
            </p>

            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        )}
        </div>{/* close card */}
      </div>{/* close max-w-md */}
      </div>{/* close flex-1 centering wrapper */}
    </div>
  );
};

export default ForgotPassword;
