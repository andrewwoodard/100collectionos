// WebAuthn helpers for biometric login (Face ID / Touch ID / Windows Hello / fingerprint).
//
// NOTE on security model: Base44 owns the auth backend, so biometric here is a
// device unlock gate on top of an existing platform session — enrollment is
// stored on the user profile, and on return visits the platform authenticator
// (which requires Face ID / fingerprint to unlock) gates entry to the app.

export function isWebAuthnSupported() {
  return (
    typeof window !== "undefined" &&
    window.PublicKeyCredential !== undefined &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials !== "undefined"
  );
}

export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function detectDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPod/i.test(ua)) return "iPod touch";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "This device";
}

// Enroll the current device's platform authenticator.
// Returns a credential descriptor to store on the user profile.
export async function enrollBiometric(userLabel = "user") {
  if (!isWebAuthnSupported()) {
    throw new Error("Biometric authentication is not supported in this browser.");
  }

  const available = await isPlatformAuthenticatorAvailable();
  if (!available) {
    throw new Error(
      "No Face ID / fingerprint sensor found on this device. Biometric login works on devices with a platform authenticator (Touch ID, Face ID, Windows Hello, or Android fingerprint)."
    );
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(32));

  const publicKey = {
    challenge,
    rp: { name: "The 100 Collection" },
    user: {
      id: userId,
      name: userLabel,
      displayName: userLabel,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error("Biometric enrollment was cancelled or failed.");

  return {
    id: credential.id,
    deviceLabel: detectDeviceLabel(),
    createdAt: new Date().toISOString(),
  };
}

// Prompt the user to verify with Face ID / fingerprint on an enrolled device.
export async function verifyBiometric(credentialId) {
  if (!isWebAuthnSupported()) {
    throw new Error("Biometric authentication is not supported in this browser.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = {
    challenge,
    timeout: 60000,
    userVerification: "required",
    allowCredentials: [
      {
        type: "public-key",
        id: base64urlToBuffer(credentialId),
      },
    ],
  };

  const assertion = await navigator.credentials.get({ publicKey, mediation: "required" });
  return !!assertion;
}

export function storageKeyFor(userId) {
  return `biometric_cred_${userId}`;
}