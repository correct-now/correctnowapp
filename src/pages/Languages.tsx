import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Globe, ArrowRight, Languages as LanguagesIcon } from "lucide-react";

const Languages = () => {
  const [rawText, setRawText] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/languages.txt");
        const text = await res.text();
        setRawText(text || "");
      } catch {
        setRawText("");
      }
    };
    load();
  }, []);

  const languages = useMemo(() => {
    const tokens = rawText
      .split(/\n|,/)
      .map((item) => item.replace(/^[^A-Za-z0-9]+/g, "").trim())
      .map((item) => item.replace(/\.$/, "").trim())
      .filter((item) => item && !/(spoken languages|major global|indian & south asian|east & southeast asian|middle eastern|european|african|americas|pacific & australian)/i.test(item));

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of tokens) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [rawText]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-white via-blue-50/30 to-indigo-50/20 py-14 md:py-20">
          <div className="pointer-events-none absolute -top-24 -left-24 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-blue-200/40 via-indigo-200/30 to-violet-200/20 blur-3xl" />
          <div className="container max-w-4xl relative">
            <div className="flex flex-col items-center text-center gap-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
                <Globe className="w-3.5 h-3.5" />
                Language Support
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-foreground tracking-tight">
                Grammar checking in{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">100+ languages</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-3xl">
                CorrectNow supports English, Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Gujarati, Bengali, Arabic, Chinese, Spanish, French, German, Portuguese, Japanese, Korean, and many more.
              </p>
              <Link
                to="/editor"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
              >
                Try in your language
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8 shadow-sm">
            <div className="flex flex-wrap gap-2 md:gap-3">
              {languages.map((language) => (
                <span
                  key={language}
                  className="px-3 py-1.5 rounded-full border border-border bg-secondary/40 text-sm text-foreground hover:bg-accent/10 transition-colors"
                >
                  {language}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Proofread essays, emails, and documents in 100+ languages.
          </div>

          {/* CTA Banner */}
          <div className="mt-10 relative overflow-hidden rounded-2xl py-10 px-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl" />
            <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <h3 className="text-xl md:text-2xl font-extrabold text-white mb-2">
                Ready to check your writing?
              </h3>
              <p className="text-white/75 mb-6 text-sm md:text-base">
                Start proofreading in any of our 100+ supported languages — for free.
              </p>
              <Link
                to="/editor"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-blue-700 shadow-lg hover:bg-blue-50 transition-colors"
              >
                Start writing now
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Languages;
