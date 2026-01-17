'use client';
import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  signInAnonymously,
  RecaptchaVerifier,
  ConfirmationResult,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';

import { init, InstantReactWebDatabase } from '@instantdb/react';
import config from '../../config';

const firebaseConfig = {
  projectId: 'instant-auth-test',
  apiKey: 'AIzaSyBc5cpDTMYUFjeKSpWIfupYCZXBdFLvVvw',
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

function App({ db }: { db: InstantReactWebDatabase<any> }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  const signInWithToken = async () => {
    if (firebaseUser) {
      const idToken = await firebaseUser.getIdToken();
      db.auth.signInWithIdToken({ idToken, clientName: 'firebase' });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        user.getIdToken().then((idToken) => {
          db.auth.signInWithIdToken({ idToken, clientName: 'firebase' });
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const { isLoading, user, error } = db.useAuth();

  const handleSignOut = async () => {
    await auth.signOut();
    await db.auth.signOut();
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return (
      <div>
        <h3 className="mb-2 text-lg font-bold">
          Logged in with Firebase and Instant
        </h3>

        <div className="mb-4">
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              db.auth.signOut();
            }}
          >
            Sign out Instant only
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              auth.signOut();
            }}
          >
            Sign out Firebase only
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={handleSignOut}
          >
            Sign out both
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={signInWithToken}
          >
            Sign in to Instant again, just for fun
          </button>
        </div>

        <div className="mb-4">
          <h4 className="mb-1 font-semibold">Instant User Object:</h4>
          <pre className="rounded border bg-gray-100 p-2 text-xs">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>

        <div className="mb-4">
          <h4 className="mb-1 font-semibold">Firebase User Object:</h4>
          <pre className="rounded border bg-gray-100 p-2 text-xs">
            {JSON.stringify(firebaseUser, null, 2)}
          </pre>
        </div>
      </div>
    );
  }
  return (
    <div>
      Not logged in to Instant, logged in to Firebase.
      <div>
        <button onClick={signInWithToken}>
          Sign in to Instant with Firebase auth
        </button>
      </div>
    </div>
  );
}

function AuthForm({ db }: { db: InstantReactWebDatabase<any> }) {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+15555555555');
  const [verificationCode, setVerificationCode] = useState('555555');
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (mode === 'phone' && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',
        },
      );
    }

    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined as any;
      }
    };
  }, [mode]);

  const handleEmailAuth = async () => {
    try {
      setError('');
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePhoneSignIn = async () => {
    try {
      setError('');
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(
        auth,
        phone,
        appVerifier,
      );
      setConfirmationResult(confirmation);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerifyCode = async () => {
    try {
      setError('');
      if (confirmationResult) {
        await confirmationResult.confirm(verificationCode);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAnonymousSignIn = async () => {
    try {
      setError('');
      await signInAnonymously(auth);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (firebaseUser) {
    return <App db={db} />;
  }

  return (
    <div>
      <div id="recaptcha-container"></div>

      <h2>Sign in with Firebase</h2>

      <div>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => setMode('email')}
        >
          {mode === 'email' ? '→ ' : ''}Email
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => setMode('phone')}
        >
          {mode === 'phone' ? '→ ' : ''}Phone
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={handleAnonymousSignIn}
        >
          Anonymous
        </button>
      </div>

      {mode === 'email' && (
        <div>
          <div>
            <button
              className="m-2 bg-black p-2 text-white"
              onClick={() => setAuthMode('signin')}
            >
              {authMode === 'signin' ? '→ ' : ''}Sign In
            </button>
            <button
              className="m-2 bg-black p-2 text-white"
              onClick={() => setAuthMode('signup')}
            >
              {authMode === 'signup' ? '→ ' : ''}Sign Up
            </button>
          </div>
          <div>
            <input
              className="m-2 w-64 p-2"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <input
              className="m-2 w-64 p-2"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <button
              className="m-2 bg-black p-2 text-white"
              onClick={handleEmailAuth}
            >
              {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      )}

      {mode === 'phone' && (
        <div>
          {!confirmationResult ? (
            <>
              <div>
                <input
                  className="m-2 w-64 p-2"
                  type="tel"
                  placeholder="Phone Number (e.g., +1234567890)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="m-2 text-sm text-gray-600">
                  The prefilled 555 number will work for testing
                </div>
              </div>
              <div>
                <button
                  className="m-2 bg-black p-2 text-white"
                  onClick={handlePhoneSignIn}
                >
                  Send Verification Code
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <input
                  className="m-2 w-64 p-2"
                  type="text"
                  placeholder="Verification Code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />
                <div className="m-2 text-sm text-gray-600">
                  Use verification code: 555555
                </div>
              </div>
              <div>
                <button
                  className="m-2 bg-black p-2 text-white"
                  onClick={handleVerifyCode}
                >
                  Verify Code
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="m-2 p-2 text-red-600">Error: {error}</div>}

      <div className="mt-8 rounded border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="mb-2 font-semibold">Setup Instructions:</h3>
        <p className="mb-2 text-sm">
          Before signing in, you need to add Firebase auth to your Instant app:
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm">
          <li>
            Go to:{' '}
            <a
              href={`http://localhost:3000/dash?s=main&app=${config.appId}&t=auth`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Instant Dashboard - Auth
            </a>
          </li>
          <li>
            Add Firebase as an auth provider with project ID:{' '}
            <code className="bg-gray-200 px-1">instant-auth-test</code>
          </li>
        </ol>
      </div>
    </div>
  );
}

function Wrapper() {
  const db = init(config);

  return (
    <div style={{ margin: 40 }}>
      <AuthForm db={db} />
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}

export default Wrapper;
