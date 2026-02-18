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
    // Use languageCode from SEO data if available, otherwise from URL parameter
    const code = seoData?.languageCode || languageCode;
    return LANGUAGE_OPTIONS.find((lang) => lang.code === code);
  }, [languageCode, seoData]);

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

  if (notFound) {
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

  // If no language info found even after loading SEO data, show not found
  if (!loading && !languageInfo) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <h1 className="text-4xl font-bold mb-4">Invalid Language</h1>
            <p className="text-muted-foreground mb-6">
              The language code for this page is not valid.
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

  const defaultTitle = `${languageInfo?.name || "Language"} Grammar Checker - CorrectNow`;
  const defaultDescription = `Free online ${languageInfo?.name || "grammar"} checker and proofreading tool. Check your ${languageInfo?.name || ""} text for spelling, grammar, and style mistakes instantly.`;
  const defaultKeywords = `${languageInfo?.name || "language"} grammar checker, ${languageInfo?.name || "language"} spell check, ${languageInfo?.name || "language"} proofreading, online grammar check, ${seoData?.languageCode || languageCode} grammar`;

  const pageTitle = seoData?.title || defaultTitle;
  const metaDescription = seoData?.metaDescription || defaultDescription;
  const keywords = seoData?.keywords || defaultKeywords;
  const h1Text = seoData?.h1 || `${languageInfo?.name || "Language"} Grammar Checker`;
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
        <meta property="og:url" content={`https://correctnow.app/${seoData?.urlSlug || languageCode}`} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        
        {/* Canonical URL */}
        <link rel="canonical" href={`https://correctnow.app/${seoData?.urlSlug || languageCode}`} />
        
        {/* Language */}
        <html lang={seoData?.languageCode === "auto" ? "en" : seoData?.languageCode || languageCode} />
      </Helmet>

      <Header />

      <main className="flex-1">
        {/* SEO Content Section */}
        <section className="bg-gradient-to-b from-background to-muted/20 py-8 sm:py-12 pb-12 sm:pb-16">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              {h1Text}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
              {descriptionText}
            </p>
          </div>
        </section>

        {/* Editor Section */}
        <ProofreadingEditor
          editorRef={editorRef}
          initialText=""
          initialDocId={undefined}
          initialLanguage={seoData?.languageCode}
        />

        {/* Additional SEO Content */}
        {languageInfo && (
          <section className="container max-w-4xl mx-auto px-4 py-12">
            <div className="prose prose-slate max-w-none dark:prose-invert">
              {/* URL Slug for SEO - Hidden text */}
              <div className="text-xs text-muted-foreground mb-6 not-prose">
                <span className="font-mono bg-muted px-2 py-1 rounded">
                  correctnow.app/{seoData?.urlSlug || languageCode}
                </span>
              </div>

              {/* Keywords-based intro paragraph */}
              {seoData?.keywords && (
                <div className="bg-muted/30 p-6 rounded-lg mb-8 not-prose">
                  <p className="text-sm text-foreground leading-relaxed">
                    Looking for a reliable <strong>{seoData.keywords.split(',')[0]?.trim()}</strong>? 
                    CorrectNow offers professional {seoData.keywords.split(',')[1]?.trim() || 'proofreading'} and {seoData.keywords.split(',')[2]?.trim() || 'grammar checking'} services. 
                    Our tool is perfect for students, professionals, and content creators who need accurate {languageInfo.name} text correction.
                  </p>
                </div>
              )}

              <h2>Why Use CorrectNow for {languageInfo.name}?</h2>
              <ul>
                <li>
                  <strong>AI-Powered:</strong> Advanced language models ensure accurate grammar and spelling corrections for {languageInfo.name}
                </li>
                <li>
                  <strong>Instant Results:</strong> Get real-time suggestions as you type in {languageInfo.name}
                </li>
                <li>
                  <strong>Free to Use:</strong> Check up to 200 words for free, upgrade for unlimited {languageInfo.name} proofreading
                </li>
                <li>
                  <strong>Privacy First:</strong> Your {languageInfo.name} text is processed securely and never stored without permission
                </li>
              </ul>

              <h2>How to Use the {languageInfo.name} Grammar Checker</h2>
              <ol>
                <li>Type or paste your {languageInfo.name} text in the editor above</li>
                <li>Click the "Check Grammar" button to analyze your content</li>
                <li>Review the {languageInfo.name} grammar and spelling suggestions</li>
                <li>Accept corrections with one click or make manual edits</li>
                <li>Copy your corrected text or download it as a PDF</li>
              </ol>

              {/* Keyword-rich feature section */}
              <h2>Comprehensive {languageInfo.name} Writing Support</h2>
              <p>
                CorrectNow's {languageInfo.name} grammar checker uses advanced AI to detect and correct:
              </p>
              <ul>
                <li><strong>Spelling mistakes</strong> - Catch typos and misspelled {languageInfo.name} words</li>
                <li><strong>Grammar errors</strong> - Fix sentence structure and verb tense issues</li>
                <li><strong>Punctuation issues</strong> - Proper comma placement and quotation marks</li>
                <li><strong>Style improvements</strong> - Enhance readability and flow</li>
                <li><strong>Word choice suggestions</strong> - Better vocabulary for professional {languageInfo.name} writing</li>
              </ul>

              {/* Additional keyword integration */}
              {seoData?.keywords && (
                <>
                  <h2>Perfect for All {languageInfo.name} Writing Needs</h2>
                  <p>
                    Whether you need {seoData.keywords.split(',')[0]?.trim()} for academic papers, 
                    professional emails, or creative writing, CorrectNow provides instant, 
                    accurate corrections. Our {languageInfo.name} proofreading tool works for:
                  </p>
                  <ul>
                    <li>Students writing essays and research papers in {languageInfo.name}</li>
                    <li>Business professionals drafting emails and reports</li>
                    <li>Content creators and bloggers publishing in {languageInfo.name}</li>
                    <li>Anyone who wants to improve their {languageInfo.name} writing skills</li>
                  </ul>

                  <div className="bg-primary/5 p-6 rounded-lg mt-8 not-prose">
                    <h3 className="text-lg font-semibold mb-3 text-foreground">
                      Start Using {languageInfo.name} Grammar Checker Today
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Access our free {seoData.keywords.split(',')[0]?.trim()} at{' '}
                      <span className="font-mono text-primary">correctnow.app/{seoData.urlSlug}</span>.
                      No registration required for basic grammar checking. Upgrade to Premium for advanced features
                      and unlimited word count.
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default LanguageLanding;
