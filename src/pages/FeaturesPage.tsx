import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap, Globe, Shield, Brain, Clock, FileCheck,
  CheckCircle2, ArrowRight, Sparkles, Type, Eye, MessageSquare,
} from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Paste or type your text",
    desc: "Open the editor and paste any text — an email, essay, social post, or document. Supports 50+ languages.",
    color: "bg-blue-500",
  },
  {
    number: "02",
    title: "AI checks it instantly",
    desc: "Our AI engine scans for grammar, spelling, punctuation, and style issues in seconds — context-aware, not just spell-check.",
    color: "bg-violet-500",
  },
  {
    number: "03",
    title: "Review & apply corrections",
    desc: "Each correction includes an explanation. Accept all changes or cherry-pick exactly what you want to keep.",
    color: "bg-emerald-500",
  },
];

const features = [
  { icon: Zap,         title: "Lightning Fast",          desc: "Results in seconds. Our streaming AI delivers corrections as fast as you type.", bg: "bg-amber-500" },
  { icon: Globe,       title: "50+ Languages",            desc: "Hindi, Tamil, Arabic, Spanish, French, German and 45+ more languages supported natively.", bg: "bg-blue-500" },
  { icon: Shield,      title: "Preserves Your Voice",     desc: "We fix errors without rewriting. Your original meaning and tone stay intact.", bg: "bg-violet-500" },
  { icon: Brain,       title: "Context-Aware AI",         desc: "Goes beyond spell-check — understands sentence structure, idioms, and context.", bg: "bg-rose-500" },
  { icon: Clock,       title: "Real-time Streaming",      desc: "See corrections appear live as the AI processes your text, no waiting.", bg: "bg-cyan-500" },
  { icon: FileCheck,   title: "Detailed Explanations",    desc: "Learn why each correction was made with clear, plain-English explanations.", bg: "bg-emerald-500" },
  { icon: Type,        title: "Document Editor",          desc: "A full-featured editor with formatting support — not just a text box.", bg: "bg-orange-500" },
  { icon: Eye,         title: "Side-by-Side View",        desc: "Compare original and corrected text side by side before accepting changes.", bg: "bg-indigo-500" },
  { icon: MessageSquare, title: "Change Log",             desc: "Every session shows a complete log of what was changed and why.", bg: "bg-pink-500" },
];

const FeaturesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-white py-20 md:py-28">
          <div className="pointer-events-none absolute right-0 top-0 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-blue-100/60 via-indigo-200/40 to-violet-200/50 blur-sm translate-x-1/3 -translate-y-1/4" />
          <div className="container relative text-center max-w-3xl mx-auto px-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-6">
              <Sparkles className="w-3.5 h-3.5" /> How CorrectNow Works
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold text-gray-900 leading-[1.1] tracking-tight mb-5">
              AI Grammar Checking,<br />
              <span className="text-primary">Made Effortless</span>
            </h1>
            <p className="text-gray-500 text-lg leading-relaxed mb-8">
              Three simple steps to flawless writing — in any language, on any device.
            </p>
            <Button
              className="group rounded-full bg-gradient-to-r from-gray-900 to-gray-700 text-white px-8 py-5 text-base font-semibold hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
              onClick={() => navigate("/editor")}
            >
              Try It Free — No Sign-up
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </section>

        {/* ── 3 Steps ── */}
        <section className="bg-gray-50 py-16 md:py-24">
          <div className="container px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">Three steps to perfect writing</h2>
              <p className="text-gray-500 text-lg">Simple, fast, and accurate every time.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
              {steps.map((step) => (
                <div key={step.number} className="flex flex-col items-center text-center">
                  <div className={`w-14 h-14 rounded-2xl ${step.color} flex items-center justify-center mb-5 shadow-lg`}>
                    <span className="text-white font-extrabold text-lg">{step.number}</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Grid ── */}
        <section className="bg-white py-16 md:py-24">
          <div className="container px-4">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600 mb-5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Everything you need
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">Why choose CorrectNow?</h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto">Built for speed, accuracy, and simplicity. Perfect your writing without changing your style.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {features.map(({ icon: Icon, title, desc, bg }) => (
                <Card key={title} className="border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                  <CardContent className="p-6">
                    <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center mb-4`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1.5">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="bg-gray-50 py-16 md:py-20">
          <div className="container px-4">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-8 md:p-14 text-center text-white relative overflow-hidden max-w-4xl mx-auto">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
              <div className="relative">
                <h3 className="text-2xl md:text-3xl font-extrabold mb-3">Ready to write flawlessly?</h3>
                <p className="text-white/80 mb-7 max-w-lg mx-auto">Join thousands of writers, students, and professionals who trust CorrectNow.</p>
                <Button
                  size="lg"
                  className="group rounded-full bg-white text-primary px-8 py-5 text-base font-bold shadow-lg hover:shadow-xl hover:bg-white/95 hover:-translate-y-0.5 transition-all"
                  onClick={() => navigate("/editor")}
                >
                  Get Started — Free
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
};

export default FeaturesPage;
