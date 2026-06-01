import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, CreditCard, Clock, Shield, Globe, HelpCircle, CheckCircle, Send, Loader2, ArrowRight, MessageSquare } from "lucide-react";

const ContactUs = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Message sent!",
          description: "We'll get back to you within 24-48 business hours.",
        });
        // Reset form
        setFormData({
          name: "",
          email: "",
          subject: "",
          message: ""
        });
      } else {
        throw new Error(result.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Contact form error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again or email us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-white via-blue-50/30 to-indigo-50/20 py-16 md:py-24">
          <div className="pointer-events-none absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-blue-200/40 via-indigo-200/30 to-violet-200/20 blur-3xl" />
          <div className="container max-w-4xl relative">
            <div className="flex flex-col items-center text-center gap-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
                <MessageSquare className="w-3.5 h-3.5" />
                Get in Touch
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground">
                We're here to{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">help you</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                Have a question about CorrectNow, need help with your account, or a billing inquiry? Reach out using the options below — we respond within 24–48 hours.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
                <a href="mailto:info@correctnow.app" className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50 hover:border-blue-300 transition-colors">
                  <Mail className="w-4 h-4" />
                  info@correctnow.app
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <section className="py-16 md:py-20">
          <div className="container max-w-3xl">
            <Card className="border border-border/60 shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent">
                    <Send className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Send Us a Message</CardTitle>
                </div>
                <p className="text-muted-foreground">
                  Fill out the form below and we'll get back to you within 24-48 business hours.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={isSubmitting}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium">
                        Email <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={isSubmitting}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="subject" className="text-sm font-medium">
                      Subject
                    </label>
                    <Input
                      id="subject"
                      placeholder="What is this regarding?"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-medium">
                      Message <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      id="message"
                      placeholder="How can we help you?"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      disabled={isSubmitting}
                      className="min-h-[150px] resize-y"
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    size="lg" 
                    className="group w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Contact Options */}
        <section className="pb-16 md:pb-20">
          <div className="container max-w-5xl">
            <div className="grid gap-8 md:grid-cols-2">
              {/* General Inquiries */}
              <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50">
                      <HelpCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl">General Inquiries</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">For questions about:</p>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>CorrectNow features</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Product information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Partnerships or collaborations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Media or press inquiries</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>General support</span>
                    </li>
                  </ul>
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Mail className="w-4 h-4" />
                      <span className="font-medium">Email:</span>
                    </div>
                    <a 
                      href="mailto:info@correctnow.app" 
                      className="text-lg font-semibold text-accent hover:text-accent/80 transition-colors"
                    >
                      info@correctnow.app
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Billing & Subscriptions */}
              <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50">
                      <CreditCard className="w-6 h-6 text-indigo-600" />
                    </div>
                    <CardTitle className="text-2xl">Billing & Subscriptions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">For questions related to:</p>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Payments and invoices</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Subscription plans</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Refund requests</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <span>Billing errors or duplicate charges</span>
                    </li>
                  </ul>
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Mail className="w-4 h-4" />
                      <span className="font-medium">Email:</span>
                    </div>
                    <a 
                      href="mailto:billing@correctnow.app" 
                      className="text-lg font-semibold text-accent hover:text-accent/80 transition-colors"
                    >
                      billing@correctnow.app
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Additional Info */}
        <section className="py-16 md:py-20 bg-accent/5">
          <div className="container max-w-4xl">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Response Time */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
                      <Clock className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <CardTitle className="text-xl">Response Time</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>We aim to respond to all inquiries within <strong className="text-foreground">24–48 business hours</strong>.</p>
                  <p className="text-sm">Response times may vary during weekends or public holidays.</p>
                </CardContent>
              </Card>

              {/* Account & Privacy */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
                      <Shield className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <CardTitle className="text-xl">Account & Privacy</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>If your request involves account access, privacy, or security:</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Please contact us from the email address associated with your CorrectNow account</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Do not share passwords or sensitive payment details via email</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Global Users */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
                      <Globe className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <CardTitle className="text-xl">Global Users</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>CorrectNow serves users worldwide.</p>
                  <p>Our support team handles inquiries in English and responds according to applicable regional laws and policies.</p>
                </CardContent>
              </Card>

              {/* Before You Contact */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
                      <HelpCircle className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <CardTitle className="text-xl">Before You Contact Us</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>You may find quick answers in:</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Help articles</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Subscription & billing information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Privacy Policy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Terms of Service</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Refund Policy</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="relative overflow-hidden py-16 md:py-24">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700" />
          <div className="pointer-events-none absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="relative container max-w-3xl text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              Still have questions?
            </h2>
            <p className="text-white/75 text-lg mb-8">
              Our team is ready to help you get the most out of CorrectNow.
            </p>
            <a
              href="mailto:info@correctnow.app"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-blue-700 shadow-lg hover:bg-blue-50 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email us directly
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ContactUs;
