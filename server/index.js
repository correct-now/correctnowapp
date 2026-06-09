import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Razorpay from "razorpay";
import Stripe from "stripe";
import crypto from "crypto";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { createProxyMiddleware } from "http-proxy-middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");
const publicPath = path.join(__dirname, "..", "public");

const initAdminDb = () => {
  try {
    if (!admin.apps.length) {
      // Try to load from explicit env path first
      const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const resolvedEnvPath = envPath
        ? path.isAbsolute(envPath)
          ? envPath
          : path.join(__dirname, "..", envPath)
        : null;
      const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

      if (resolvedEnvPath && existsSync(resolvedEnvPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(resolvedEnvPath),
        });
      } else if (existsSync(serviceAccountPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Fallback to env variable
        // Handle both local .env format and cloud platform environment variables
        let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        let serviceAccount;
        
        try {
          // Try parsing as-is first (works if already valid JSON)
          serviceAccount = JSON.parse(serviceAccountJson);
          console.log("âœ“ Successfully parsed FIREBASE_SERVICE_ACCOUNT (direct parse)");
          
          // Handle double-encoded JSON (when parsing returns a string instead of object)
          if (typeof serviceAccount === 'string') {
            console.log("Detected double-encoded JSON, parsing again...");
            serviceAccount = JSON.parse(serviceAccount);
            console.log("âœ“ Successfully parsed double-encoded JSON");
          }
        } catch (err) {
          // If that fails, try unescaping (handles escaped JSON strings from .env files)
          try {
            console.log("First parse failed, trying with unescaping...");
            // Remove outer quotes if present
            if (serviceAccountJson.startsWith('"') && serviceAccountJson.endsWith('"')) {
              serviceAccountJson = serviceAccountJson.slice(1, -1);
            }
            // Replace escaped characters: \n -> newline, \" -> ", \\ -> \
            serviceAccountJson = serviceAccountJson
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            
            serviceAccount = JSON.parse(serviceAccountJson);
            console.log("âœ“ Successfully parsed FIREBASE_SERVICE_ACCOUNT (after unescaping)");
          } catch (err2) {
            console.error("âŒ Failed to parse FIREBASE_SERVICE_ACCOUNT:", err2.message);
            console.error("Environment variable preview:", serviceAccountJson?.substring(0, 100));
            throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT format. Must be valid JSON.");
          }
        }
        
        // Verify it's an object with required fields
        if (!serviceAccount || typeof serviceAccount !== 'object') {
          console.error("âŒ Parsed result type:", typeof serviceAccount);
          console.error("Parsed result preview:", JSON.stringify(serviceAccount)?.substring(0, 200));
          throw new Error("FIREBASE_SERVICE_ACCOUNT must be a valid JSON object");
        }
        
        if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
          console.error("âŒ Missing required fields. Has:", Object.keys(serviceAccount || {}).join(', '));
          throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields (project_id, private_key, client_email)");
        }
        
        console.log("âœ“ Firebase service account validated, project:", serviceAccount.project_id);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        return null;
      }
    }
    const db = admin.firestore();
    // Enable ignoreUndefinedProperties to prevent Firestore errors
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  } catch (err) {
    console.error("Firebase admin init error:", err);
    return null;
  }
};

const adminDb = initAdminDb();

/**
 * Verify Firebase auth token
 * @param {string} token - Firebase ID token
 * @returns {Promise<DecodedIdToken|null>} Decoded token or null if invalid
 */
const verifyAuthToken = async (token) => {
  try {
    if (!admin.apps.length) {
      console.error('Firebase admin not initialized');
      return null;
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying auth token:', error.message);
    return null;
  }
};

/**
 * Get user data from Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object|null>} User data or null
 */
const getUserData = async (userId) => {
  try {
    if (!adminDb) {
      console.error('Firestore not initialized');
      return null;
    }
    
    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return null;
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

/**
 * Update user's daily check count
 * @param {string} userId - Firebase user ID
 * @returns {Promise<boolean>} Success status
 */
const incrementUserCheck = async (userId) => {
  try {
    if (!adminDb) {
      console.error('Firestore not initialized');
      return false;
    }
    
    const userRef = adminDb.collection('users').doc(userId);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Get current data
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    // Reset daily count if it's a new day
    if (userData.lastCheckDate !== today) {
      await userRef.set({
        ...userData,
        dailyChecksUsed: 1,
        lastCheckDate: today
      }, { merge: true });
    } else {
      // Increment daily count
      await userRef.update({
        dailyChecksUsed: admin.firestore.FieldValue.increment(1)
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error incrementing user check:', error);
    return false;
  }
};

/**
 * Get user entitlements (similar to frontend entitlements.ts)
 * @param {Object} userData - User data from Firestore
 * @returns {Object} Entitlements object
 */
const getUserEntitlements = (userData) => {
  if (!userData) {
    return {
      plan: 'free',
      isPro: false,
      checksLimit: 5, // Free limit: 5 per day
      checksUsed: 0
    };
  }

  const planField = String(userData?.plan || '').trim().toLowerCase();
  const wordLimit = Number(userData?.wordLimit) || 0;
  const isPro = wordLimit >= 5000 || planField === 'pro';
  
  const subscriptionStatus = String(userData?.subscriptionStatus || '').trim().toLowerCase();
  const updatedAtRaw = userData?.subscriptionUpdatedAt;
  const updatedAt = updatedAtRaw ? new Date(String(updatedAtRaw)) : null;
  const isRecent = updatedAt
    ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31 // 31 days
    : false;
  
  // INSTANT-DOWNGRADE POLICY (no grace period): ONLY an 'active' subscription
  // grants Pro. Any other status â€” payment_failed, past_due, cancelled,
  // refunded, inactive â€” loses Pro access immediately. This matches the
  // frontend getEffectivePlan() so server and client never disagree.
  const isActive = subscriptionStatus === 'active' && (updatedAt ? isRecent : true);

  const effectiveIsPro = subscriptionStatus ? (isActive && isPro) : isPro;
  
  // Get today's date for daily check reset
  const today = new Date().toISOString().split('T')[0];
  const lastCheckDate = userData?.lastCheckDate;
  const dailyChecksUsed = lastCheckDate === today ? (userData?.dailyChecksUsed || 0) : 0;
  
  return {
    plan: effectiveIsPro ? 'pro' : 'free',
    isPro: effectiveIsPro,
    checksLimit: effectiveIsPro ? -1 : 5, // Pro: unlimited, Free: 5/day
    checksUsed: dailyChecksUsed,
    subscriptionStatus: subscriptionStatus || 'inactive'
  };
};

/**
 * Increment usage count for authenticated user
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
const incrementUsageCount = async (userId) => {
  try {
    await incrementUserCheck(userId);
  } catch (error) {
    console.error('Error incrementing usage:', error);
  }
};

// Simple in-memory cache to reduce latency and cost
const cacheStore = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const getCache = (key) => {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (key, value) => {
  cacheStore.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: "2024-11-20.acacia" });
};

const getBrevoTransporter = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const smtpUser = process.env.BREVO_SMTP_USER || "apikey";
  const smtpPass = process.env.BREVO_SMTP_PASS || apiKey;
  if (!smtpPass) return null;
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
};

const sendBrevoEmail = async ({ to, subject, html }) => {
  const transporter = getBrevoTransporter();
  if (!transporter) {
    throw new Error("Brevo SMTP is not configured");
  }
  const fromEmail = process.env.BREVO_FROM_EMAIL || "no-reply@yourdomain.com";
  const fromName = process.env.BREVO_FROM_NAME || "CorrectNow";
  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const toStripeAmount = (amount, currency) => {
  const code = String(currency || "").toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.has(code)
    ? Math.round(amount)
    : Math.round(amount * 100);
};

// ---------------------------------------------------------------------------
// Payment-system security & reliability helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of two hex signatures to defeat timing attacks.
 * Falls back to false on any length mismatch or error.
 */
const safeEqualHex = (a, b) => {
  try {
    const ba = Buffer.from(String(a), "utf8");
    const bb = Buffer.from(String(b), "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
};

/**
 * Centralised admin authorisation. ONLY a verified `admin` custom claim or an
 * exact-match allow-listed email is treated as admin. The previous
 * `email.includes("admin")` check was a privilege-escalation hole (any user
 * with "admin" anywhere in their email gained full admin access) and is gone.
 */
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "correctnowapp@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const isAdminClaims = (decodedToken) => {
  if (!decodedToken) return false;
  if (decodedToken.admin === true) return true;
  const email = String(decodedToken.email || "").trim().toLowerCase();
  if (!email) return false;
  if (ADMIN_EMAILS.has(email)) return true;
  // Verified custom domain (exact suffix, not substring)
  if (email.endsWith("@correctnow.app")) return true;
  return false;
};

/**
 * Express middleware enforcing admin auth on a route. Rejects with 401/403
 * unless the caller presents a valid Firebase ID token whose claims pass
 * isAdminClaims(). Attaches the decoded token to req.admin for downstream use.
 */
const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: missing token" });
    }
    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: "Unauthorized: invalid token" });
    }
    if (!isAdminClaims(decoded)) {
      return res.status(403).json({ error: "Forbidden: admin access required" });
    }
    req.admin = decoded;
    return next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({ error: "Auth check failed" });
  }
};

/**
 * Idempotency guard. Atomically records a webhook event id; returns true if the
 * event was ALREADY processed (duplicate delivery), false if this is the first
 * time. Concurrent duplicate deliveries are serialised by the transaction so an
 * event is never double-applied. Fails open (returns false) if no event id is
 * available so we never silently drop a real event.
 */
const isDuplicateWebhookEvent = async (gateway, eventId) => {
  if (!adminDb || !eventId) return false;
  const ref = adminDb.collection("webhookEvents").doc(`${gateway}_${eventId}`);
  try {
    const isFirst = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { gateway, eventId, processedAt: new Date().toISOString() });
      return true;
    });
    return !isFirst;
  } catch (e) {
    console.error("Idempotency check failed:", e.message);
    return false;
  }
};

/** Remove an idempotency marker so a failed-and-retried event can reprocess. */
const clearWebhookEvent = async (gateway, eventId) => {
  if (!adminDb || !eventId) return;
  try {
    await adminDb.collection("webhookEvents").doc(`${gateway}_${eventId}`).delete();
  } catch (e) {
    console.error("Failed to clear webhook event marker:", e.message);
  }
};

/** Append an immutable audit record of a payment/subscription event. */
const recordPaymentEvent = async (entry) => {
  if (!adminDb) return;
  try {
    await adminDb.collection("paymentHistory").add({
      ...entry,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to record payment event:", e.message);
  }
};

/**
 * Resolve user docs that belong to a subscription id, matching BOTH the
 * `subscriptionId` and `razorpaySubscriptionId` fields (historical data used
 * different field names). Returns an array of QueryDocumentSnapshots.
 */
const findUsersBySubscription = async (subscriptionId) => {
  if (!adminDb || !subscriptionId) return [];
  const col = adminDb.collection("users");
  const seen = new Map();
  for (const field of ["subscriptionId", "razorpaySubscriptionId", "stripeSubscriptionId"]) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await col.where(field, "==", subscriptionId).get();
    snap.forEach((d) => seen.set(d.id, d));
  }
  return Array.from(seen.values());
};

/**
 * Apply `updates` to every user mapped to `subscriptionId`. Returns the number
 * of user docs updated (0 means the subscriptionâ†’user mapping is not yet
 * established, which the caller can use to decide whether to ask for a retry).
 */
const updateUsersBySubscriptionId = async (subscriptionId, updates) => {
  if (!adminDb || !subscriptionId) return 0;
  const docs = await findUsersBySubscription(subscriptionId);
  if (!docs.length) return 0;
  const batch = adminDb.batch();
  docs.forEach((doc) => batch.set(doc.ref, updates, { merge: true }));
  await batch.commit();
  return docs.length;
};

/** Canonical free-plan downgrade payload (instant, no grace period). */
const FREE_PLAN_DOWNGRADE = {
  plan: "free",
  wordLimit: 200,
  credits: 0,
  creditsUsed: 0,
};
/** Canonical pro-plan grant payload. */
const PRO_PLAN_GRANT = {
  plan: "pro",
  wordLimit: 5000,
  credits: 25000,
  creditsUsed: 0,
};

// IP tracking for rate limiting non-authenticated users
const ipCheckCount = new Map(); // { ip: { count: number, resetAt: timestamp } }
const IP_CHECK_LIMIT = 5;
const IP_RESET_HOURS = 24;
// Daily word limit for logged-in free users (also enforced per IP)
const freeIpWordCount = new Map(); // { key: { count: number, resetAt: timestamp } }

app.use(cors());

// CRITICAL: Process webhook routes BEFORE any body parsing middleware
// Stripe webhook - MUST use raw body
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("=== STRIPE WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    console.log("Has signature:", !!sig);
    console.log("Has webhook secret:", !!webhookSecret);
    console.log("Body type:", typeof req.body);
    console.log("Body is Buffer:", Buffer.isBuffer(req.body));
    
    if (!sig || !webhookSecret) {
      console.error("ERROR: Missing signature or webhook secret");
      return res.status(400).json({ error: "Missing signature or webhook secret" });
    }

    const stripe = getStripe();
    if (!stripe) {
      console.error("ERROR: Stripe not configured");
      return res.status(500).json({ error: "Stripe not configured" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log("âœ“ Webhook signature verified successfully");
    } catch (err) {
      console.error("ERROR: Stripe webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log("Event type:", event.type);
    console.log("Event ID:", event.id);

    try {
      const nowIso = new Date().toISOString();
      
      switch (event.type) {
        case "checkout.session.completed": {
          console.log("--- Processing checkout.session.completed ---");
          const session = event.data.object;
          const customerId = session.customer;
          const subscriptionId = session.subscription;
          const metadata = session.metadata || {};
          const userId = metadata.userId;
          
          console.log("Customer ID:", customerId);
          console.log("Subscription ID:", subscriptionId);
          console.log("User ID from metadata:", userId);
          console.log("Metadata type:", metadata.type);
          console.log("AdminDb available:", !!adminDb);
          
          if (!userId) {
            console.error("ERROR: No userId in metadata");
            break;
          }
          
          if (!adminDb) {
            console.error("ERROR: AdminDb not initialized");
            break;
          }
          
          const userRef = adminDb.collection("users").doc(userId);
          console.log("User reference path:", `users/${userId}`);
          
          if (metadata.type === "credits") {
            console.log("Processing CREDIT purchase");
            const credits = Number(metadata.credits || 0);
            console.log("Credits to add:", credits);
            
            const userSnap = await userRef.get();
            const data = userSnap.exists ? userSnap.data() : {};
            const currentAddon = Number(data?.addonCredits || 0) || 0;
            const currentExpiry = data?.addonCreditsExpiryAt;
            const now = new Date();
            const isCurrentValid = currentExpiry ? new Date(String(currentExpiry)).getTime() > now.getTime() : false;
            const nextAddon = (isCurrentValid ? currentAddon : 0) + credits;
            const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            console.log("Current addon credits:", currentAddon);
            console.log("New addon credits:", nextAddon);
            
            await userRef.set({
              addonCredits: nextAddon,
              addonCreditsExpiryAt: expiry,
              creditsUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
            console.log("âœ“ Credits updated successfully");
          } else {
            console.log("Processing SUBSCRIPTION purchase");
            // Fetch subscription to get current_period_end
            let periodEnd = null;
            try {
              const stripeSdk = getStripe();
              if (stripeSdk && subscriptionId) {
                const sub = await stripeSdk.subscriptions.retrieve(subscriptionId);
                periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
              }
            } catch (e) { console.warn("Could not fetch subscription period end:", e.message); }
            // Fetch subscription creation date and amount from Stripe
            let subscriptionCreatedAt = nowIso;
            let lastPaymentAmount = null;
            let stripePeriodStart = null;
            try {
              const stripeSdk = getStripe();
              if (stripeSdk && subscriptionId) {
                const sub = await stripeSdk.subscriptions.retrieve(subscriptionId, {
                  expand: ["latest_invoice"],
                });
                if (sub.created) subscriptionCreatedAt = new Date(sub.created * 1000).toISOString();
                if (sub.current_period_start) stripePeriodStart = new Date(sub.current_period_start * 1000).toISOString();
                const inv = sub.latest_invoice;
                if (inv && typeof inv === "object" && inv.amount_paid != null) {
                  lastPaymentAmount = inv.amount_paid / 100; // cents â†’ dollars/rupees
                }
              }
            } catch (e) { console.warn("Could not fetch subscription details:", e.message); }
            const updateData = {
              plan: "pro",
              wordLimit: 5000,
              credits: 25000,
              creditsUsed: 0,
              creditsResetDate: nowIso,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              paymentGateway: "stripe",
              subscriptionCreatedAt,
              ...(stripePeriodStart ? { subscriptionPeriodStart: stripePeriodStart } : {}),
              ...(lastPaymentAmount !== null ? { lastPaymentAmount } : {}),
              subscriptionStatus: "active",
              subscriptionCurrentPeriodEnd: periodEnd,
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            };
            console.log("Update data:", JSON.stringify(updateData, null, 2));
            
            await userRef.set(updateData, { merge: true });
            console.log("âœ“ Subscription updated successfully");
            
            // Verify the update
            const verifySnap = await userRef.get();
            if (verifySnap.exists) {
              console.log("âœ“ Verification - User document exists");
              console.log("Updated user data:", JSON.stringify(verifySnap.data(), null, 2));
            } else {
              console.error("ERROR: User document not found after update");
            }
          }
          break;
        }
        
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          console.log("--- Processing subscription update/delete ---");
          const subscription = event.data.object;
          const subscriptionId = subscription.id;
          const status = subscription.status;
          
          console.log("Subscription ID:", subscriptionId);
          console.log("Subscription status:", status);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users with this subscription:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          const updates = {};
          
          if (status === "active") {
            updates.plan = "pro";
            updates.wordLimit = 5000;
            updates.credits = 25000;
            updates.creditsUsed = 0;
            updates.creditsResetDate = nowIso;
            updates.subscriptionStatus = "active";
            if (subscription.current_period_end) {
              updates.subscriptionCurrentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
            }
          } else if (["canceled", "unpaid"].includes(status)) {
            updates.plan = "free";
            updates.wordLimit = 200;
            updates.credits = 0;
            updates.creditsUsed = 0;
            updates.subscriptionStatus = status;
            updates.subscriptionCurrentPeriodEnd = null;
          } else if (status === "past_due") {
            updates.subscriptionStatus = "past_due";
            if (subscription.current_period_end) {
              updates.subscriptionCurrentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
            }
          }
          
          updates.subscriptionUpdatedAt = nowIso;
          updates.updatedAt = nowIso;
          
          console.log("Update data:", JSON.stringify(updates, null, 2));
          
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, updates, { merge: true });
          });
          
          await batch.commit();
          console.log("âœ“ Batch update completed");
          break;
        }
        
        case "invoice.payment_succeeded": {
          console.log("--- Processing invoice.payment_succeeded ---");
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          console.log("Subscription ID:", subscriptionId);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          const periodEndIso = invoice.lines?.data?.[0]?.period?.end
            ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
            : null;
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, {
              plan: "pro",
              wordLimit: 5000,
              credits: 25000,
              creditsUsed: 0,
              creditsResetDate: nowIso,
              subscriptionStatus: "active",
              ...(periodEndIso ? { subscriptionCurrentPeriodEnd: periodEndIso } : {}),
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          });
          
          await batch.commit();
          console.log("âœ“ Batch update completed");
          break;
        }
        
        case "invoice.payment_failed": {
          console.log("--- Processing invoice.payment_failed ---");
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          console.log("Subscription ID:", subscriptionId);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, {
              subscriptionStatus: "past_due",
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          });
          
          await batch.commit();
          console.log("âœ“ Batch update completed");
          break;
        }
        
        default:
          console.log("Unhandled event type:", event.type);
      }
      
      console.log("=== WEBHOOK PROCESSING COMPLETED SUCCESSFULLY ===");
      res.json({ received: true });
    } catch (error) {
      console.error("=== WEBHOOK ERROR ===");
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

// Razorpay webhook - MUST use raw body
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  if (!secret || !signature) {
    // Misconfiguration / missing signature â†’ 400 (do not leak which one).
    return res.status(400).json({ message: "Webhook secret or signature missing" });
  }

  // 1) Verify signature (timing-safe) on the RAW body BEFORE parsing.
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  if (!safeEqualHex(expected, signature)) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  // 2) Parse payload.
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid webhook payload" });
  }

  const eventName = event?.event || "unknown";
  // Razorpay sends a stable per-delivery id header for idempotency.
  const eventId =
    req.headers["x-razorpay-event-id"] ||
    event?.id ||
    `${eventName}_${event?.created_at || ""}`;

  if (!adminDb) {
    // Can't process reliably without the DB; ask Razorpay to retry.
    return res.status(500).json({ message: "DB not ready" });
  }

  // 3) Idempotency â€” acknowledge duplicates with 200 so Razorpay stops retrying.
  if (await isDuplicateWebhookEvent("razorpay", eventId)) {
    console.log("Razorpay duplicate event ignored:", eventName, eventId);
    return res.status(200).json({ status: "duplicate_ignored" });
  }

  try {
    console.log("Razorpay webhook:", eventName, eventId);
    const nowIso = new Date().toISOString();

    const subscriptionId =
      event?.payload?.subscription?.entity?.id ||
      event?.payload?.payment?.entity?.subscription_id ||
      event?.payload?.invoice?.entity?.subscription_id ||
      event?.payload?.subscription?.id ||
      "";
    const paymentEntity = event?.payload?.payment?.entity || null;

    // ---- Renewal / activation success ----
    if (eventName === "subscription.charged" || eventName === "subscription.activated") {
      if (subscriptionId) {
        const subEntity = event?.payload?.subscription?.entity || {};
        const chargeAt = subEntity.charge_at;
        const periodEndIso = chargeAt ? new Date(chargeAt * 1000).toISOString() : null;
        const startAt = subEntity.start_at;
        const subscriptionCreatedAt = startAt ? new Date(startAt * 1000).toISOString() : nowIso;
        const paidCount = subEntity.paid_count ?? null;
        const totalCount = subEntity.total_count ?? null;
        const amountPaise = paymentEntity?.amount ?? subEntity.amount ?? null;
        const amountInr = amountPaise !== null ? amountPaise / 100 : null;
        const count = await updateUsersBySubscriptionId(subscriptionId, {
          ...PRO_PLAN_GRANT,
          creditsResetDate: nowIso,
          subscriptionStatus: "active",
          razorpaySubscriptionId: subscriptionId,
          paymentGateway: "razorpay",
          subscriptionCreatedAt,
          ...(periodEndIso ? { subscriptionCurrentPeriodEnd: periodEndIso } : {}),
          ...(paidCount !== null ? { razorpayPaidCount: paidCount } : {}),
          ...(totalCount !== null ? { razorpayTotalCount: totalCount } : {}),
          ...(amountInr !== null ? { lastPaymentAmount: amountInr } : {}),
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        });
        await recordPaymentEvent({
          gateway: "razorpay",
          type: "renewal_success",
          event: eventName,
          eventId,
          subscriptionId,
          paymentId: paymentEntity?.id || null,
          amount: amountInr,
          currency: "INR",
          usersUpdated: count,
        });
        if (count === 0) {
          // No user mapped to this subscription. This is normal for the very
          // first charge (the client /verify endpoint performs the actual grant
          // and establishes the mapping) or for orphan/test events. We ACK with
          // 200 rather than 500: repeated 500s would make Razorpay disable the
          // webhook, breaking renewals for everyone. The miss is recorded above
          // in paymentHistory for reconciliation.
          console.warn("Razorpay charged but no user matched (acked):", subscriptionId);
        }
      }
    }

    // ---- INSTANT downgrade on the FIRST renewal failure (no grace) ----
    else if (eventName === "payment.failed") {
      if (subscriptionId) {
        const count = await updateUsersBySubscriptionId(subscriptionId, {
          ...FREE_PLAN_DOWNGRADE,
          subscriptionStatus: "payment_failed",
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        });
        await recordPaymentEvent({
          gateway: "razorpay",
          type: "payment_failed_downgrade",
          event: eventName,
          eventId,
          subscriptionId,
          paymentId: paymentEntity?.id || null,
          amount: paymentEntity?.amount != null ? paymentEntity.amount / 100 : null,
          currency: "INR",
          reason: paymentEntity?.error_description || paymentEntity?.error_reason || null,
          usersUpdated: count,
        });
        console.log(`Razorpay payment.failed â€” instantly downgraded ${count} user(s) to free`);
      }
    }

    // ---- Refunds â†’ revoke access ----
    else if (eventName === "refund.created" || eventName === "refund.processed") {
      const refundEntity = event?.payload?.refund?.entity || {};
      const refSubId = refundEntity?.notes?.subscription_id || subscriptionId;
      if (refSubId) {
        const count = await updateUsersBySubscriptionId(refSubId, {
          ...FREE_PLAN_DOWNGRADE,
          subscriptionStatus: "refunded",
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        });
        await recordPaymentEvent({
          gateway: "razorpay",
          type: "refund",
          event: eventName,
          eventId,
          subscriptionId: refSubId,
          refundId: refundEntity.id || null,
          paymentId: refundEntity.payment_id || null,
          amount: refundEntity.amount != null ? refundEntity.amount / 100 : null,
          currency: "INR",
          usersUpdated: count,
        });
        console.log(`Razorpay ${eventName} â€” revoked access for ${count} user(s)`);
      }
    }

    // ---- Pending / halt / cancel / pause / complete → downgrade ----
    // `subscription.pending` is fired the moment a renewal charge fails (before
    // Razorpay's retries/halt). Treating it as an instant downgrade enforces the
    // "no grace period" policy reliably, since this event always carries the
    // subscription id (unlike payment.failed).
    else if (
      [
        "subscription.pending",
        "subscription.halted",
        "subscription.cancelled",
        "subscription.paused",
        "subscription.completed",
      ].includes(eventName)
    ) {
      if (subscriptionId) {
        const status =
          eventName === "subscription.cancelled"
            ? "cancelled"
            : eventName === "subscription.pending" || eventName === "subscription.halted"
            ? "payment_failed"
            : "inactive";
        const count = await updateUsersBySubscriptionId(subscriptionId, {
          ...FREE_PLAN_DOWNGRADE,
          subscriptionStatus: status,
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        });
        await recordPaymentEvent({
          gateway: "razorpay",
          type: eventName === "subscription.completed" ? "subscription_completed" : "subscription_ended",
          event: eventName,
          eventId,
          subscriptionId,
          usersUpdated: count,
        });
        console.log(`Razorpay ${eventName} — downgraded ${count} user(s) to free`);
      }
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    // Signature was already verified â€” this is a processing/transient error.
    // Clear the idempotency marker and return 500 so Razorpay retries the event.
    console.error("Razorpay webhook processing error:", err);
    await clearWebhookEvent("razorpay", eventId);
    return res.status(500).json({ message: "Processing failed" });
  }
});

app.use(express.json({ limit: "1mb" }));

// Optional WordPress blog proxy (legacy). Keep it off `/blog` so the SPA can own `/blog`.
// If you still need WordPress, it will be reachable at `/blog-wp`.
const BLOG_PROXY_TARGET = process.env.BLOG_PROXY_TARGET || "https://blog.correctnow.app";
app.use(
  "/blog-wp",
  createProxyMiddleware({
    target: BLOG_PROXY_TARGET,
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      "^/blog-wp": "",
    },
  })
);

const WORD_LIMIT = 5000;
const FREE_DAILY_WORD_LIMIT = 300;

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Set admin claim and create user if needed (admin only)
app.post("/api/set-admin", async (req, res) => {
  try {
    // Verify the requesting user is an admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // Check if the requesting user is an admin (claim or exact allow-list only).
    if (!isAdminClaims(decodedToken)) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    let user;
    try {
      // Try to get existing user
      user = await admin.auth().getUserByEmail(email);
      // Update password if provided
      if (password) {
        await admin.auth().updateUser(user.uid, {
          password,
          emailVerified: true,
        });
        console.log(`Updated password for existing user: ${email}`);
      }
    } catch (error) {
      // User doesn't exist, create it
      if (password) {
        user = await admin.auth().createUser({
          email,
          password,
          emailVerified: true,
        });
        console.log(`Created new user: ${email}`);
      } else {
        return res.status(400).json({ error: "Password required for new user" });
      }
    }

    // Set admin claim
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Admin claim set for ${email} (${user.uid})`);

    res.json({ 
      success: true, 
      message: `Admin access granted to ${email}`,
      uid: user.uid
    });
  } catch (error) {
    console.error("Set admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new user (admin only)
app.post("/api/admin/create-user", requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, category, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const phoneValue = String(phone || "").trim();
    const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;
    if (phoneValue && !phoneRegex.test(phoneValue)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    if (!adminDb) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    // Check if user already exists in Auth
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "User with this email already exists" });
      }
    } catch (error) {
      // If error code is 'auth/user-not-found', user doesn't exist - continue
      if (error.code !== 'auth/user-not-found') {
        // Some other error occurred
        console.error("Error checking user existence:", error);
        return res.status(500).json({ error: "Failed to check if user exists" });
      }
      // User doesn't exist, continue with creation
    }

    // Check if user already exists in Firestore by querying email field
    const existingUserQuery = await adminDb.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (!existingUserQuery.empty) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: name,
    });

    console.log(`Created new user: ${email} (${userRecord.uid})`);

    // Create user document in Firestore
    const nowIso = new Date().toISOString();
    const userData = {
      uid: userRecord.uid,
      email: email,
      name: name,
      plan: "free",
      wordLimit: 200,
      credits: 0,
      creditsUsed: 0,
      subscriptionStatus: "inactive",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    
    // Only add phone and category if they have values
    if (phoneValue) {
      userData.phone = phoneValue;
    }
    if (category && String(category).trim()) {
      userData.category = String(category).trim();
    }
    
    await adminDb.collection("users").doc(userRecord.uid).set(userData);

    console.log(`Created Firestore document for user: ${userRecord.uid}`);

    // Build response object without undefined values
    const responseData = {
      success: true, 
      message: `User created successfully: ${email}`,
      uid: userRecord.uid,
      email: email,
      name: name,
    };
    
    if (phoneValue) {
      responseData.phone = phoneValue;
    }
    if (category && String(category).trim()) {
      responseData.category = String(category).trim();
    }
    
    res.json(responseData);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only) - deletes from both Auth and Firestore
app.post("/api/admin/delete-user", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!adminDb) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(userId);
      console.log(`Deleted user from Auth: ${userId}`);
    } catch (error) {
      // If user doesn't exist in Auth, continue to delete from Firestore
      console.warn(`User not found in Auth (${userId}), continuing to delete from Firestore:`, error.message);
    }

    // Delete from Firestore
    try {
      await adminDb.collection("users").doc(userId).delete();
      console.log(`Deleted user document from Firestore: ${userId}`);
    } catch (error) {
      console.warn(`Failed to delete Firestore document for ${userId}:`, error.message);
    }

    res.json({ 
      success: true, 
      message: `User deleted successfully: ${userId}`
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle user plan between Pro and Free (admin only)
app.post("/api/admin/toggle-plan", requireAdmin, async (req, res) => {
  try {
    const { userId, durationDays } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!adminDb) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    // Get current user data
    const userDoc = await adminDb.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const currentPlan = String(userData?.plan || "free").toLowerCase();
    
    // Toggle plan
    const newPlan = currentPlan === "pro" ? "free" : "pro";
    const updates = {
      plan: newPlan,
      wordLimit: newPlan === "pro" ? 5000 : 200,
      credits: newPlan === "pro" ? 25000 : 0,
      creditsUsed: 0,
      subscriptionStatus: newPlan === "pro" ? "active" : "inactive",
      subscriptionUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (newPlan === "pro") {
      // Require a duration when granting Pro manually
      const days = parseInt(durationDays) || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      updates.adminPlanExpiresAt = expiresAt.toISOString();
      updates.adminPlanDurationDays = days;
    } else {
      // Downgrading â€” clear manual grant fields and subscription metadata
      updates.adminPlanExpiresAt = null;
      updates.adminPlanDurationDays = null;
      updates.razorpaySubscriptionId = null;
      updates.stripeSubscriptionId = null;
    }

    await adminDb.collection("users").doc(userId).update(updates);
    
    console.log(`Toggled plan for user ${userId}: ${currentPlan} â†’ ${newPlan}${updates.adminPlanExpiresAt ? ` (expires ${updates.adminPlanExpiresAt})` : ""}`);

    res.json({ 
      success: true, 
      message: `Plan changed to ${newPlan}`,
      newPlan,
      wordLimit: updates.wordLimit,
      subscriptionStatus: updates.subscriptionStatus,
      adminPlanExpiresAt: updates.adminPlanExpiresAt || null,
    });
  } catch (error) {
    console.error("Toggle plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk user actions (plan, credits, suspend, category)
app.post("/api/admin/bulk-action", requireAdmin, async (req, res) => {
  try {
    const { action, userIds, durationDays, creditsAmount, creditsExpiry, category } = req.body;
    if (!action || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "action and userIds are required" });
    }
    if (!adminDb) return res.status(500).json({ error: "Database not initialized" });

    const BATCH_SIZE = 500;
    let processed = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const chunk = userIds.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const uid of chunk) {
        const ref = adminDb.collection("users").doc(uid);
        try {
          if (action === "grant-pro") {
            const days = parseInt(durationDays) || 30;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + days);
            batch.update(ref, {
              plan: "pro",
              wordLimit: 5000,
              credits: 25000,
              creditsUsed: 0,
              subscriptionStatus: "active",
              subscriptionUpdatedAt: new Date().toISOString(),
              adminPlanExpiresAt: expiresAt.toISOString(),
              adminPlanDurationDays: days,
              updatedAt: new Date().toISOString(),
            });
          } else if (action === "revoke-pro") {
            batch.update(ref, {
              plan: "free",
              wordLimit: 200,
              subscriptionStatus: "inactive",
              adminPlanExpiresAt: null,
              adminPlanDurationDays: null,
              updatedAt: new Date().toISOString(),
            });
          } else if (action === "add-credits") {
            const amount = parseInt(creditsAmount) || 0;
            if (amount <= 0) continue;
            const expiry = creditsExpiry || (() => {
              const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString();
            })();
            const snap = await ref.get();
            const existing = snap.data()?.adminCredits || 0;
            batch.update(ref, {
              adminCredits: existing + amount,
              adminCreditsExpiryAt: expiry,
              updatedAt: new Date().toISOString(),
            });
          } else if (action === "suspend") {
            batch.update(ref, { status: "deactivated", updatedAt: new Date().toISOString() });
          } else if (action === "reactivate") {
            batch.update(ref, { status: "active", updatedAt: new Date().toISOString() });
          } else if (action === "set-category") {
            batch.update(ref, { category: category || "", updatedAt: new Date().toISOString() });
          } else {
            return res.status(400).json({ error: `Unknown action: ${action}` });
          }
          processed++;
        } catch (e) {
          failed++;
          errors.push(`${uid}: ${e.message}`);
        }
      }
      await batch.commit();
    }

    console.log(`Bulk action '${action}' on ${processed} users, ${failed} failed`);
    res.json({ success: true, processed, failed, errors });
  } catch (error) {
    console.error("Bulk action error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: fetch enriched subscription data live from Razorpay + Stripe
app.get("/api/admin/subscriptions", async (req, res) => {
  try {
    // Verify admin token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const idToken = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (!isAdminClaims(decodedToken)) return res.status(403).json({ error: "Forbidden" });

    if (!adminDb) return res.status(500).json({ error: "DB not ready" });

    // Fetch all users from Firestore
    const snap = await adminDb.collection("users").get();
    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const stripe = getStripe();
    const razorpay = getRazorpay();

    const results = await Promise.all(
      users.map(async (u) => {
        const base = {
          userId: u.id,
          email: u.email || "",
          name: u.name || "",
          plan: u.plan || "free",
          paymentGateway: u.paymentGateway || null,
          subscriptionStatus: u.subscriptionStatus || null,
          subscriptionCreatedAt: u.subscriptionCreatedAt || null,
          subscriptionUpdatedAt: u.subscriptionUpdatedAt || null,
          subscriptionCurrentPeriodEnd: u.subscriptionCurrentPeriodEnd || null,
          subscriptionPeriodStart: u.subscriptionPeriodStart || null,
          lastPaymentAmount: u.lastPaymentAmount ?? null,
          stripeSubscriptionId: u.stripeSubscriptionId || null,
          razorpaySubscriptionId: u.razorpaySubscriptionId || null,
          razorpayPaidCount: u.razorpayPaidCount ?? null,
          razorpayTotalCount: u.razorpayTotalCount ?? null,
          createdAt: u.createdAt || null,
          // Live-fetched fields (filled below)
          liveStatus: null,
          liveAmount: null,
          liveLastPaymentAmount: null,
          liveCurrency: null,
          livePeriodStart: null,
          livePeriodEnd: null,
          liveCreatedAt: null,
          livePaidCount: null,
          liveTotalCount: null,
          livePlanName: null,
          liveNextChargeAt: null,
          livePaymentMethod: null,
          liveError: null,
        };

        // Enrich with Stripe live data
        if (stripe && u.stripeSubscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(u.stripeSubscriptionId, {
              expand: ["latest_invoice.payment_intent", "customer"],
            });
            const price = sub.items?.data?.[0]?.price;
            const invoice = sub.latest_invoice;
            const customer = sub.customer;
            base.liveStatus = sub.status;
            base.liveCreatedAt = sub.created ? new Date(sub.created * 1000).toISOString() : null;
            base.livePeriodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null;
            base.livePeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
            base.liveCurrency = price?.currency?.toUpperCase() || null;
            base.liveAmount = price?.unit_amount != null ? price.unit_amount / 100 : null;
            base.livePlanName = price?.nickname || price?.product || "Pro";
            if (invoice && typeof invoice === "object") {
              if (invoice.amount_paid != null) base.liveAmount = invoice.amount_paid / 100;
              const pm = invoice.payment_intent?.payment_method_details?.card?.brand;
              if (pm) base.livePaymentMethod = pm;
            }
            base.paymentGateway = "stripe";
            if (customer && typeof customer === "object") {
              base.email = base.email || customer.email || "";
            }
          } catch (e) {
            base.liveError = e.message;
          }
        }

        // Enrich with Razorpay live data
        if (razorpay && u.razorpaySubscriptionId) {
          try {
            const sub = await razorpay.subscriptions.fetch(u.razorpaySubscriptionId);
            base.liveStatus = sub.status;
            base.liveCreatedAt = sub.created_at ? new Date(sub.created_at * 1000).toISOString() : null;
            base.livePeriodStart = sub.current_start ? new Date(sub.current_start * 1000).toISOString() : null;
            base.livePeriodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
            base.liveNextChargeAt = sub.charge_at ? new Date(sub.charge_at * 1000).toISOString() : null;
            base.livePaidCount = sub.paid_count ?? null;
            base.liveTotalCount = sub.total_count ?? null;
            base.liveCurrency = "INR";
            base.livePlanName = "Pro";
            base.paymentGateway = "razorpay";

            // The recurring AMOUNT is on the plan, not the subscription object.
            if (sub.plan_id) {
              try {
                const plan = await razorpay.plans.fetch(sub.plan_id);
                const planAmt = Number(plan?.item?.amount);
                if (Number.isFinite(planAmt)) base.liveAmount = planAmt / 100;
                base.livePlanName = plan?.item?.name || "Pro";
                base.liveCurrency = (plan?.item?.currency || "INR").toUpperCase();
              } catch (planErr) {
                console.warn("Razorpay plan fetch failed:", planErr.message);
              }
            }

            // Actual last CHARGED amount comes from the most recent paid invoice.
            try {
              const invoices = await razorpay.invoices.all({
                subscription_id: u.razorpaySubscriptionId,
                count: 1,
              });
              const inv = invoices?.items?.[0];
              if (inv && inv.amount_paid != null) {
                base.liveLastPaymentAmount = inv.amount_paid / 100;
                if (inv.currency) base.liveCurrency = String(inv.currency).toUpperCase();
              }
            } catch (invErr) {
              console.warn("Razorpay invoices fetch failed:", invErr.message);
            }
          } catch (e) {
            base.liveError = e.message;
          }
        }

        return base;
      })
    );

    // Return only users with any subscription activity
    const active = results.filter(
      (r) =>
        r.stripeSubscriptionId ||
        r.razorpaySubscriptionId ||
        r.subscriptionStatus ||
        r.plan === "pro"
    );

    return res.json({ subscriptions: active, total: active.length });
  } catch (err) {
    console.error("Admin subscriptions error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Ping Google to notify sitemap update (optional - called after blog publish)
app.post("/api/ping-sitemap", async (req, res) => {
  try {
    const sitemapUrl = "https://correctnow.app/sitemap.xml";
    const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    
    // Send ping to Google (fire and forget, don't wait for response)
    fetch(pingUrl).catch(err => {
      console.warn("Sitemap ping warning:", err.message);
    });
    
    console.log("Sitemap ping sent to Google");
    
    res.json({ 
      success: true, 
      message: "Sitemap ping sent successfully" 
    });
  } catch (error) {
    console.error("Sitemap ping error:", error);
    // Don't fail the request - this is optional
    res.json({ 
      success: true, 
      message: "Ping attempted (non-critical)" 
    });
  }
});

app.get("/api/razorpay/key", (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(500).json({ message: "Missing RAZORPAY_KEY_ID" });
  }
  return res.json({ keyId });
});

app.post("/api/razorpay/order", async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const percent = Number(req.body?.discountPercent || 0);
    const baseAmount = Number(req.body?.amount ?? 499);
    const amountInRupees = percent > 0
      ? Math.max(1, Number((baseAmount * (1 - percent / 100)).toFixed(2)))
      : baseAmount;

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return res.status(400).json({ message: "Invalid subscription amount" });
    }
    const credits = Number(req.body?.credits ?? 0);
    const amount = Math.round(amountInRupees * 100);
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { plan: "pro", credits: credits || undefined },
    });

    return res.json(order);
  } catch (err) {
    console.error("Razorpay order error:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

app.post("/api/razorpay/subscription", async (req, res) => {
  try {
    console.log("Razorpay subscription request received");
    console.log("Environment check:", {
      hasKeyId: !!process.env.RAZORPAY_KEY_ID,
      hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpay = getRazorpay();
    if (!razorpay) {
      console.error("Razorpay not configured - missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
      return res.status(500).json({ 
        message: "Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables." 
      });
    }

    const requestedPlanId = req.body?.planId;
    const requestedPeriod = String(req.body?.period || "monthly");
    const period = ["daily", "weekly", "monthly", "yearly"].includes(requestedPeriod)
      ? requestedPeriod
      : "monthly";
    const interval = Math.max(1, Number(req.body?.interval ?? 1));
    const percent = Number(req.body?.discountPercent || 0);
    const baseAmount = Number(req.body?.amount ?? 499);
    
    // Always use base amount for the plan (discount applied separately as one-time addon)
    const amountInRupees = baseAmount;

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return res.status(400).json({ message: "Invalid subscription amount" });
    }

    const targetAmountPaise = Math.round(amountInRupees * 100);
    let planId = requestedPlanId || process.env.RAZORPAY_PLAN_ID;

    // Verify the configured/requested plan actually matches the price + period
    // the customer is being charged. Razorpay plans are immutable, so a stale
    // RAZORPAY_PLAN_ID (e.g. an old ₹500 plan) would otherwise silently charge
    // the wrong amount and show wrong data everywhere. If it doesn't match, we
    // create a fresh plan with the correct amount.
    let planMatches = false;
    if (planId) {
      try {
        const existingPlan = await razorpay.plans.fetch(planId);
        const existingAmt = Number(existingPlan?.item?.amount);
        planMatches =
          existingAmt === targetAmountPaise &&
          existingPlan?.period === period &&
          Number(existingPlan?.interval) === interval;
        if (!planMatches) {
          console.warn(
            `Configured Razorpay plan ${planId} does not match (plan=${existingAmt} paise/${existingPlan?.period}, ` +
            `requested=${targetAmountPaise} paise/${period}). Creating a matching plan.`
          );
        }
      } catch (e) {
        console.warn("Could not fetch configured Razorpay plan, creating a new one:", e.message);
      }
    }

    if (!planId || !planMatches) {
      console.log("Creating new Razorpay plan for amount (paise):", targetAmountPaise);
      const plan = await razorpay.plans.create({
        period,
        interval,
        item: {
          name: "CorrectNow Pro",
          amount: targetAmountPaise,  // Full price the customer agreed to
          currency: "INR",
          description: "CorrectNow Pro subscription",
        },
      });
      planId = plan.id;
      console.log("Plan created:", planId);
    }

    console.log("Creating subscription with plan:", planId);
    const totalCount = Number(req.body?.totalCount ?? 12);
    
    const subscriptionData = {
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { plan: "pro" },
    };
    
    // Apply first-month discount as a one-time addon (negative amount)
    if (percent > 0) {
      const discountAmount = Math.round((baseAmount * percent / 100) * 100); // In paise
      subscriptionData.addons = [{
        item: {
          name: `${percent}% off first month`,
          amount: -discountAmount,  // âœ… Negative amount = discount
          currency: "INR"
        }
      }];
      console.log(`Applied ${percent}% discount (â‚¹${discountAmount/100}) for first month only`);
    }
    
    const subscription = await razorpay.subscriptions.create(subscriptionData);

    console.log("Subscription created successfully:", subscription.id);
    return res.json(subscription);
  } catch (err) {
    console.error("Razorpay subscription error:", err);
    console.error("Error details:", {
      message: err.message,
      statusCode: err.statusCode,
      error: err.error,
    });
    return res.status(500).json({
      message: "Failed to create subscription",
      error: err.message,
      details: err.error?.description || err.error?.reason || "Unknown error"
    });
  }
});

/**
 * SECURE server-side Razorpay payment verification.
 *
 * This is the ONLY trusted path that grants Pro / adds credits. The client
 * checkout handler must call this with the signed fields Razorpay returns;
 * the server validates the HMAC signature with the secret key and only then
 * mutates the user's plan via the Admin SDK. This closes the payment-bypass
 * where the client wrote `plan: "pro"` directly to Firestore with no proof of
 * payment. Requires a valid Firebase ID token so a user can only upgrade
 * THEIR OWN account.
 */
app.post("/api/razorpay/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ message: "Unauthorized" });
    const decoded = await verifyAuthToken(idToken);
    if (!decoded?.uid) return res.status(401).json({ message: "Invalid token" });

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(500).json({ message: "Razorpay not configured" });
    if (!adminDb) return res.status(500).json({ message: "DB not ready" });

    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment fields" });
    }

    // Signature formula differs by flow:
    //   subscriptions: HMAC(payment_id + '|' + subscription_id)
    //   orders:        HMAC(order_id  + '|' + payment_id)
    let expected;
    if (razorpay_subscription_id) {
      expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest("hex");
    } else if (razorpay_order_id) {
      expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
    } else {
      return res.status(400).json({ message: "Missing subscription or order id" });
    }

    if (!safeEqualHex(expected, razorpay_signature)) {
      await recordPaymentEvent({
        gateway: "razorpay",
        type: "verify_failed_signature",
        userId: decoded.uid,
        paymentId: razorpay_payment_id,
        subscriptionId: razorpay_subscription_id || null,
        orderId: razorpay_order_id || null,
      });
      return res.status(400).json({ message: "Signature verification failed" });
    }

    // Replay protection: a single Razorpay payment may only ever be applied
    // once. Without this, a user could re-POST the same valid signature to a
    // paid credit order repeatedly and stack credits (the order stays "paid"
    // forever). Marked atomically BEFORE mutating; cleared in catch on failure
    // so a genuine error can be retried.
    if (await isDuplicateWebhookEvent("rzp_verify", razorpay_payment_id)) {
      return res.json({ success: true, deduped: true });
    }

    const nowIso = new Date().toISOString();
    const userRef = adminDb.collection("users").doc(decoded.uid);

    if (razorpay_subscription_id) {
      // Subscription purchase → grant Pro and establish the subscription→user
      // mapping that the webhook relies on for renewals/cancellations.
      await userRef.set(
        {
          ...PRO_PLAN_GRANT,
          creditsResetDate: nowIso,
          subscriptionId: razorpay_subscription_id,
          razorpaySubscriptionId: razorpay_subscription_id,
          paymentGateway: "razorpay",
          subscriptionStatus: "active",
          cancelAtPeriodEnd: false,
          subscriptionCreatedAt: nowIso,
          lastPaymentId: razorpay_payment_id,
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      await recordPaymentEvent({
        gateway: "razorpay",
        type: "verify_success_subscription",
        userId: decoded.uid,
        paymentId: razorpay_payment_id,
        subscriptionId: razorpay_subscription_id,
      });
      return res.json({ success: true, type: "subscription" });
    }

    // One-time order: credit pack. The credit amount is read from the ORDER's
    // server-side notes (set at order creation), NOT from the client body —
    // otherwise a user could claim arbitrary credits for a small payment.
    let creditsToAdd = 0;
    try {
      const razorpay = getRazorpay();
      if (razorpay && razorpay_order_id) {
        const order = await razorpay.orders.fetch(razorpay_order_id);
        // Defence in depth: confirm the order is actually paid.
        if (order?.status && order.status !== "paid") {
          // Release the replay marker so a retry after settlement can proceed.
          await clearWebhookEvent("rzp_verify", razorpay_payment_id);
          return res.status(400).json({ message: "Order not paid" });
        }
        creditsToAdd = Math.max(0, Number(order?.notes?.credits) || 0);
      }
    } catch (e) {
      console.error("Failed to fetch order for credit verification:", e.message);
      return res.status(502).json({ message: "Could not verify order with gateway" });
    }
    if (creditsToAdd > 0) {
      const snap = await userRef.get();
      const data = snap.exists ? snap.data() : {};
      const now = Date.now();
      const currentAddon = Number(data?.addonCredits || 0) || 0;
      const currentExpiry = data?.addonCreditsExpiryAt;
      const isCurrentValid = currentExpiry
        ? new Date(String(currentExpiry)).getTime() > now
        : false;
      const nextAddon = (isCurrentValid ? currentAddon : 0) + creditsToAdd;
      const expiry = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      await userRef.set(
        {
          addonCredits: nextAddon,
          addonCreditsExpiryAt: expiry,
          creditsUpdatedAt: nowIso,
          lastPaymentId: razorpay_payment_id,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }
    await recordPaymentEvent({
      gateway: "razorpay",
      type: "verify_success_order",
      userId: decoded.uid,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      credits: creditsToAdd || null,
    });
    return res.json({ success: true, type: "order" });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    // Release the replay marker so the client can safely retry a failed verify.
    if (req.body?.razorpay_payment_id) {
      await clearWebhookEvent("rzp_verify", req.body.razorpay_payment_id);
    }
    return res.status(500).json({ message: "Verification failed" });
  }
});

/**
 * Cancel the authenticated user's subscription AT THE END OF THE CURRENT
 * BILLING CYCLE. The customer keeps the Pro access they already paid for until
 * the period ends, but no further charge is taken. When the gateway actually
 * ends the subscription at cycle end, the webhook downgrades the account to
 * Free. If there is no gateway subscription (e.g. an admin-granted plan), we
 * downgrade immediately. Requires a Firebase ID token; a user can only cancel
 * their OWN subscription.
 */
app.post("/api/subscription/cancel", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ message: "Unauthorized" });
    const decoded = await verifyAuthToken(idToken);
    if (!decoded?.uid) return res.status(401).json({ message: "Invalid token" });
    if (!adminDb) return res.status(500).json({ message: "DB not ready" });

    const userRef = adminDb.collection("users").doc(decoded.uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ message: "User not found" });
    const data = snap.data() || {};

    const nowIso = new Date().toISOString();
    const razorpaySubId = data.razorpaySubscriptionId || data.subscriptionId || null;
    const stripeSubId = data.stripeSubscriptionId || null;
    let gatewayScheduled = false;
    let periodEndIso = data.subscriptionCurrentPeriodEnd || null;
    const errors = [];

    // Razorpay: cancel_at_cycle_end = true (1) → stays active until period end,
    // no next charge. Second arg `true` schedules cancellation at cycle end.
    if (razorpaySubId) {
      try {
        const razorpay = getRazorpay();
        if (razorpay) {
          await razorpay.subscriptions.cancel(razorpaySubId, true);
          gatewayScheduled = true;
          // Refresh the real period end so we show the correct access-until date.
          try {
            const sub = await razorpay.subscriptions.fetch(razorpaySubId);
            if (sub?.current_end) periodEndIso = new Date(sub.current_end * 1000).toISOString();
          } catch (_) { /* non-fatal */ }
        }
      } catch (e) {
        const msg = e?.error?.description || e?.message || "";
        // Already cancelled / not active → nothing more to schedule.
        if (/cancel|not.*active|already/i.test(msg)) gatewayScheduled = true;
        else errors.push(`razorpay: ${msg}`);
      }
    }

    // Stripe: set cancel_at_period_end so access continues to the period end.
    if (stripeSubId) {
      try {
        const stripe = getStripe();
        if (stripe) {
          const sub = await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
          gatewayScheduled = true;
          if (sub?.current_period_end) periodEndIso = new Date(sub.current_period_end * 1000).toISOString();
        }
      } catch (e) {
        const msg = e?.message || "";
        if (/cancel|no such|already/i.test(msg)) gatewayScheduled = true;
        else errors.push(`stripe: ${msg}`);
      }
    }

    // If a gateway cancel was attempted and genuinely failed, surface the error
    // and change nothing — otherwise we'd mislead the user about their billing.
    if ((razorpaySubId || stripeSubId) && !gatewayScheduled && errors.length) {
      return res.status(502).json({ message: "Could not cancel at payment gateway", errors });
    }

    if (razorpaySubId || stripeSubId) {
      // Keep Pro ACTIVE until the period ends; just flag the pending cancel.
      // The webhook (subscription.cancelled/completed/deleted) performs the
      // actual downgrade when the gateway ends the subscription at cycle end.
      await userRef.set(
        {
          subscriptionStatus: "active",
          cancelAtPeriodEnd: true,
          ...(periodEndIso ? { subscriptionCurrentPeriodEnd: periodEndIso } : {}),
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      await recordPaymentEvent({
        gateway: razorpaySubId ? "razorpay" : "stripe",
        type: "user_cancel_scheduled",
        userId: decoded.uid,
        subscriptionId: razorpaySubId || stripeSubId || null,
        accessUntil: periodEndIso || null,
      });
      return res.json({ success: true, cancelAtPeriodEnd: true, accessUntil: periodEndIso || null });
    }

    // No gateway subscription (e.g. admin-granted Pro): downgrade immediately.
    await userRef.set(
      {
        ...FREE_PLAN_DOWNGRADE,
        subscriptionStatus: "cancelled",
        cancelAtPeriodEnd: false,
        subscriptionUpdatedAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    await recordPaymentEvent({
      gateway: "none",
      type: "user_cancelled_immediate",
      userId: decoded.uid,
      subscriptionId: null,
    });
    return res.json({ success: true, cancelAtPeriodEnd: false });
  } catch (err) {
    console.error("Subscription cancel error:", err);
    return res.status(500).json({ message: "Cancellation failed" });
  }
});

app.post("/api/auth/send-verification", async (req, res) => {
  try {
    const { email, continueUrl } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email is required" });

    if (!admin.apps.length) {
      return res.status(500).json({ message: "Firebase admin not initialized" });
    }

    const link = await admin.auth().generateEmailVerificationLink(String(email), {
      url: String(continueUrl || process.env.CLIENT_URL || "http://localhost:5173"),
      handleCodeInApp: false,
    });

    await sendBrevoEmail({
      to: String(email),
      subject: "Verify your email",
      html: `
        <h2>Welcome to CorrectNow</h2>
        <p>Please verify your email address to activate your account:</p>
        <p><a href="${link}">Verify Email</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Send verification error:", err);
    return res.status(500).json({ message: "Failed to send verification email" });
  }
});

app.post("/api/auth/send-password-reset", async (req, res) => {
  try {
    const { email, continueUrl } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email is required" });

    if (!admin.apps.length) {
      return res.status(500).json({ message: "Firebase admin not initialized" });
    }

    const link = await admin.auth().generatePasswordResetLink(String(email), {
      url: String(continueUrl || process.env.CLIENT_URL || "http://localhost:5173"),
      handleCodeInApp: false,
    });

    await sendBrevoEmail({
      to: String(email),
      subject: "Reset your password",
      html: `
        <h2>Reset your password</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${link}">Reset Password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Send reset error:", err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
});

// Contact form endpoint
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required" });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Prepare email content
    const emailSubject = subject?.trim() 
      ? `Contact Form: ${subject}` 
      : "New Contact Form Submission";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">
          New Contact Form Submission
        </h2>
        <div style="margin: 20px 0;">
          <p style="margin: 10px 0;"><strong>From:</strong> ${name}</p>
          <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
          ${subject ? `<p style="margin: 10px 0;"><strong>Subject:</strong> ${subject}</p>` : ''}
        </div>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Message:</strong></p>
          <p style="margin: 10px 0; white-space: pre-wrap;">${message}</p>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
          <p>This message was sent via the CorrectNow contact form.</p>
          <p>Reply to: ${email}</p>
        </div>
      </div>
    `;

    // Send email using Brevo
    await sendBrevoEmail({
      to: "info@correctnow.app",
      subject: emailSubject,
      html: emailHtml,
    });

    return res.json({ 
      success: true, 
      message: "Your message has been sent successfully" 
    });

  } catch (err) {
    console.error("Contact form error:", err);
    return res.status(500).json({ 
      error: "Failed to send message. Please try again or email us directly at info@correctnow.app" 
    });
  }
});

app.get("/api/stripe/config", (_req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return res.status(500).json({ message: "Missing STRIPE_PUBLISHABLE_KEY" });
  }
  return res.json({ publishableKey });
});

app.get("/api/coupons/validate", async (req, res) => {
  try {
    const code = String(req.query?.code || "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ message: "Coupon code required" });
    }
    if (!adminDb) {
      return res.status(500).json({ message: "Admin DB not configured" });
    }
    const docSnap = await adminDb.collection("coupons").doc(code).get();
    if (!docSnap.exists) {
      return res.status(404).json({ message: "Invalid coupon code" });
    }
    const data = docSnap.data() || {};
    if (data.active === false) {
      return res.status(400).json({ message: "Coupon is inactive" });
    }
    const percent = Number(data.percent || 0);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return res.status(400).json({ message: "Invalid coupon percentage" });
    }
    return res.json({ code, percent });
  } catch (err) {
    console.error("Coupon validate error:", err);
    return res.status(500).json({ message: "Failed to validate coupon" });
  }
});

app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured" });
    }

    const { userId, userEmail, type, credits, amount, priceId, currency, couponCode, discountPercent } = req.body;
    
    if (!userId || !userEmail) {
      return res.status(400).json({ message: "User ID and email required" });
    }

    // Use the origin from the request or fallback to environment variable
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || process.env.CLIENT_URL || "http://localhost:5173";
    const clientUrl = origin.includes('localhost') ? origin : origin;

    let sessionConfig = {
      payment_method_types: ["card"],
      mode: type === "credits" ? "payment" : "subscription",
      customer_email: userEmail,
      success_url: `${clientUrl}/?payment=success`,
      cancel_url: `${clientUrl}/payment?payment=cancelled${type === "credits" ? "&mode=credits" : ""}`,
      metadata: {
        userId,
      },
    };

    if (type === "credits") {
      // One-time credit purchase
      const creditAmount = Number(amount);
      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        return res.status(400).json({ message: "Invalid credit amount" });
      }
      sessionConfig.line_items = [{
        price_data: {
          currency: String(currency || "inr").toLowerCase(),
          product_data: {
            name: `${credits || 10000} Credits Pack`,
            description: "Credits for extra checks",
          },
          unit_amount: toStripeAmount(creditAmount, currency),
        },
        quantity: 1,
      }];
      sessionConfig.metadata.type = "credits";
      sessionConfig.metadata.credits = String(credits || 10000);
    } else {
      // Subscription
      const percent = Number(discountPercent || 0);
      const baseAmount = Number(amount);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return res.status(400).json({ message: "Invalid subscription amount" });
      }

      // Always use base price - discount will be applied via Stripe coupon (first month only)
      let resolvedPriceId = priceId || process.env.STRIPE_PRICE_ID;
      
      if (!resolvedPriceId) {
        // Create a price if not configured (always use FULL amount, not discounted)
        const product = await stripe.products.create({
          name: "CorrectNow Pro",
          description: "Monthly subscription",
        });
        
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: toStripeAmount(baseAmount, currency),  // Full price
          currency: String(currency || "inr").toLowerCase(),
          recurring: { interval: "month" },
        });
        
        resolvedPriceId = price.id;
      }
      
      sessionConfig.line_items = [{
        price: resolvedPriceId,
        quantity: 1,
      }];
      
      // Apply discount as Stripe coupon (first payment only)
      if (percent > 0 && couponCode) {
        try {
          // Create or retrieve one-time coupon
          const coupon = await stripe.coupons.create({
            percent_off: percent,
            duration: 'once',  // âœ… First payment only!
            name: `${couponCode} - ${percent}% off first month`,
          });
          
          sessionConfig.discounts = [{
            coupon: coupon.id,
          }];
          
          console.log(`Applied ${percent}% discount coupon for first month only`);
        } catch (couponErr) {
          console.error("Failed to create Stripe coupon:", couponErr);
          // Continue without discount if coupon creation fails
        }
      }
      
      sessionConfig.metadata.type = "subscription";
      if (couponCode) sessionConfig.metadata.couponCode = String(couponCode);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
});

app.get("/api/models", async (_req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ListModels error:", errorText);
      
      // If location not supported, return empty models list as fallback
      if (errorText.includes("User location is not supported") || errorText.includes("FAILED_PRECONDITION")) {
        console.warn("Gemini API not available in this region for model listing");
        return res.json({ models: [] });
      }
      
      return res.status(500).json({ message: "ListModels error", details: errorText });
    }

    const data = await response.json();
    return res.json({
      models: Array.isArray(data?.models) ? data.models.map((m) => m.name) : [],
    });
  } catch (err) {
    console.error("ListModels server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/detect-language", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Text is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const model = process.env.GEMINI_DETECT_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Use a generous slice — enough signal to identify the language accurately
    // (including same-script disambiguation) without sending huge payloads.
    const sample = text.slice(0, 1200);

    const prompt = `You are an expert computational linguist. Identify the language of the TEXT, then return ONLY JSON.

Work in this exact order and FILL the evidence fields HONESTLY before deciding — the decision MUST follow the evidence:
1) "script": the writing system (e.g. Devanagari, Arabic, Cyrillic, Latin, Tamil, ...).
2) "markers": list the actual function words / grammatical endings you SEE in the text (copy real tokens from it).
3) "language": the single most likely language (full English name).
4) "confidence": integer 0-100.

Decide by VOCABULARY, GRAMMAR and MORPHOLOGY — NEVER by script alone. Same-script languages are the common trap:

DEVANAGARI — Sanskrit vs Hindi vs Marathi vs Nepali (decisive test):
• SANSKRIT if the text shows: word-final visarga ः (e.g. रामः, धर्मः, फलानि), anusvāra-heavy sandhi, verbs ending -ति/-न्ति/-ष्यति/-तु/-न्ताम् (अस्ति, भवति, गच्छति), particles च, वा, हि, तु, एव, इति, अपि, pronouns अहम्, त्वम्, सः, तत्, यत्, किम्, एषः — AND it has NONE of the Hindi/Marathi postpositions below. Classical/verse text is almost always Sanskrit.
• HINDI if it has postpositions/auxiliaries है, हैं, था, को, में, से, का, की, के, ने, और, नहीं, यह, वह, क्या.
• MARATHI if it has आहे, आहेत, नाही, मला, तू, आपण, च्या, ला, ने and frequent ळ.
• NEPALI if it has छ, छन्, हो, मा, लाई, र, हामी, गर्.
HARD RULE: If you see visarga ः endings, इति, च/वा/एव and verbs in -ति/-न्ति, and you do NOT see है/हैं/का/की/के/को/में/आहे/नाही — the language is SANSKRIT, not Hindi or Marathi.

ARABIC SCRIPT — Arabic / Persian / Urdu / Pashto: Persian است، می، که، را، این; Urdu ہے، ہیں، کے، میں، نہیں; Pashto letters ښ ګ ړ + دی، دے، چې; Arabic ال‑، في، من، على، الذي.
CYRILLIC — Ukrainian і ї є ґ; Bulgarian ъ-heavy no ы; else Russian.
LATIN — Portuguese ção/não/õ; Spanish ñ/¿/¡; Italian gli/che/è; etc.

Rules:
- Mixed text → the DOMINANT language.
- If truly undeterminable → "language":"Unknown" with low confidence.

Respond with ONLY this JSON, nothing else:
{"script":"<script>","markers":["<token>","..."],"language":"<full English name>","confidence":<0-100>}

TEXT:
"""${sample}"""`;

    const detectKey = crypto.createHash("sha256").update(sample).digest("hex");
    const cachedDetect = getCache(`detect:${detectKey}`);
    if (cachedDetect) {
      return res.json(cachedDetect);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Detect-language error:", errorText);
      if (errorText.includes("User location is not supported") || errorText.includes("FAILED_PRECONDITION")) {
        return res.json({ language: null, confidence: 0 });
      }
      return res.status(500).json({ message: "Detect-language error", details: errorText });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return res.status(500).json({ message: "Invalid detect-language response" });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ message: "Failed to parse detect-language response" });
    }

    const rawLang = typeof parsed?.language === "string" ? parsed.language.trim() : "";
    const language = rawLang && rawLang.toLowerCase() !== "unknown" ? rawLang : null;

    // Normalise confidence to an integer 0-100. Default to a sensible value if
    // the model omitted it but did return a language.
    let confidence = Number(parsed?.confidence);
    if (!Number.isFinite(confidence)) confidence = language ? 90 : 0;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const result = { language, confidence };
    setCache(`detect:${detectKey}`, result);
    return res.json(result);
  } catch (err) {
    console.error("Detect-language server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

const buildPrompt = (text, language, options = {}) => {
  const languageInstruction =
    language && language !== "auto"
      ? `Language: ${language}.`
      : "Auto-detect language.";

  const nameCorrectionsRaw = options?.nameCorrections;
  const nameCorrections = (() => {
    // Accept either { "Rajiv": "Raajiv" } or [{ from, to }, ...]
    if (Array.isArray(nameCorrectionsRaw)) {
      return nameCorrectionsRaw
        .map((x) => ({ from: String(x?.from || "").trim(), to: String(x?.to || "").trim() }))
        .filter((x) => x.from && x.to && x.from !== x.to);
    }
    if (nameCorrectionsRaw && typeof nameCorrectionsRaw === "object") {
      return Object.entries(nameCorrectionsRaw)
        .map(([from, to]) => ({ from: String(from || "").trim(), to: String(to || "").trim() }))
        .filter((x) => x.from && x.to && x.from !== x.to);
    }
    return [];
  })();

  const nameCorrectionsBlock = nameCorrections.length
    ? `
AUTHORITATIVE NAME SPELLINGS (MUST ENFORCE):
- The following name spellings are authoritative. If the input contains the "from" form, you MUST suggest the "to" form.
- This is NOT translation/transliteration; it's a strict spelling correction.
- Apply the correction consistently across the entire text.

Name corrections list:
${nameCorrections.map((p) => `- ${p.from} -> ${p.to}`).join("\n")}
`
    : "";

  return `You are a World-Class Linguistic Expert for CorrectNow.app. Your mission is to fix grammar and spelling with NEWS-GRADE precision.

STRICT INSTRUCTIONS:
1) NO FACT CHANGES: Never alter factual meaning, numbers, dates, or claims.
2) EDUCATIONAL EXPLANATIONS: Provide a brief professional reason for each fix (8-14 words).
   - Avoid confusing symbols like '+' in explanations.
   - Explanation language must match the input language.
3) NO HALLUCINATION: If you don't recognize a specific noun/entity, assume it's correct.

PROPER NOUNS / NAMES (CRITICAL):
- Identify proper nouns (people, places, parties, brands, organizations) and protect them.
- Do NOT translate/transliterate names.
- Do NOT "normalize" name spellings just because you prefer another spelling.
- EXCEPTION (allowed and required): If a proper noun is clearly misspelled (a typo) OR an authoritative name correction list is provided, you MUST suggest the corrected spelling.
  Example typo: "naesh" -> "naresh" (typo correction, not translation).
${nameCorrectionsBlock}

---

You are the World's Most Advanced AI Proofreader, comparable to Grammarly Premium.

CORE MISSION:
- Analyze the provided text and return a flawless, professional-grade version.
- Improve readability WITHOUT changing original intent or meaning.
- Be strict about grammar, spelling/typos, native fluency, and punctuation.

Focus on:
1. PERFECT GRAMMAR: Fix syntax, tense, and subject-verb agreement errors.
2. SPELLING & TYPOS: Identify and correct subtle spelling mistakes.
3. NATIVE FLUENCY: Make it sound natural to a native speaker.
4. PUNCTUATION: Fix missing/mismatched quotes, brackets, commas.
5. CONTEXTUAL FLOW: Improve flow while preserving meaning.

PROPER NOUNS / NAMES (CRITICAL, NEWS-GRADE):
- Identify proper nouns (people, places, parties, brands, orgs) and preserve them.
- BUT: If a proper noun is clearly misspelled (a typo), you MUST suggest the corrected spelling.
  Example: "naesh" â†’ "naresh" (typo correction, not translation).
- Never translate/transliterate names. Keep the same script and casing style.
- If you are NOT confident it is a misspelling, do NOT change it.

SPECIFIC FOR TAMIL:
- Strictly follow 'Valinam Migum/Miga' (à®µà®²à®¿à®©à®®à¯ à®®à®¿à®•à¯à®®à¯) rules. This is the HIGHEST PRIORITY for Tamil.
- VALINAM MIGUM RULES (MANDATORY - Apply to ALL hard consonants: à®•à¯, à®šà¯, à®¤à¯, à®ªà¯):
  * After words ending in vowels/à®’à®±à¯à®±à¯ when followed by words starting with à®•, à®š, à®¤, à®ª:
    - "à®šà¯†à®¯à¯à®µà®¤à®±à¯à®•à¯ à®ªà®¤à®¿à®²à¯" â†’ "à®šà¯†à®¯à¯à®µà®¤à®±à¯à®•à¯à®ªà¯ à®ªà®¤à®¿à®²à¯" (à®ªà¯ added before à®ª)
    - "à®…à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯ à®•à¯Šà®Ÿà¯à®¤à¯à®¤à®¾à®°à¯" â†’ "à®…à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯à®•à¯ à®•à¯Šà®Ÿà¯à®¤à¯à®¤à®¾à®°à¯" (à®•à¯ added before à®•)
    - "à®‡à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯ à®šà¯Šà®²à¯à®²" â†’ "à®‡à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯à®šà¯ à®šà¯Šà®²à¯à®²" (à®šà¯ added before à®š)
    - "à®…à®¤à®±à¯à®•à¯ à®¤à®•à¯à®¨à¯à®¤" â†’ "à®…à®¤à®±à¯à®•à¯à®¤à¯ à®¤à®•à¯à®¨à¯à®¤" (à®¤à¯ added before à®¤)
  * After à®‰à®®à¯, à®†à®©, à®†à®•, à®‡à®²à¯, à® suffixes before hard consonants:
    - "à®¨à®²à¯à®²à®¤à¯à®®à¯ à®•à¯†à®Ÿà¯à®Ÿà®¤à¯à®®à¯" â†’ correct (no change needed - already has joining)
    - "à®…à®´à®•à®¾à®© à®ªà¯‚à®•à¯à®•à®³à¯" â†’ "à®…à®´à®•à®¾à®©à®ªà¯ à®ªà¯‚à®•à¯à®•à®³à¯" OR keep if contextually natural
  * CRITICAL: Words starting with "à®ª" (pa) are most commonly missed:
    - "à®Žà®©à¯à®±à¯ à®ªà¯‡à®šà®¿à®©à®¾à®°à¯" â†’ "à®Žà®©à¯à®±à¯à®ªà¯ à®ªà¯‡à®šà®¿à®©à®¾à®°à¯" (add à®ªà¯ before à®ª after à®±à¯)
    - "à®®à®•à¯à®•à®³à¯à®•à¯à®•à¯ à®ªà®¯à®©à¯" â†’ "à®®à®•à¯à®•à®³à¯à®•à¯à®•à¯à®ªà¯ à®ªà®¯à®©à¯" (add à®ªà¯ before à®ª after à®•à¯)
    - "à®…à®µà®°à¯à®•à¯à®•à¯ à®ªà®¿à®Ÿà®¿à®•à¯à®•à¯à®®à¯" â†’ "à®…à®µà®°à¯à®•à¯à®•à¯à®ªà¯ à®ªà®¿à®Ÿà®¿à®•à¯à®•à¯à®®à¯"
  * After à®šà¯Šà®²à¯à®²à®¿, à®•à¯Šà®£à¯à®Ÿà¯, à®µà®¨à¯à®¤à¯, à®šà¯†à®©à¯à®±à¯, etc. before à®•, à®š, à®¤, à®ª words.
- Fix run-on words (Otrumizhal) (e.g., 'à®‡à®©à¯à®©à¯à®®à¯à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®•' -> 'à®‡à®©à¯à®©à¯à®®à¯ à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®•').
- Join postpositions correctly when natural (e.g., "à®Žà®Ÿà®ªà¯à®ªà®¾à®Ÿà®¿à®¯à¯à®Ÿà®©à¯", "à®Žà®©à¯à®±à¯†à®²à¯à®²à®¾à®®à¯").
- COMMON WORD VALIDATION: Double-check frequently used words for correctness:
  * "à®Žà®¤à®¿à®°à®ªà®¾à®°à¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®•à®¿à®±à®¤à¯" (incorrect) â†’ "à®Žà®¤à®¿à®°à¯à®ªà®¾à®°à¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®•à®¿à®±à®¤à¯" (correct)
  * "à®ªà®¯à®©à¯à®ªà®Ÿà¯à®¤à¯à®•à®¿à®±à®¤à¯" (incorrect) â†’ "à®ªà®¯à®©à¯à®ªà®Ÿà¯à®¤à¯à®¤à¯à®•à®¿à®±à®¤à¯" (correct)
  * "à®¤à¯†à®°à®¿à®µà®¿à®•à¯à®•à®ªà®Ÿà¯à®Ÿà®¤à¯" (incorrect) â†’ "à®¤à¯†à®°à®¿à®µà®¿à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®Ÿà®¤à¯" (correct)
  * Pay special attention to words with compound formation and sandhi rules
- VERB FORMS: Validate passive and compound verb forms carefully
- SANDHI ACCURACY CHECK: For every word starting with à®•, à®š, à®¤, à®ª, verify whether the preceding word requires consonant doubling. When in doubt, APPLY the sandhi rule.

LOANWORD DETECTION (ALL LANGUAGES):
- If an English word is written/transliterated in a non-English script/language, provide dual options.
- In the explanation field, MUST use this exact pattern:
  "<InputLanguageName>: <input-language-form> | English: <english-word>"
- Replace <InputLanguageName> with the actual language name (e.g., Tamil, Hindi, Telugu, Arabic, Bengali, Kannada, Malayalam, etc.).
- Examples:
  * "à®ªà¯†à®©à®·à®©à¯" â†’ explanation: "Tamil: à®ªà¯†à®©à¯à®·à®©à¯ | English: pension"
  * "à¤®à¥‹à¤¬à¤¾à¤‡à¤²" â†’ explanation: "Hindi: à¤®à¥‹à¤¬à¤¾à¤‡à¤² | English: mobile"
  * "à°¸à°°à±à°µà±€à°¸à±" â†’ explanation: "Telugu: à°¸à°°à±à°µà±€à°¸à± | English: service"
- This is required for ANY language, not only Tamil.

OUTPUT FORMAT (MANDATORY):
Return ONLY a valid JSON object in this exact shape:
{
  "corrected_text": "...",
  "changes": [
    { "original": "...", "corrected": "...", "explanation": "Brief reason in the same language as input" }
  ]
}

---

You are the Senior Editor and Linguistic Engine for CorrectNow.app. Your goal is to provide flawless, professional-grade text corrections with Grammarly-level intelligence across all languages.

${languageInstruction}

UNIVERSAL LINGUISTIC RULES (Apply to ALL languages):

1. REDUNDANCY & TAUTOLOGY (Logic Check):
   - Eliminate unnecessary word repetitions and redundant phrases.
   - Examples: "return back" â†’ "return", "free gift" â†’ "gift"
   - Tamil: "A-um B-um iruvarum" â†’ Remove "iruvarum" (both + both = redundant)

2. FLOW & COHERENCE (Connector Words / Discourse Markers):
  - Improve text flow by adding missing or weak connector words BETWEEN consecutive sentences/clauses
    when the logical relationship is clear but not explicitly signposted.
  - Look for these relationships: continuation, addition, contrast, causeâ€“effect, conclusion, time sequence.
  - Suggest only when it clearly improves readability; avoid overusing connectors.
  - Preserve meaning: do NOT introduce new claims, opinions, or facts.
  - Match tone/register:
    - News/academic/formal: prefer formal connectors.
    - Casual/informal: allow conversational connectors.
  - IMPORTANT: For every connector-word suggestion, include a category label in the explanation as one of:
    Addition | Contrast | Causeâ€“Effect | Continuation
    (Map conclusion/time-sequence/continuation into Continuation when needed.)
  - Example (Tamil): "à®…à®µà®°à¯ à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®• à®µà®¿à®®à®°à¯à®šà®¿à®¤à¯à®¤à®¾à®°à¯. à®…à®µà®°à¯ à®ªà®¿à®©à¯à®©à®°à¯ à®…à®´à¯ˆà®ªà¯à®ªà¯ à®à®±à¯à®±à®¾à®°à¯." â†’
    "à®…à®µà®°à¯ à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®• à®µà®¿à®®à®°à¯à®šà®¿à®¤à¯à®¤à®¾à®°à¯. à®†à®©à®¾à®²à¯, à®…à®µà®°à¯ à®ªà®¿à®©à¯à®©à®°à¯ à®…à®´à¯ˆà®ªà¯à®ªà¯ à®à®±à¯à®±à®¾à®°à¯." (Contrast)

3. STRUCTURAL INTEGRITY (Word Joining/Splitting):
   - Fix errors where words are incorrectly merged or separated.
   - Tamil Sandhi (à®µà®²à®¿à®©à®®à¯ à®®à®¿à®•à¯à®®à¯ - HIGHEST PRIORITY):
     * "à®šà¯†à®¯à¯à®µà®¤à®±à¯à®•à¯ à®šà®®à®®à¯" â†’ "à®šà¯†à®¯à¯à®µà®¤à®±à¯à®•à¯à®šà¯ à®šà®®à®®à¯" (à®šà¯ doubling before à®š)
     * "à®…à®µà®°à¯à®•à¯à®•à¯ à®ªà®£à®®à¯" â†’ "à®…à®µà®°à¯à®•à¯à®•à¯à®ªà¯ à®ªà®£à®®à¯" (à®ªà¯ doubling before à®ª)
     * "à®‡à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯ à®¤à¯†à®°à®¿à®¯à¯à®®à¯" â†’ "à®‡à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯à®¤à¯ à®¤à¯†à®°à®¿à®¯à¯à®®à¯" (à®¤à¯ doubling before à®¤)
     * "à®Žà®©à®•à¯à®•à¯ à®•à¯Šà®Ÿà¯" â†’ "à®Žà®©à®•à¯à®•à¯à®•à¯ à®•à¯Šà®Ÿà¯" (à®•à¯ doubling before à®•)
     * Rule: After -à®•à¯, -à®¤à¯, -à®±à¯, -à®Ÿà¯ suffixes â†’ add à®ªà¯/à®•à¯/à®šà¯/à®¤à¯ before next word starting with à®ª/à®•/à®š/à®¤
     * "à®Žà®©à¯à®±à¯ à®ªà®¾à®°à¯à®¤à¯à®¤à®¾à®°à¯" â†’ "à®Žà®©à¯à®±à¯à®ªà¯ à®ªà®¾à®°à¯à®¤à¯à®¤à®¾à®°à¯" (à®ªà¯ before à®ª after à®±à¯)
     * "à®•à¯Šà®£à¯à®Ÿà¯ à®ªà¯‹à®©à®¾à®°à¯" â†’ "à®•à¯Šà®£à¯à®Ÿà¯à®ªà¯ à®ªà¯‹à®©à®¾à®°à¯" (à®ªà¯ before à®ª after à®Ÿà¯)
  - Tamil Case Endings / Postpositions: "à®Žà®Ÿà®ªà¯à®ªà®¾à®Ÿà®¿ à®‰à®Ÿà®©à¯" â†’ "à®Žà®Ÿà®ªà¯à®ªà®¾à®Ÿà®¿à®¯à¯à®Ÿà®©à¯" (join postpositions)
  - Tamil Sandhi/Clitics: "à®Žà®©à¯à®±à¯ à®Žà®²à¯à®²à®¾à®®à¯" â†’ "à®Žà®©à¯à®±à¯†à®²à¯à®²à®¾à®®à¯" (join natural clitics)
   - English: "alot" â†’ "a lot", "cannot" (keep as one word)

4. PUNCTUATION, QUOTES & TYPOGRAPHY (Be STRICT):
   - Treat punctuation and quotation correctness as critical (do NOT skip).
   - MANDATORY FIRST STEP: Count opening vs closing quotes/brackets in the ENTIRE text.
     * Count: " (opening) vs " (closing), ' vs ', ( vs ), [ vs ], { vs }
     * If counts don't match, you MUST flag it as an error.
     * Example: Text ending with stray " but no opening â†’ suggest removing it.
     * Example input: 'à®…à®µà®°à¯ à®ªà®¿à®©à¯à®©à®°à¯ à®…à®´à¯ˆà®ªà¯à®ªà¯ à®à®±à¯à®±à®¾à®°à¯."' (1 closing quote, 0 opening)
       â†’ Suggest: 'à®…à®µà®°à¯ à®ªà®¿à®©à¯à®©à®°à¯ à®…à®´à¯ˆà®ªà¯à®ªà¯ à®à®±à¯à®±à®¾à®°à¯.' (remove the unmatched ")
   - Ensure ALL quotes, parentheses, and brackets are perfectly balanced and properly nested.
   - Fix duplicated/mismatched quote marks and broken nesting.
     Examples: "''à®•à®°à¯à®£à®©à¯''" â†’ "'à®•à®°à¯à®£à®©à¯'" (avoid double-single-quote artifacts)
   - Enforce clean punctuation spacing rules:
     - No extra spaces before punctuation (",", ".", ":", ";", "?", "!")
     - Exactly one space after sentence punctuation where the language uses spaces.
     - No doubled punctuation unless stylistically required; normalize "!!", "??", "..." when inappropriate.
   - Ensure sentences have appropriate ending punctuation (missing full stop/question mark).
   - Ensure commas/colons are used correctly for apposition and lists.
     Example: "à®šà¯†à®©à¯à®©à¯ˆ:" is acceptable for dateline style; otherwise prefer "à®šà¯†à®©à¯à®©à¯ˆ -" or "à®šà¯†à®©à¯à®©à¯ˆ:" consistently.
   - Tamil-specific strictness:
     - If a sentence opens a quote, ensure it closes before attribution verb:
       "..." à®Žà®©à¯à®±à¯ à®•à¯‚à®±à®¿à®©à®¾à®°à¯ / "..." à®Žà®©à¯à®±à¯ à®ªà¯‡à®šà®¿à®©à®¾à®°à¯
     - Add comma after formal discourse markers when appropriate: "à®†à®©à®¾à®²à¯,", "à®Žà®©à®µà¯‡,", "à®®à¯‡à®²à¯à®®à¯,"
   - English-specific strictness:
     - Add comma after formal discourse markers when appropriate: "However,", "Therefore,", "Moreover,"

5. VOCABULARY VARIATION (Repetition Avoidance):
   - Identify and replace repetitive verbs/adjectives in adjacent sentences with contextually appropriate synonyms.
   - Example: If "à®ªà¯‡à®šà®¿à®¯à®¿à®°à¯à®¨à¯à®¤à®¾à®°à¯" appears twice nearby, suggest "à®µà®¿à®®à®°à¯à®šà®¿à®¤à¯à®¤à®¿à®°à¯à®¨à¯à®¤à®¾à®°à¯" for second instance.

6. GRAMMATICAL PRECISION:
   - Fix subject-verb agreement, tense inconsistencies, and case endings/suffixes.
   - Tamil Vibhakti: Ensure nouns and postpositions are joined per morphophonology rules.
  - Tamil Accusative before comparisons: If using "à®ªà¯‹à®²/à®®à®¾à®¤à®¿à®°à®¿" for comparison,
    apply the required case ending when needed.
    Example: "à®ªà®•à¯ˆà®¯à®¾à®³à®¿ à®ªà¯‹à®²" â†’ "à®ªà®•à¯ˆà®¯à®¾à®³à®¿à®¯à¯ˆà®ªà¯ à®ªà¯‹à®²" (à®-à®µà¯‡à®±à¯à®±à¯à®®à¯ˆ)
   
   ENGLISH-SPECIFIC GRAMMAR RULES (MANDATORY):
   - CAPITALIZATION: Always capitalize the pronoun "I" everywhere, including after conjunctions
     * Examples: "i went" â†’ "I went", "but i was" â†’ "but I was", "and i decided" â†’ "and I decided"
   - VERB TENSE CONSISTENCY: Maintain consistent past/present/future tense throughout
     * Past: "decide" â†’ "decided", "wakes" â†’ "woke", "miss" â†’ "missed", "telling" â†’ "told"
     * Progressive: "i feeling" â†’ "I felt", "was starting" â†’ "started" (for simple past actions)
     * Conditional/Subjunctive: When expressing hypothetical future (promises, intentions in past narrative),
       use "would" instead of "will" for consistency with past tense context
       Example: Past narrative: "I promised that I will study" â†’ "I promised that I would study"
   - ARTICLE USAGE: Use "an" before vowel sounds, "a" before consonant sounds
     * Examples: "a online" â†’ "an online", "a hour" â†’ "an hour", "a university" (correct - starts with /j/ sound)
   - INFINITIVE vs GERUND: Use "to + verb" (infinitive) for purpose, not "for + verb"
     * Examples: "for improve" â†’ "to improve", "for study" â†’ "to study"
   - SINGULAR/PLURAL AGREEMENT: Match number with quantity words
     * Examples: "many lesson" â†’ "many lessons", "one skill" â†’ "skills" (when referring to multiple)
   - AUXILIARY VERBS: Use proper helping verbs in negatives and questions
     * Examples: "i not follow" â†’ "I did not follow", "you not know" â†’ "you do not know"
   - AM/PM FORMATTING: Use proper time notation
     * Examples: "9 am" â†’ "9 a.m." or "9 AM", "3 pm" â†’ "3 p.m." or "3 PM"
   - EVERYDAY vs EVERY DAY: Distinguish adjective form from adverbial phrase
     * "everyday" (adjective) = ordinary, common: "everyday problems", "everyday life"
     * "every day" (adverb phrase) = each day, daily: "I study every day", "happens every day"
     * Examples: "I go to school everyday" â†’ "I go to school every day"
   - COMMA PLACEMENT (Critical):
     * After introductory phrases: "Last week, I decided...", "However, I promised..."
     * Before conjunctions joining independent clauses: "I was nervous, but I tried"
     * After transitional words: "Therefore, the plan...", "Moreover, he said..."
     * In lists: "tired, hungry, and upset"

7. WORD SPACING (Otrumizhal):
   - Separate run-on words and normalize spacing.
   - Tamil: "à®‡à®©à¯à®©à¯à®®à¯à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®•" â†’ "à®‡à®©à¯à®©à¯à®®à¯ à®•à®Ÿà¯à®®à¯ˆà®¯à®¾à®•"
   - Remove excessive spaces between words.

8. TYPO / SPELLING & TRUNCATION DETECTION (All languages):
  - Actively look for obvious typos, missing letters, swapped letters, and clipped words.
  - If a word looks incomplete or nonstandard in context, correct it to the most likely intended word.
  - Examples (English): "definately" â†’ "definitely", "teh" â†’ "the".
  - Examples (Tamil):
    - "à®®à®´à¯à®šà¯à®šà®¿à®¯à¯ˆà®¯à¯à®®à¯" â†’ "à®®à®•à®¿à®´à¯à®šà¯à®šà®¿à®¯à¯ˆà®¯à¯à®®à¯" (typo in common word)
    - "à®šà®¿à®±à®¨à¯ à®µà®šà®©à®®à¯" â†’ "à®šà®¿à®±à®¨à¯à®¤ à®µà®šà®©à®®à¯" (clipped adjective)
    - "à®šà®¿à®±à®¨à¯à®¤à®¤ à®ªà®Ÿà®®à¯" â†’ "à®šà®¿à®±à®¨à¯à®¤ à®ªà®Ÿà®®à¯" (remove stray suffix/extra letter)
    - "à®‡à®¤à¯ˆà®Ÿà¯à®¤à¯à®¤à¯" â†’ "à®‡à®¤à¯ˆà®¯à®Ÿà¯à®¤à¯à®¤à¯" (orthographic join)

9. LANGUAGE-SPECIFIC REFINEMENTS:
   - Tamil: Apply Valinam Migum/Miga rules (hard consonants: à®•à¯, à®šà¯, à®¤à¯, à®ªà¯) with 100% accuracy.
     * SCAN EVERY word boundary: if word N+1 starts with à®•/à®š/à®¤/à®ª, check if word N requires doubling.
     * Common suffixes that trigger doubling: -à®•à¯, -à®¤à¯, -à®±à¯, -à®Ÿà¯, -à®²à¯, -à®©à¯, -à®®à¯
     * The à®ªà¯ consonant is MOST FREQUENTLY missed by writers - be extra vigilant.
     * Examples commonly missed:
       - "à®…à®¤à®±à¯à®•à¯ à®ªà®¿à®±à®•à¯" â†’ "à®…à®¤à®±à¯à®•à¯à®ªà¯ à®ªà®¿à®±à®•à¯"
       - "à®Žà®©à¯à®ªà®¤à®±à¯à®•à¯ à®ªà®¤à®¿à®²à®¾à®•" â†’ "à®Žà®©à¯à®ªà®¤à®±à¯à®•à¯à®ªà¯ à®ªà®¤à®¿à®²à®¾à®•"
       - "à®µà®°à¯à®µà®¤à®±à¯à®•à¯ à®ªà®¤à®¿à®²à¯" â†’ "à®µà®°à¯à®µà®¤à®±à¯à®•à¯à®ªà¯ à®ªà®¤à®¿à®²à¯"
       - "à®…à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯ à®ªà¯‹à®¤à¯à®®à®¾à®©à®¤à¯" â†’ "à®…à®µà®°à¯à®•à®³à¯à®•à¯à®•à¯à®ªà¯ à®ªà¯‹à®¤à¯à®®à®¾à®©à®¤à¯"
   - English: Fix slang ("u" â†’ "you", "r" â†’ "are"), contractions, and informal texting.
   - Apply proper capitalization, sentence boundaries, and common misspellings.

10. CONTEXTUAL WORD CHOICE (Domain-appropriate wording):
  - Prefer the most natural, commonly used term in the given domain/context.
  - Do NOT invent facts; only improve word choice when meaning is preserved.
  - Tamil (politics): "à®•à¯‚à®Ÿà¯à®Ÿà¯" â†’ "à®•à¯‚à®Ÿà¯à®Ÿà®£à®¿" when referring to political alliances.
  - English collocation: "do a mistake" â†’ "make a mistake".

CRITICAL EXECUTION REQUIREMENTS:
- You MUST analyze EVERY SINGLE LINE from first to last - scan the ENTIRE text systematically.
- Do NOT stop after finding a few errors - continue processing ALL remaining lines.
- Process line by line methodically - no skipping or truncation.

PRESERVATION RULES:
- Maintain original tone and style - do NOT rewrite or add new information.
- Strictly preserve proper nouns (names of people, places, brands).
- Fix errors WITHOUT changing the intended meaning.

OUTPUT GUIDELINES:
- For each change, provide a clear, educational explanation (8-14 words) in the same language as the input.
- Explain the "Why" (à®à®©à¯?) behind major fixes to educate the user.
- If no changes needed, return original text and empty changes array.

Return ONLY valid JSON in this exact format:
{
  "corrected_text": "...",
  "changes": [
    { "original": "...", "corrected": "...", "explanation": "..." }
  ]
}

Text to analyze:
"""
${text}
"""`;
};

const parseGeminiJson = (raw) => {
  if (!raw || typeof raw !== "string") return null;

  const extractBalancedJson = (value) => {
    const text = value;
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
    return null;
  };

  const sanitize = (value) => {
    const noFence = value
      .replace(/^\uFEFF/, "")
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();

    const noControlChars = noFence.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const escapeNewlinesInStrings = (text) => {
      let out = "";
      let inString = false;
      let escapeNext = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (escapeNext) {
          out += ch;
          escapeNext = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          if (inString) escapeNext = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          out += ch;
          continue;
        }
        if (inString && (ch === "\n" || ch === "\r")) {
          out += "\\n";
          continue;
        }
        out += ch;
      }
      return out;
    };
    const escaped = escapeNewlinesInStrings(noControlChars);
    const withoutTrailingCommas = escaped.replace(/,(\s*[}\]])/g, "$1");
    return withoutTrailingCommas;
  };

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const cleaned = sanitize(raw);
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    parsed = tryParse(balanced);
    if (parsed) return parsed;
  }

  const fallbackExtract = (value) => {
    // Extract corrected_text - handle both complete and incomplete strings
    let corrected_text = "";
    const correctedMatch = value.match(/"corrected_text"\s*:\s*"([\s\S]*?)"\s*(?:,|\n|$)/);
    if (correctedMatch) {
      corrected_text = correctedMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    
    // Extract changes array - be aggressive with incomplete entries
    const changes = [];
    
    // Match complete change objects (all 3 fields present)
    const completeRegex = /"original"\s*:\s*"([\s\S]*?)"\s*,\s*"corrected"\s*:\s*"([\s\S]*?)"\s*,\s*"explanation"\s*:\s*"([\s\S]*?)"\s*[,}]/g;
    let match;
    while ((match = completeRegex.exec(value)) !== null) {
      changes.push({
        original: match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
        corrected: match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
        explanation: match[3].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      });
    }
    
    // Try to extract incomplete change objects (2 fields only - missing explanation or cut off)
    if (changes.length === 0) {
      const partialRegex = /"original"\s*:\s*"([\s\S]*?)"\s*,\s*"corrected"\s*:\s*"([\s\S]*?)"\s*(?:,|$)/g;
      let partialMatch;
      while ((partialMatch = partialRegex.exec(value)) !== null) {
        changes.push({
          original: partialMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
          corrected: partialMatch[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
          explanation: "Grammar or spelling correction",
        });
      }
    }
    
    // As last resort, try to extract at least the corrected_text by looking for the opening quote
    if (!corrected_text && !changes.length) {
      const textOnlyMatch = value.match(/"corrected_text"\s*:\s*"([\s\S]*)/);
      if (textOnlyMatch) {
        // Take everything after the opening quote, remove trailing incomplete JSON
        let extracted = textOnlyMatch[1];
        // Try to find the end quote (might not exist if truncated)
        const endQuote = extracted.indexOf('",');
        if (endQuote > -1) {
          extracted = extracted.substring(0, endQuote);
        }
        corrected_text = extracted.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    
    if (corrected_text || changes.length) {
      return { corrected_text, changes };
    }
    return null;
  };

  parsed = fallbackExtract(cleaned);
  if (parsed) return parsed;

  return null;
};

// Post-processing safety net: detect unbalanced quotes that Gemini missed
const addMissingQuoteChecks = (text, changes) => {
  const augmented = [...changes];
  
  // Count opening vs closing double quotes (straight and smart)
  const doubleQuoteOpen = (text.match(/["\u201C\u201E]/g) || []).length;
  const doubleQuoteClose = (text.match(/["\u201D]/g) || []).length;
  
  // Count opening vs closing single quotes (straight and smart)
  const singleQuoteOpen = (text.match(/['\u2018\u201A]/g) || []).length;
  const singleQuoteClose = (text.match(/['\u2019]/g) || []).length;
  
  // Check if there's already a suggestion about quotes
  const hasQuoteFix = changes.some(c => 
    c.explanation && 
    (c.explanation.includes('quote') || c.explanation.includes('à®®à¯‡à®±à¯à®•à¯‹à®³à¯') || c.explanation.includes('"'))
  );
  
  if (!hasQuoteFix) {
    // If unbalanced double quotes
    if (doubleQuoteOpen !== doubleQuoteClose) {
      const diff = doubleQuoteClose - doubleQuoteOpen;
      if (diff > 0) {
        // More closing than opening - likely stray quote at end
        const lastQuoteIdx = Math.max(
          text.lastIndexOf('"'),
          text.lastIndexOf('\u201D')
        );
        if (lastQuoteIdx > 0) {
          const contextStart = Math.max(0, lastQuoteIdx - 15);
          const contextEnd = Math.min(text.length, lastQuoteIdx + 15);
          const before = text.slice(contextStart, lastQuoteIdx);
          const quoteChar = text[lastQuoteIdx];
          const after = text.slice(lastQuoteIdx + 1, contextEnd);
          augmented.push({
            original: before + quoteChar + after,
            corrected: before + after,
            explanation: "à®®à¯‡à®±à¯à®•à¯‹à®³à¯ à®•à¯à®±à®¿ à®šà®®à®¨à®¿à®²à¯ˆà®¯à®±à¯à®±à®¤à¯; à®‡à®£à¯ˆà®¯à®±à¯à®± à®®à¯‚à®Ÿà¯à®®à¯ à®®à¯‡à®±à¯à®•à¯‹à®³à¯ à®•à¯à®±à®¿ à®…à®•à®±à¯à®±à®ªà¯à®ªà®Ÿà¯à®Ÿà®¤à¯. (Unbalanced quote removed)"
          });
        }
      }
    }
    
    // If unbalanced single quotes (only if significant count)
    if (singleQuoteOpen !== singleQuoteClose && singleQuoteOpen > 0) {
      const diff = singleQuoteClose - singleQuoteOpen;
      if (Math.abs(diff) === 1 && diff > 0) {
        const lastQuoteIdx = Math.max(
          text.lastIndexOf("'"),
          text.lastIndexOf('\u2019')
        );
        if (lastQuoteIdx > 0) {
          const contextStart = Math.max(0, lastQuoteIdx - 15);
          const contextEnd = Math.min(text.length, lastQuoteIdx + 15);
          const before = text.slice(contextStart, lastQuoteIdx);
          const quoteChar = text[lastQuoteIdx];
          const after = text.slice(lastQuoteIdx + 1, contextEnd);
          augmented.push({
            original: before + quoteChar + after,
            corrected: before + after,
            explanation: "à®’à®±à¯à®±à¯ˆ à®®à¯‡à®±à¯à®•à¯‹à®³à¯ à®•à¯à®±à®¿ à®šà®®à®¨à®¿à®²à¯ˆà®¯à®±à¯à®±à®¤à¯; à®…à®•à®±à¯à®±à®ªà¯à®ªà®Ÿà¯à®Ÿà®¤à¯. (Unbalanced single quote removed)"
          });
        }
      }
    }
  }
  
  return augmented;
};

const addTamilFallbackSuggestions = (text, changes, language) => {
  const lang = String(language || "").toLowerCase();
  const hasTamilScript = /[\u0B80-\u0BFF]/.test(String(text || ""));
  if (!hasTamilScript && lang !== "ta" && lang !== "tamil") {
    return changes;
  }

  const existingOriginals = new Set(
    (Array.isArray(changes) ? changes : [])
      .map((c) => String(c?.original || "").trim())
      .filter(Boolean)
  );

  const fallbackRules = [
    { original: "à®Žà®¤à®¿à®°à®ªà®¾à®°à¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®•à®¿à®±à®¤à¯", corrected: "à®Žà®¤à®¿à®°à¯à®ªà®¾à®°à¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®•à®¿à®±à®¤à¯", explanation: "à®Žà®´à¯à®¤à¯à®¤à¯à®ªà¯à®ªà®¿à®´à¯ˆ à®¤à®¿à®°à¯à®¤à¯à®¤à®®à¯: à®•à¯‚à®Ÿà¯à®Ÿà¯ à®µà®Ÿà®¿à®µà®¤à¯à®¤à®¿à®²à¯ 'à®ªà¯' à®šà¯‡à®°à¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®Ÿà®¤à¯." },
    { original: "à®ªà¯†à®©à®·à®©à¯", corrected: "à®ªà¯†à®©à¯à®·à®©à¯", explanation: "Tamil: à®ªà¯†à®©à¯à®·à®©à¯ | English: pension" },
    { original: "à®¹à®¾à®¸à¯à®ªà®¿à®Ÿà®²à¯", corrected: "à®¹à®¾à®¸à¯à®ªà®¿à®Ÿà¯à®Ÿà®²à¯", explanation: "Tamil: à®¹à®¾à®¸à¯à®ªà®¿à®Ÿà¯à®Ÿà®²à¯ | English: hospital" },
    { original: "à®•à®®à¯à®ªà¯à®¯à¯‚à®Ÿà¯à®Ÿà®°à¯", corrected: "à®•à®®à¯à®ªà¯à®¯à¯‚à®Ÿà¯à®Ÿà®°à¯", explanation: "Tamil: à®•à®®à¯à®ªà¯à®¯à¯‚à®Ÿà¯à®Ÿà®°à¯ | English: computer" },
    { original: "à®‡à®©à¯à®šà¯‚à®°à®©à¯à®¸à¯", corrected: "à®‡à®©à¯à®·à¯‚à®°à®©à¯à®¸à¯", explanation: "Tamil: à®‡à®©à¯à®·à¯‚à®°à®©à¯à®¸à¯ | English: insurance" },
    { original: "à®®à¯Šà®ªà¯ˆà®²à¯", corrected: "à®®à¯Šà®ªà¯ˆà®²à¯", explanation: "Tamil: à®®à¯Šà®ªà¯ˆà®²à¯ | English: mobile" },
    { original: "à®šà®°à¯à®µà¯€à®¸à¯", corrected: "à®šà®°à¯à®µà¯€à®¸à¯", explanation: "Tamil: à®šà®°à¯à®µà¯€à®¸à¯ | English: service" },
    { original: "à®šà¯†à®©à¯à®Ÿà®°à¯", corrected: "à®šà¯†à®©à¯à®Ÿà®°à¯", explanation: "Tamil: à®šà¯†à®©à¯à®Ÿà®°à¯ | English: center" },
    { original: "à®šà®°à¯à®µà¯€à®¸à¯ à®šà¯†à®©à¯à®Ÿà®°à¯", corrected: "à®šà®°à¯à®µà¯€à®¸à¯ à®šà¯†à®©à¯à®Ÿà®°à¯", explanation: "Tamil: à®šà®°à¯à®µà¯€à®¸à¯ à®šà¯†à®©à¯à®Ÿà®°à¯ | English: service center" },
  ];

  const loanwordByOriginal = new Map(
    fallbackRules
      .filter((rule) => String(rule.explanation || "").toLowerCase().includes("english:"))
      .map((rule) => [rule.original, rule])
  );

  // If Gemini already returned a mapped loanword change, force dual Tamil+English explanation.
  const normalizedExisting = (Array.isArray(changes) ? changes : []).map((change) => {
    const original = String(change?.original || "").trim();
    const mapped = loanwordByOriginal.get(original);
    if (!mapped) return change;

    const explanation = String(change?.explanation || "");
    if (/Tamil:\s*[^|]+\|\s*English:\s*.+/i.test(explanation)) {
      return change;
    }

    return {
      ...change,
      corrected: mapped.corrected,
      explanation: mapped.explanation,
    };
  });

  const augmented = [...normalizedExisting];

  for (const rule of fallbackRules) {
    if (!String(text).includes(rule.original)) continue;
    if (existingOriginals.has(rule.original)) continue;

    augmented.push({
      original: rule.original,
      corrected: rule.corrected,
      explanation: rule.explanation,
    });
    existingOriginals.add(rule.original);
  }

  return augmented;
};

/**
 * Detect punctuation/text the LLM added in corrected_text but did not enumerate
 * as a change entry. Without this, accepting suggestions one-by-one produces a
 * less-corrected result than Accept All (which uses corrected_text directly).
 *
 * Strategy: simulate applying every existing change to originalText (greedy
 * left-to-right, first occurrence per change), then diff vs corrected_text.
 * If the diff is small (<=10 chars total â€” likely punctuation), append a new
 * change entry anchored onto a real word so it has visible context.
 */
const addPunctuationDiffSuggestions = (originalText, correctedText, changes) => {
  if (
    typeof originalText !== "string" ||
    typeof correctedText !== "string" ||
    !Array.isArray(changes) ||
    !originalText ||
    !correctedText ||
    originalText === correctedText
  ) {
    return changes;
  }

  try {
    // Step 1: simulate applying every change to originalText, greedy first
    // occurrence, honoring already-consumed ranges so duplicate text resolves
    // to different positions. We track which change index each replacement
    // came from so we can later modify it in-place if needed.
    const usedRanges = []; // { start, end }
    const orderedReplacements = []; // { start, end, corrected, changeIdx }

    changes.forEach((change, changeIdx) => {
      if (!change || typeof change.original !== "string" || typeof change.corrected !== "string") return;
      if (!change.original) return;

      let searchIndex = 0;
      while (searchIndex < originalText.length) {
        const found = originalText.indexOf(change.original, searchIndex);
        if (found === -1) break;
        const start = found;
        const end = found + change.original.length;
        const overlap = usedRanges.some((r) => r.start < end && r.end > start);
        if (!overlap) {
          usedRanges.push({ start, end });
          orderedReplacements.push({ start, end, corrected: change.corrected, changeIdx });
          break;
        }
        searchIndex = found + 1;
      }
    });

    orderedReplacements.sort((a, b) => a.start - b.start);

    // Compute each replacement's position IN APPLIED, plus build `applied` text
    let applied = "";
    let cursor = 0;
    const repAppliedRanges = []; // { appliedStart, appliedEnd, changeIdx, corrected }
    for (const rep of orderedReplacements) {
      if (rep.start < cursor) continue;
      applied += originalText.slice(cursor, rep.start);
      const appliedStart = applied.length;
      applied += rep.corrected;
      const appliedEnd = applied.length;
      repAppliedRanges.push({ appliedStart, appliedEnd, changeIdx: rep.changeIdx, corrected: rep.corrected });
      cursor = rep.end;
    }
    applied += originalText.slice(cursor);

    if (applied === correctedText) return changes;

    // ---- Step 1.5: handle MISSING TRAILING PUNCTUATION first ----
    // The most common LLM omission is sentence-final punctuation (?, !, .).
    // Detect this independently of any middle-diff regions so it works even
    // when there are also other un-enumerated diffs in the middle.
    {
      const trailingPunctRe = /[.!?,;:]+$/;
      const correctedTailMatch = trailingPunctRe.exec(correctedText);
      const appliedTailMatch = trailingPunctRe.exec(applied);
      const correctedTail = correctedTailMatch ? correctedTailMatch[0] : "";
      const appliedTail = appliedTailMatch ? appliedTailMatch[0] : "";

      if (correctedTail && correctedTail !== appliedTail) {
        // Compute exactly which trailing chars are missing
        const missing = correctedTail.startsWith(appliedTail)
          ? correctedTail.substring(appliedTail.length)
          : correctedTail;

        if (missing) {
          // Find the change whose corrected text sits at the very end of applied
          // (ignoring any trailing whitespace).
          let endIgnoringSpace = applied.length;
          while (endIgnoringSpace > 0 && /\s/.test(applied[endIgnoringSpace - 1])) {
            endIgnoringSpace -= 1;
          }
          const lastRep = [...repAppliedRanges]
            .reverse()
            .find((r) => r.appliedEnd === endIgnoringSpace);

          if (lastRep) {
            const updatedChanges = changes.map((c) => ({ ...c }));
            const orig = updatedChanges[lastRep.changeIdx];
            const punctNote = `Also adds missing '${missing}' for sentence completeness.`;
            updatedChanges[lastRep.changeIdx] = {
              ...orig,
              corrected: orig.corrected + missing,
              explanation: orig.explanation
                ? `${orig.explanation} ${punctNote}`
                : punctNote,
            };
            return updatedChanges;
          }

          // Fallback: anchor on the last word of originalText (only if not
          // already an `original` of an existing change, to avoid conflicts).
          let wordEnd = originalText.length;
          while (wordEnd > 0 && /\s/.test(originalText[wordEnd - 1])) wordEnd -= 1;
          let wordStart = wordEnd;
          while (wordStart > 0 && !/\s/.test(originalText[wordStart - 1])) wordStart -= 1;
          const lastWord = originalText.substring(wordStart, wordEnd);
          if (lastWord && !changes.some((c) => c && c.original === lastWord)) {
            return [
              ...changes,
              {
                original: lastWord,
                corrected: lastWord + missing,
                explanation: `Adds missing '${missing}' at end of sentence.`,
              },
            ];
          }
        }
      }
    }

    // Step 2: find common prefix and suffix
    let prefixLen = 0;
    const minLen = Math.min(applied.length, correctedText.length);
    while (prefixLen < minLen && applied[prefixLen] === correctedText[prefixLen]) prefixLen += 1;

    let suffixLen = 0;
    while (
      suffixLen < applied.length - prefixLen &&
      suffixLen < correctedText.length - prefixLen &&
      applied[applied.length - 1 - suffixLen] === correctedText[correctedText.length - 1 - suffixLen]
    ) suffixLen += 1;

    const appliedDiff = applied.substring(prefixLen, applied.length - suffixLen);
    const correctedDiff = correctedText.substring(prefixLen, correctedText.length - suffixLen);

    // Skip large diffs (likely full LLM rewrite, not punctuation)
    if (appliedDiff.length > 10 || correctedDiff.length > 10) return changes;
    if (!appliedDiff && !correctedDiff) return changes;

    // Only handle PURE INSERTIONS (no appliedDiff to remove). Removals or
    // substitutions in the middle are risky to auto-rewrite, so leave them.
    if (appliedDiff.length !== 0) return changes;

    const insertionPos = prefixLen; // position in `applied` where chars are inserted
    const updatedChanges = changes.map((c) => ({ ...c }));

    // Case A: insertion falls at the END of an existing change's corrected text
    // â†’ append the inserted chars to that change's corrected value.
    const repBefore = repAppliedRanges.find(
      (r) => r.appliedEnd === insertionPos
    );
    if (repBefore) {
      const orig = updatedChanges[repBefore.changeIdx];
      updatedChanges[repBefore.changeIdx] = {
        ...orig,
        corrected: orig.corrected + correctedDiff,
        explanation:
          orig.explanation && /punctuation/i.test(orig.explanation)
            ? orig.explanation
            : `${orig.explanation || "Spelling correction."} Punctuation also added for clarity.`,
      };
      return updatedChanges;
    }

    // Case B: insertion falls at the START of an existing change's corrected text
    // â†’ prepend the inserted chars to that change's corrected value.
    const repAfter = repAppliedRanges.find(
      (r) => r.appliedStart === insertionPos
    );
    if (repAfter) {
      const orig = updatedChanges[repAfter.changeIdx];
      updatedChanges[repAfter.changeIdx] = {
        ...orig,
        corrected: correctedDiff + orig.corrected,
        explanation:
          orig.explanation && /punctuation/i.test(orig.explanation)
            ? orig.explanation
            : `${orig.explanation || "Spelling correction."} Punctuation also added for clarity.`,
      };
      return updatedChanges;
    }

    // Case C: insertion is at the very END of the entire text and no change
    // immediately precedes it (e.g., trailing period after unchanged text).
    // Anchor on the previous non-whitespace word in originalText.
    if (insertionPos === applied.length) {
      // Find last word boundary in originalText
      let wordEnd = originalText.length;
      while (wordEnd > 0 && /\s/.test(originalText[wordEnd - 1])) wordEnd -= 1;
      let wordStart = wordEnd;
      while (wordStart > 0 && !/\s/.test(originalText[wordStart - 1])) wordStart -= 1;
      const lastWord = originalText.substring(wordStart, wordEnd);
      if (lastWord && !changes.some((c) => c && c.original === lastWord)) {
        updatedChanges.push({
          original: lastWord,
          corrected: lastWord + correctedDiff,
          explanation: "Added missing punctuation for clarity.",
        });
        return updatedChanges;
      }
    }

    // Otherwise: don't risk an incorrect synthetic suggestion
    return changes;
  } catch (err) {
    console.warn("addPunctuationDiffSuggestions failed:", err?.message || err);
    return changes;
  }
};

/**
 * Extension: Get user statistics
 */
app.get("/api/user/stats", async (req, res) => {
  try {
    // Verify auth token
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    if (!authToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decodedToken = await verifyAuthToken(authToken);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    const userId = decodedToken.uid;
    const email = decodedToken.email;
    
    // Get user data
    const userData = await getUserData(userId);
    if (!userData) {
      // Return default for new users
      return res.json({
        userId,
        email,
        planType: 'free',
        dailyChecksUsed: 0,
        dailyLimit: 5,
        creditsRemaining: 5
      });
    }
    
    // Calculate credits
    const nowMs = Date.now();
    const planField = String(userData.plan || '').toLowerCase();
    const wordLimit = Number(userData.wordLimit) || 0;
    
    // Pro users have wordLimit >= 5,000 or plan = 'pro'
    const isPro = wordLimit >= 5000 || planField === 'pro';
    
    // Get credit information
    const creditsUsed = Number(userData.creditsUsed || 0);
    
    // Use actual credits from database, or default based on plan
    // Free users: use their actual credits (typically 5000)
    // Pro users: default to 25000 if not set
    const baseCredits = Number(userData.credits) || (isPro ? 25000 : 5000);
    
    // Handle addon credits
    const rawAddonCredits = Number(userData.addonCredits || 0);
    const addonExpiry = userData.addonCreditsExpiryAt
      ? new Date(String(userData.addonCreditsExpiryAt))
      : null;
    const addonValid = addonExpiry && !Number.isNaN(addonExpiry.getTime())
      ? addonExpiry.getTime() > nowMs
      : false;
    const validAddonCredits = addonValid && Number.isFinite(rawAddonCredits) ? rawAddonCredits : 0;
    
    // Calculate total credits
    const totalCredits = Number(baseCredits) + validAddonCredits;
    const creditsRemaining = Math.max(0, totalCredits - creditsUsed);
    
    res.json({
      userId,
      email,
      planType: isPro ? 'pro' : 'free',
      dailyChecksUsed: creditsUsed,
      dailyLimit: totalCredits,
      creditsRemaining: creditsRemaining
    });
  } catch (error) {
    console.error('âŒ Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh authentication token
app.post("/api/refresh-token", async (req, res) => {
  try {
    // Verify current auth token
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    if (!authToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decodedToken = await verifyAuthToken(authToken);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get fresh token from Firebase (this automatically extends the session)
    // The client should have the Firebase SDK get a fresh token
    // Since we're on the server, we'll return the same token but let the client know it's valid
    // In a production app, you'd use Firebase Admin SDK to create a custom token
    
    // For now, we'll just verify the token is valid and return success
    // The extension should request a new token from the website's Firebase instance
    res.json({ 
      token: authToken, // In production, generate a new token here
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error) {
    console.error('âŒ Error refreshing token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post("/api/proofread", async (req, res) => {
  try {
    const { text, language, userId: bodyUserId } = req.body || {};

    // Check for Firebase auth token (Priority 1: Logged-in users)
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    let authenticatedUser = null;
    let userId = bodyUserId;

    if (authToken) {
      // Verify Firebase token
      const decodedToken = await verifyAuthToken(authToken);
      if (decodedToken) {
        authenticatedUser = decodedToken;
        userId = decodedToken.uid;
        console.log('âœ… Authenticated user:', userId);
        
        // Get user data and check entitlements
        const userData = await getUserData(userId);
        const entitlements = getUserEntitlements(userData);
        
        console.log('ðŸ“Š User entitlements:', entitlements);
        
        // Track usage
        await incrementUsageCount(userId);
        
        // Check if user exceeded free limit (only for free users)
        if (!entitlements.isPro && entitlements.checksUsed >= entitlements.checksLimit) {
          return res.status(429).json({
            message: "Free limit reached. Upgrade to Pro for unlimited checks.",
            requiresUpgrade: true,
            plan: entitlements.plan,
            checksRemaining: 0,
            checksUsed: entitlements.checksUsed,
            checksLimit: entitlements.checksLimit
          });
        }
        
        // Set usage headers for frontend
        res.setHeader('X-Checks-Used', entitlements.checksUsed.toString());
        res.setHeader('X-Checks-Limit', entitlements.checksLimit === -1 ? 'unlimited' : entitlements.checksLimit.toString());
      } else {
        console.log('âš ï¸ Invalid auth token');
        return res.status(401).json({
          message: 'Invalid or expired auth token. Please sign in again.',
          requiresAuth: true,
          code: 'INVALID_AUTH_TOKEN',
        });
      }
    }

    // If not authenticated, check for extension API key (Priority 2: Guest users with extension)
    const extensionKey = String(
      req.headers["x-api-key"] || 
      req.headers["x-correctnow-api-key"] || 
      ""
    ).trim();
    const expectedKey = String(process.env.CORRECTNOW_EXTENSION_API_KEY || "").trim();
    const bypassFreeLimit = !!expectedKey && extensionKey === expectedKey;
    
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress;

    // Rate limiting for non-authenticated users (extension key can bypass)
    if (!authenticatedUser && !bypassFreeLimit) {
      const now = Date.now();
      const ipData = ipCheckCount.get(clientIp);
      
      // Reset if past reset time
      if (ipData && now > ipData.resetAt) {
        ipCheckCount.delete(clientIp);
      }
      
      const currentData = ipCheckCount.get(clientIp);
      
      if (currentData && currentData.count >= IP_CHECK_LIMIT) {
        return res.status(429).json({ 
          message: "Free limit reached. Please sign in to continue checking.",
          requiresAuth: true,
          checksRemaining: 0
        });
      }
      
      // Update count
      const resetAt = now + (IP_RESET_HOURS * 60 * 60 * 1000);
      ipCheckCount.set(clientIp, {
        count: (currentData?.count || 0) + 1,
        resetAt: currentData?.resetAt || resetAt
      });
      
      const checksRemaining = IP_CHECK_LIMIT - (currentData?.count || 0) - 1;
      res.setHeader('X-Checks-Remaining', checksRemaining.toString());
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Text is required" });
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length > WORD_LIMIT) {
      return res.status(400).json({ message: `Text exceeds ${WORD_LIMIT} words` });
    }

    let freeDailyContext = null;
    let creditsContext = null;
    if (userId && adminDb) {
      try {
        const userRef = adminDb.collection("users").doc(String(userId));
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const data = userSnap.data() || {};
          const planField = String(data.plan || "").toLowerCase();
          const isPro = planField === "pro" || Number(data.wordLimit) >= 5000;

          const nowMs = Date.now();
          const storedCreditsUsed = Number(data.creditsUsed || 0);
          let creditsUsed = Number.isFinite(storedCreditsUsed) ? storedCreditsUsed : 0;

          // SERVER-SIDE monthly credit reset (moved off the client, where a
          // user could zero their own usage to bypass metering). When a Pro
          // user's 30-day window has elapsed, reset the used counter here.
          if (isPro) {
            const lastResetRaw = data.creditsResetDate;
            const lastReset = lastResetRaw ? new Date(String(lastResetRaw)) : null;
            const daysSinceReset = lastReset && !Number.isNaN(lastReset.getTime())
              ? (nowMs - lastReset.getTime()) / (1000 * 60 * 60 * 24)
              : Infinity;
            if (daysSinceReset >= 30) {
              creditsUsed = 0;
              try {
                await userRef.set(
                  { creditsUsed: 0, creditsResetDate: new Date(nowMs).toISOString() },
                  { merge: true }
                );
              } catch (e) {
                console.error("Monthly credit reset failed:", e.message);
              }
            }
          }
          const baseCreditsRaw = data.credits ?? (isPro ? 25000 : 0);
          const baseCredits = Number.isFinite(Number(baseCreditsRaw)) ? Number(baseCreditsRaw) : 0;
          const rawAddonCredits = Number(data.addonCredits || 0);
          const addonExpiry = data.addonCreditsExpiryAt
            ? new Date(String(data.addonCreditsExpiryAt))
            : null;
          const addonValid = addonExpiry && !Number.isNaN(addonExpiry.getTime())
            ? addonExpiry.getTime() > nowMs
            : false;
          const validAddonCredits = addonValid && Number.isFinite(rawAddonCredits) ? rawAddonCredits : 0;
          const totalCredits = baseCredits + validAddonCredits;
          const creditsRemaining = totalCredits > 0 ? Math.max(0, totalCredits - creditsUsed) : null;
          const canSpendCredits = totalCredits > 0;

          if (!isPro) {
            const todayKey = new Date().toISOString().slice(0, 10);
            const storedDay = String(data.freeDailyDate || "");
            const storedUsed = Number(data.freeDailyUsed || 0);
            const usedToday = storedDay === todayKey ? storedUsed : 0;
            const remaining = Math.max(0, FREE_DAILY_WORD_LIMIT - usedToday);

            const ipKey = `${clientIp || "unknown"}|${todayKey}`;
            const ipEntry = freeIpWordCount.get(ipKey);
            const ipNow = Date.now();
            if (ipEntry && ipNow > ipEntry.resetAt) {
              freeIpWordCount.delete(ipKey);
            }
            const currentIp = freeIpWordCount.get(ipKey);
            const ipUsed = currentIp ? currentIp.count : 0;
            const ipRemaining = Math.max(0, FREE_DAILY_WORD_LIMIT - ipUsed);

            if (words.length > remaining || words.length > ipRemaining) {
              // After the daily free quota is exhausted, allow add-on credits to be used.
              if (canSpendCredits) {
                if (words.length > (creditsRemaining ?? 0)) {
                  res.setHeader("X-Daily-Words-Remaining", "0");
                  res.setHeader("X-Credits-Remaining", String(creditsRemaining ?? 0));
                  return res.status(429).json({
                    message: "Not enough credits. Please buy add-on credits to continue.",
                    requiresUpgrade: true,
                    dailyRemaining: 0,
                    creditsRemaining: creditsRemaining ?? 0,
                  });
                }
                creditsContext = {
                  userRef,
                  creditsUsedNext: creditsUsed + words.length,
                  creditsRemainingNext: Math.max(0, totalCredits - (creditsUsed + words.length)),
                };
                res.setHeader("X-Daily-Words-Remaining", "0");
                res.setHeader("X-Credits-Remaining", String(creditsRemaining));
              } else {
                res.setHeader("X-Daily-Words-Remaining", "0");
                return res.status(429).json({
                  message: "Daily 300 words per day for free users",
                  requiresUpgrade: true,
                  dailyRemaining: 0,
                });
              }
            } else {
              freeDailyContext = {
                userRef,
                todayKey,
                usedNext: usedToday + words.length,
                remainingNext: Math.max(0, FREE_DAILY_WORD_LIMIT - (usedToday + words.length)),
                ipKey,
                ipUsedNext: ipUsed + words.length,
              };
              res.setHeader("X-Daily-Words-Remaining", remaining.toString());
            }
          } else {
            // Pro users: enforce their credit pool if present.
            if (canSpendCredits) {
              if (words.length > (creditsRemaining ?? 0)) {
                res.setHeader("X-Credits-Remaining", String(creditsRemaining ?? 0));
                return res.status(429).json({
                  message: "Not enough credits. Please buy add-on credits to continue.",
                  requiresUpgrade: true,
                  creditsRemaining: creditsRemaining ?? 0,
                });
              }
              creditsContext = {
                userRef,
                creditsUsedNext: creditsUsed + words.length,
                creditsRemainingNext: Math.max(0, totalCredits - (creditsUsed + words.length)),
              };
              res.setHeader("X-Credits-Remaining", String(creditsRemaining));
            }
          }
        }
      } catch (error) {
        console.error("Failed to enforce free daily limit:", error);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const proofreadCacheVersion = "v5";
    const normalizedTextForCache = String(text || "").normalize("NFC").trim();
    const proofreadCacheKeyPayload = {
      v: proofreadCacheVersion,
      model,
      language: language || "auto",
      text: normalizedTextForCache,
      nameCorrections: req.body?.nameCorrections || null,
    };
    const proofreadCacheKey = `proofread:${crypto
      .createHash("sha256")
      .update(JSON.stringify(proofreadCacheKeyPayload))
      .digest("hex")}`;

    let result = getCache(proofreadCacheKey);
    if (!result) {
      const prompt = buildPrompt(text, language, {
        nameCorrections: req.body?.nameCorrections,
      });

      const adaptiveMaxTokens =
        words.length <= 80 ? 2048 :
        words.length <= 220 ? 3072 :
        words.length <= 600 ? 6144 :
        8192;
      const retryMaxTokens = Math.min(12288, adaptiveMaxTokens * 2);

      const callGemini = async (maxTokens) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0,
              topP: 0.6,
              responseMimeType: "application/json",
              maxOutputTokens: maxTokens,
            },
            systemInstruction: {
              parts: [{ text: "Return ONLY valid JSON. Analyze EVERY line of the input text thoroughly. Do not add extra text." }],
            },
          }),
        });
        return response;
      };

      let response = await callGemini(adaptiveMaxTokens);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error:", errorText);

        if (errorText.includes("User location is not supported") || errorText.includes("FAILED_PRECONDITION")) {
          return res.status(503).json({
            message: "Proofreading service is temporarily unavailable in your region. Please try again later or contact support.",
            error: "REGION_NOT_SUPPORTED"
          });
        }

        return res.status(500).json({ message: "API error" });
      }

      let data = await response.json();
      let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) {
        console.error("API response missing content:", JSON.stringify(data));
        return res.status(500).json({ message: "Invalid API response" });
      }

      let parsed = parseGeminiJson(raw);
      if (!parsed) {
        console.log(`First parse failed, retrying with ${retryMaxTokens} tokens...`);
        response = await callGemini(retryMaxTokens);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error (retry):", errorText);

          if (errorText.includes("User location is not supported") || errorText.includes("FAILED_PRECONDITION")) {
            return res.status(503).json({
              message: "Proofreading service is temporarily unavailable in your region. Please try again later or contact support.",
              error: "REGION_NOT_SUPPORTED"
            });
          }

          return res.status(500).json({ message: "API error" });
        }
        data = await response.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        parsed = parseGeminiJson(raw);
      }

      if (!parsed) {
        console.error("Failed to parse API response:", raw);
        return res.status(500).json({ message: "Failed to parse API response" });
      }

      const correctedText =
        typeof parsed.corrected_text === "string" && parsed.corrected_text.trim().length
          ? parsed.corrected_text
          : text;

      let changes = Array.isArray(parsed.changes)
        ? parsed.changes.filter((change) => {
            if (!change || typeof change !== "object") return false;
            if (typeof change.original !== "string" || change.original.length === 0) return false;
            if (typeof change.corrected !== "string") return false;
            return true;
          })
        : [];

      changes = addMissingQuoteChecks(text, changes);
      changes = addTamilFallbackSuggestions(text, changes, language);
      changes = addPunctuationDiffSuggestions(text, correctedText, changes);

      result = {
        corrected_text: correctedText,
        changes,
      };

      setCache(proofreadCacheKey, result);
    }
    if (freeDailyContext) {
      await freeDailyContext.userRef.set(
        {
          freeDailyDate: freeDailyContext.todayKey,
          freeDailyUsed: freeDailyContext.usedNext,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const resetAt = Date.now() + (IP_RESET_HOURS * 60 * 60 * 1000);
      freeIpWordCount.set(freeDailyContext.ipKey, {
        count: freeDailyContext.ipUsedNext,
        resetAt,
      });
      res.setHeader("X-Daily-Words-Remaining", String(freeDailyContext.remainingNext));
    }

    if (creditsContext) {
      await creditsContext.userRef.set(
        {
          creditsUsed: creditsContext.creditsUsedNext,
          creditsUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      res.setHeader("X-Credits-Used", String(creditsContext.creditsUsedNext));
      res.setHeader("X-Credits-Remaining", String(creditsContext.creditsRemainingNext));
    }

    // Save check history to Firestore for admin tracking
    if (adminDb && userId) {
      try {
        const userEmail = authenticatedUser?.email || '';
        await adminDb.collection("userChecks").add({
          userId: String(userId),
          userEmail: userEmail,
          text: text,
          correctedText: correctedText !== text ? correctedText : null,
          language: language || 'auto',
          wordCount: words.length,
          creditsUsed: creditsContext ? creditsContext.creditsUsedNext : words.length,
          suggestionsCount: result.changes?.length || 0,
          suggestions: result.changes || [],
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // Don't fail the request if logging fails
        console.error('Failed to save check history:', error);
      }
    }

    return res.json(result);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Serve frontend in production (or when dist exists)
if (existsSync(distPath)) {
  // Dynamic sitemap generation
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = "https://correctnow.app";
      const today = new Date().toISOString().split('T')[0];
      
      // Static pages
      const staticPages = [
        { url: '', priority: '1.0', changefreq: 'daily' }, // Homepage
        { url: 'blog', priority: '0.9', changefreq: 'daily' },
        { url: 'pricing', priority: '0.8', changefreq: 'weekly' },
        { url: 'about', priority: '0.7', changefreq: 'monthly' },
        { url: 'features', priority: '0.8', changefreq: 'weekly' },
      ];

      // Fetch all published blog posts from Firestore
      let blogUrls = [];
      if (adminDb) {
        try {
          const blogsSnapshot = await adminDb.collection('blogs')
            .orderBy('publishedAt', 'desc')
            .limit(500) // Reasonable limit for daily blogs
            .get();
          
          blogUrls = blogsSnapshot.docs
            .map(doc => {
              const data = doc.data();
              const slug = data.slug || doc.id;
              const publishedAt = data.publishedAt || data.updatedAt || data.createdAt;
              const lastmod = publishedAt ? new Date(publishedAt).toISOString().split('T')[0] : today;
              
              return {
                url: `blog/${slug}`,
                lastmod,
                priority: '0.7',
                changefreq: 'monthly'
              };
            })
            .filter(item => item.url); // Only include if slug exists
        } catch (err) {
          console.error('Error fetching blogs for sitemap:', err);
        }
      }

      // Fetch all active SEO language pages from Firestore
      let seoPageUrls = [];
      if (adminDb) {
        try {
          const seoSnapshot = await adminDb.collection('seoPages')
            .where('active', '==', true)
            .get();
          
          seoPageUrls = seoSnapshot.docs
            .map(doc => {
              const data = doc.data();
              const urlSlug = data.urlSlug || data.languageCode || doc.id;
              const updatedAt = data.updatedAt || data.createdAt;
              const lastmod = updatedAt ? new Date(updatedAt).toISOString().split('T')[0] : today;
              
              return {
                url: urlSlug,
                lastmod,
                priority: '0.9', // High priority for language pages (good for SEO)
                changefreq: 'weekly'
              };
            })
            .filter(item => item.url);
          
          console.log(`âœ“ Added ${seoPageUrls.length} active SEO language pages to sitemap`);
        } catch (err) {
          console.error('Error fetching SEO pages for sitemap:', err);
        }
      }

      // Generate XML
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${staticPages.map(page => `  <url>
    <loc>${baseUrl}/${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
${seoPageUrls.map(seoPage => `  <url>
    <loc>${baseUrl}/${seoPage.url}</loc>
    <lastmod>${seoPage.lastmod}</lastmod>
    <changefreq>${seoPage.changefreq}</changefreq>
    <priority>${seoPage.priority}</priority>
  </url>`).join('\n')}
${blogUrls.map(blog => `  <url>
    <loc>${baseUrl}/${blog.url}</loc>
    <lastmod>${blog.lastmod}</lastmod>
    <changefreq>${blog.changefreq}</changefreq>
    <priority>${blog.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error('Sitemap generation error:', error);
      // Fallback to static sitemap
      const sitemapPath = existsSync(path.join(distPath, "sitemap.xml"))
        ? path.join(distPath, "sitemap.xml")
        : path.join(publicPath, "sitemap.xml");
      return res.sendFile(sitemapPath);
    }
  });

  app.get("/robots.txt", (req, res) => {
    const robotsPath = existsSync(path.join(distPath, "robots.txt"))
      ? path.join(distPath, "robots.txt")
      : path.join(publicPath, "robots.txt");
    return res.sendFile(robotsPath);
  });

  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

// â”€â”€ Google Indexing API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/api/google-index", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const { serviceAccountJson, urls } = req.body;
    if (!serviceAccountJson || !Array.isArray(urls) || !urls.length) {
      return res.status(400).json({ error: "serviceAccountJson and urls[] are required" });
    }
    const sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    if (!sa.client_email || !sa.private_key) {
      return res.status(400).json({ error: "Invalid service account JSON (missing client_email or private_key)" });
    }
    // Build JWT
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/indexing",
    })).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;
    // Exchange JWT â†’ access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(401).json({ error: "Failed to obtain access token", details: tokenData });
    }
    // Submit URLs (max 200)
    const results = [];
    for (const url of urls.slice(0, 200)) {
      try {
        const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
          method: "POST",
          headers: { "Authorization": `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, type: "URL_UPDATED" }),
        });
        const data = await r.json();
        results.push({ url, ok: r.ok, code: r.status, message: data?.error?.message || (r.ok ? "Submitted" : "Error") });
      } catch (err) {
        results.push({ url, ok: false, code: 0, message: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error("[google-index]", err);
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ Google Indexing Status Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/api/google-index-status", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const { serviceAccountJson, urls } = req.body;
    if (!serviceAccountJson || !Array.isArray(urls) || !urls.length) {
      return res.status(400).json({ error: "serviceAccountJson and urls[] are required" });
    }
    const sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    if (!sa.client_email || !sa.private_key) {
      return res.status(400).json({ error: "Invalid service account JSON" });
    }
    // Build JWT + get access token
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email, sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
      scope: "https://www.googleapis.com/auth/indexing",
    })).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(401).json({ error: "Failed to obtain access token", details: tokenData });
    }
    // Check metadata for each URL
    const results = [];
    for (const url of urls.slice(0, 200)) {
      try {
        const r = await fetch(
          `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`,
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        const data = await r.json();
        if (r.ok && data.latestUpdate) {
          results.push({
            url,
            ok: true,
            code: r.status,
            type: data.latestUpdate.type || "URL_UPDATED",
            notifyTime: data.latestUpdate.notifyTime || null,
          });
        } else if (r.status === 404) {
          results.push({ url, ok: false, code: 404, type: null, notifyTime: null });
        } else {
          results.push({ url, ok: false, code: r.status, type: null, notifyTime: null, error: data?.error?.message });
        }
      } catch (err) {
        results.push({ url, ok: false, code: 0, type: null, notifyTime: null, error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error("[google-index-status]", err);
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ Blog Content Generator (Gemini) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/api/blog-generate", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const {
      title = "",
      keywords = "",
      tone = "informative",
      targetAudience = "everyone",
      wordCount = 800,
      extraContext = "",
      language = "English",
    } = req.body;

    if (!keywords && !title) {
      return res.status(400).json({ error: "Provide at least keywords or a title" });
    }

    const toneMap = {
      informative: "informative, educational and authoritative",
      conversational: "conversational, friendly and engaging",
      professional: "professional, formal and polished",
      storytelling: "story-driven, narrative and engaging",
      "how-to": "practical step-by-step how-to guide style",
    };
    const toneDesc = toneMap[tone] || "informative";

    const audienceMap = {
      everyone: "a general audience",
      students: "students and academics",
      professionals: "working professionals",
      writers: "writers and content creators",
      teachers: "teachers and educators",
      beginners: "beginners with no prior knowledge",
    };
    const audienceDesc = audienceMap[targetAudience] || "a general audience";

    const extraNote = extraContext.trim() ? `\nAdditional context: ${extraContext}` : "";
    const titleHint = title ? `\nTitle to use (can be improved): "${title}"` : "";

    const prompt = `You are an expert blog content writer for CorrectNow, an AI grammar checking tool that supports all languages.

Write a high-quality SEO blog post with these specifications:
- Keywords to target: ${keywords || title}
- Tone: ${toneDesc}
- Target audience: ${audienceDesc}
- Approximate word count: ${wordCount} words
- Language of the blog post: ${language}
- Website: correctnow.app${titleHint}${extraNote}

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "title": "Compelling SEO-optimised blog post title",
  "slug": "url-friendly-slug-from-title",
  "metaDescription": "SEO meta description 140-160 chars with primary keyword",
  "excerpt": "2-3 sentence engaging excerpt/summary for blog listing pages",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": "Detailed image generation prompt describing a professional blog header image that visually represents this topic (no text in image, photorealistic or illustration style)",
  "contentHtml": "Full blog post as clean HTML using these tags only: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, <a href='...' target='_blank'>. Include: intro paragraph, 4-6 sections with H2 headings, conclusion with CTA to try CorrectNow. NO inline styles. NO div tags. NO script tags."
}

CRITICAL: contentHtml must be valid embeddable HTML only. Return raw JSON only.`;

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          topP: 0.9,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
        systemInstruction: {
          parts: [{ text: "Return ONLY valid JSON. No markdown. No code blocks." }],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Gemini error", details: errText });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "Failed to parse Gemini response", raw: raw.substring(0, 500) });
    }

    res.json(parsed);
  } catch (err) {
    console.error("[blog-generate]", err);
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ Blog Image Generator (Imagen via Gemini) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/api/blog-image-generate", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const { prompt = "", style = "photorealistic" } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const styleGuide = {
      photorealistic: "photorealistic, high quality photography, professional blog header",
      illustration: "digital illustration, flat design, vibrant colors, blog header",
      "3d": "3D render, modern, clean, professional blog header",
      minimal: "minimalist design, clean, elegant, soft colors, blog header",
    }[style] || "photorealistic, high quality photography";

    const fullPrompt = `${prompt}. Style: ${styleGuide}. No text overlay. No watermarks. Wide aspect ratio 16:9. Professional blog header image.`;

    // Use Gemini 2.5 Flash image generation â€” lowest cost (~$0.039/image) on same API key
    const geminiImgEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

    const makeImageRequest = () =>
      fetch(geminiImgEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      });

    // Make 2 requests in parallel to get 2 image variants
    const [res1, res2] = await Promise.all([makeImageRequest(), makeImageRequest()]);

    const extractImage = async (r) => {
      if (!r.ok) return null;
      const d = await r.json();
      const parts = d?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData);
      if (!imgPart) return null;
      return {
        dataUrl: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
        mimeType: imgPart.inlineData.mimeType,
      };
    };

    const [img1, img2] = await Promise.all([extractImage(res1), extractImage(res2)]);
    const images = [img1, img2].filter(Boolean);

    if (!images.length) {
      const unsplashQuery = encodeURIComponent(prompt.split(" ").slice(0, 4).join(" "));
      return res.json({
        fallback: true,
        unsplashUrl: `https://source.unsplash.com/1200x630/?${unsplashQuery}`,
        unsplashSearchUrl: `https://unsplash.com/s/photos/${unsplashQuery}`,
      });
    }

    res.json({ images });
  } catch (err) {
    console.error("[blog-image-generate]", err);
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ SEO Content Generator (Gemini) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/api/seo-generate", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const {
      urlSlug = "",
      languageCode = "",
      languageName = "",
      keywords = "",
      tone = "professional",
      targetAudience = "everyone",
      extraContext = "",
    } = req.body;

    if (!urlSlug || !languageCode) {
      return res.status(400).json({ error: "urlSlug and languageCode are required" });
    }

    const toneDesc = {
      professional: "professional, authoritative and trustworthy",
      friendly: "friendly, warm and approachable",
      technical: "technical, precise and detailed",
      simple: "simple, clear and easy to understand for beginners",
    }[tone] || "professional";

    const audienceDesc = {
      everyone: "general audience of all ages and backgrounds",
      students: "students doing academic writing and assignments",
      professionals: "working professionals writing emails, reports and documents",
      writers: "writers, bloggers and content creators",
      teachers: "teachers and educators",
      "non-native speakers": "non-native speakers learning or using the language",
    }[targetAudience] || "general audience";

    const focusKeywords = keywords.trim() || `${languageName} grammar checker, ${languageName} spell check, ${languageName} proofreading, online ${languageName} grammar`;

    const extraNote = extraContext.trim() ? `\nExtra context to include: ${extraContext}` : "";

    const prompt = `You are an expert SEO content writer specialising in language-tool landing pages.

Generate SEO page content for a ${languageName} grammar checker tool with the URL slug: "${urlSlug}" on the website correctnow.app.

Requirements:
- Tone: ${toneDesc}
- Target audience: ${audienceDesc}
- Primary focus keywords: ${focusKeywords}
- The tool name is "CorrectNow"
- Every page must have unique, non-duplicate content${extraNote}

Return a JSON object with EXACTLY this structure (no markdown, no code block, raw JSON only):
{
  "variants": [
    {
      "title": "Page title â‰¤60 chars, includes primary keyword",
      "h1": "H1 heading â‰¤70 chars, unique and descriptive, reflects the slug '${urlSlug}'",
      "metaDescription": "Meta description 140-160 chars, compelling CTA, includes keyword",
      "keywords": "15-20 comma-separated SEO keywords",
      "description": "3 short paragraphs (200-300 words total) explaining the tool benefits. Plain text, no HTML tags."
    },
    {
      "title": "Alternative title â€” different wording from variant 1",
      "h1": "Alternative H1 â€” different angle from variant 1",
      "metaDescription": "Alternative meta description â€” different phrasing",
      "keywords": "Same or slightly different keyword list",
      "description": "Alternative description paragraphs â€” different structure/angle from variant 1"
    }
  ],
  "faqItems": [
    { "q": "Question 1 relevant to ${languageName} grammar checking", "a": "Concise answer 1-2 sentences" },
    { "q": "Question 2", "a": "Answer" },
    { "q": "Question 3", "a": "Answer" },
    { "q": "Question 4", "a": "Answer" },
    { "q": "Question 5", "a": "Answer" }
  ],
  "suggestedInternalLinks": [
    "Suggested related page slug 1 (e.g. english-grammar-checker)",
    "Suggested related page slug 2",
    "Suggested related page slug 3"
  ]
}

CRITICAL: The two variants must have genuinely different wording/angles. Variant 1 should focus on accuracy/correctness, Variant 2 on speed/ease-of-use. Both must be unique for Google's duplicate content detection.`;

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
        },
        systemInstruction: {
          parts: [{ text: "Return ONLY valid JSON with no markdown formatting or code blocks." }],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[seo-generate] Gemini error:", errText);
      return res.status(502).json({ error: "Gemini API error", details: errText });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[seo-generate] JSON parse failed, raw:", raw.substring(0, 500));
      return res.status(502).json({ error: "Failed to parse Gemini response as JSON", raw: raw.substring(0, 500) });
    }

    res.json(parsed);
  } catch (err) {
    console.error("[seo-generate]", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CorrectNow API running on http://localhost:${PORT}`);
});
