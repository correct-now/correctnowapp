// Script to create admin user with Firebase Admin SDK
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
let serviceAccount;

if (existsSync('./serviceAccountKey.json')) {
  serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Parse from environment variable (handle double-encoding)
  let jsonStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  // Strip outer quotes if present
  if ((jsonStr.startsWith("'") && jsonStr.endsWith("'")) || 
      (jsonStr.startsWith('"') && jsonStr.endsWith('"'))) {
    jsonStr = jsonStr.slice(1, -1);
  }
  
  // Replace escaped characters
  jsonStr = jsonStr.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  
  try {
    serviceAccount = JSON.parse(jsonStr);
  } catch (err) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', err.message);
    console.error('Raw value (first 100 chars):', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 100));
    process.exit(1);
  }
} else {
  console.error('❌ Firebase service account not found!');
  console.error('Please set FIREBASE_SERVICE_ACCOUNT env variable or create serviceAccountKey.json');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function createAdminUser() {
  const email = 'contentfactory14@gmail.com';
  const password = 'Admin@2026!CorrectNow';
  
  try {
    // Create user
    console.log('Creating user...');
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true,
    });
    
    console.log('✅ User created successfully!');
    console.log('User UID:', userRecord.uid);
    
    // Set custom admin claim
    console.log('Setting admin claim...');
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    
    console.log('✅ Admin claim set successfully!');
    console.log('\n================================');
    console.log('Admin Login Credentials:');
    console.log('================================');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('================================\n');
    
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('User already exists, updating password and setting admin claim...');
      
      // Get existing user
      const userRecord = await admin.auth().getUserByEmail(email);
      
      // Update password
      await admin.auth().updateUser(userRecord.uid, {
        password: password,
        emailVerified: true
      });
      
      console.log('✅ Password updated successfully!');
      
      // Set custom admin claim
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
      
      console.log('✅ Admin claim set successfully!');
      console.log('\n================================');
      console.log('Admin Login Credentials:');
      console.log('================================');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('================================\n');
      
      process.exit(0);
    } else {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

createAdminUser();
