import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProofreadingEditor from "@/components/ProofreadingEditor";
import { LANGUAGE_OPTIONS } from "@/components/LanguageSelector";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "sonner";

interface SEOPageData {
  urlSlug: string;
  languageCode: string;
  languageName: string;
  title: string;
  metaDescription: string;
  keywords: string;
  h1: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const LanguageLanding = () => {
  const { languageCode } = useParams<{ languageCode: string }>();
  const editorRef = useRef<HTMLDivElement>(null);
  const [seoData, setSeoData] = useState<SEOPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const languageInfo = useMemo(() => {
    return LANGUAGE_OPTIONS.find((lang) => lang.code === languageCode);
  }, [languageCode]);

  useEffect(() => {
    const loadSEOData = async () => {
      if (!languageCode) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const db = getFirebaseDb();
      if (!db) {
        setLoading(false);
        return;
      }

      try {
        // Query for page with matching urlSlug
        const q = query(
          collection(db, "seoPages"),
          where("urlSlug", "==", languageCode),
          where("active", "==", true)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const pageData = querySnapshot.docs[0].data() as SEOPageData;
          setSeoData(pageData);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error("Error loading SEO page data:", error);
        toast.error("Failed to load page data");
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadSEOData();
  }, [languageCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !languageInfo) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The language page you're looking for doesn't exist or hasn't been activated yet.
            </p>
            <Link
              to="/"
              className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Homepage
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const defaultTitle = `${languageInfo.name} Grammar Checker - CorrectNow`;
  const defaultDescription = `Free online ${languageInfo.name} grammar checker and proofreading tool. Check your ${languageInfo.name} text for spelling, grammar, and style mistakes instantly.`;
  const defaultKeywords = `${languageInfo.name} grammar checker, ${languageInfo.name} spell check, ${languageInfo.name} proofreading, online grammar check, ${languageCode} grammar`;

  const pageTitle = seoData?.title || defaultTitle;
  const metaDescription = seoData?.metaDescription || defaultDescription;
  const keywords = seoData?.keywords || defaultKeywords;
  const h1Text = seoData?.h1 || `${languageInfo.name} Grammar Checker`;
  const descriptionText = seoData?.description || defaultDescription;

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={keywords} />
        
        {/* Open Graph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://correctnow.app/${languageCode}`} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        
        {/* Canonical URL */}
        <link rel="canonical" href={`https://correctnow.app/${languageCode}`} />
        
        {/* Language */}
        <html lang={languageCode === "auto" ? "en" : languageCode} />
      </Helmet>

      <Header />

      <main className="flex-1">
        {/* SEO Content Section */}
        <section className="bg-gradient-to-b from-background to-muted/20 py-8 sm:py-12">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              {h1Text}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {descriptionText}
            </p>
          </div>
        </section>

        {/* Editor Section */}
        <ProofreadingEditor
          editorRef={editorRef}
          initialText=""
          initialDocId={undefined}
          initialLanguage={languageCode}
        />

        {/* Additional SEO Content */}
        <section className="container max-w-4xl mx-auto px-4 py-12">
          <div className="prose prose-slate max-w-none dark:prose-invert">
            <h2>Why Use CorrectNow for {languageInfo.name}?</h2>
            <ul>
              <li>
                <strong>AI-Powered:</strong> Advanced language models ensure accurate grammar and spelling corrections
              </li>
              <li>
                <strong>Instant Results:</strong> Get real-time suggestions as you type
              </li>
              <li>
                <strong>Free to Use:</strong> Check up to 200 words for free, upgrade for more
              </li>
              <li>
                <strong>Privacy First:</strong> Your text is processed securely and never stored without permission
              </li>
            </ul>

            <h2>How to Use the {languageInfo.name} Grammar Checker</h2>
            <ol>
              <li>Type or paste your {languageInfo.name} text in the editor above</li>
              <li>Click the "Check Grammar" button</li>
              <li>Review the suggestions and accept or ignore them</li>
              <li>Copy your corrected text or download it as a PDF</li>
            </ol>

            <h2>Features</h2>
            <p>
              CorrectNow's {languageInfo.name} grammar checker uses advanced AI to detect:
            </p>
            <ul>
              <li>Spelling mistakes</li>
              <li>Grammar errors</li>
              <li>Punctuation issues</li>
              <li>Style improvements</li>
              <li>Word choice suggestions</li>
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default LanguageLanding;
