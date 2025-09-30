import { useState, useEffect } from 'react';
import { init } from '@instantdb/react';
import config from '../../config';
// Import Google OAuth components
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
// Import Clerk components
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  SignInButton,
} from '@clerk/nextjs';

const db = init(config);
const { useAuth, auth } = db;

function SignInWithMagicCode() {
  const [email, setEmail] = useState('a@b.c');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');

  const handleSendCode = () => {
    setSentEmail(email);
    auth.sendMagicCode({ email }).catch((err) => {
      alert('Error: ' + err.body?.message);
      setSentEmail('');
    });
  };

  const handleVerifyCode = () => {
    auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      alert('Error: ' + err.body?.message);
      setCode('');
    });
  };

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Magic Code</span>
      </div>
      <div className="w-[500px]">
        {!sentEmail ? (
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendCode}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap"
            >
              Send code
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleVerifyCode}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Verify
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SignInAsGuest() {
  const handleSignInAsGuest = () => {
    auth.signInAsGuest().catch((err) => {
      alert('Error: ' + err.body?.message);
    });
  };

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Guest</span>
      </div>
      <div className="w-[500px]">
        <button
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          onClick={handleSignInAsGuest}
        >
          Sign in as guest
        </button>
      </div>
    </div>
  );
}

function GoogleLoginPopup() {
  const [error, setError] = useState<string | null>(null);
  const [nonce] = useState(crypto.randomUUID());
  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Google Popup</span>
      </div>
      <div className="w-[500px]">
        <GoogleOAuthProvider
          // Use your google client id
          clientId="292083552505-vvdg13drvp8sn49acmi52lcbd163jk64.apps.googleusercontent.com"
          // Include the nonce on the provider
          nonce={nonce}
        >
          <GoogleLogin
            // Include the nonce on the button
            nonce={nonce}
            locale="en"
            onSuccess={(credentialResponse) => {
              // Log in to instant with the id_token
              const idToken = credentialResponse.credential;
              if (!idToken) {
                setError('Missing id_token.');
                return;
              }
              auth
                .signInWithIdToken({
                  // Use the name you created when you registered the client
                  clientName: 'google',
                  idToken,
                  nonce,
                })
                .catch((err) => {
                  console.log(err.body);
                  alert('Uh oh: ' + err.body?.message);
                });
            }}
            onError={() => {
              setError('Login failed.');
            }}
            type="standard"
          />
          {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
        </GoogleOAuthProvider>
      </div>
    </div>
  );
}

function GoogleLoginRedirect() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    auth
      .createAuthorizationURLAsync({
        clientName: 'google',
        redirectURL: window.location.href,
      })
      .then(setUrl);
  }, []);

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Google Redirect</span>
      </div>
      <div className="w-[500px]">
        {url ? (
          <a
            href={url}
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 no-underline"
          >
            Sign in with Google Redirect
          </a>
        ) : (
          <div className="inline-block px-4 py-2 bg-gray-400 text-white rounded">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}

function LinkedInLoginRedirect() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    auth
      .createAuthorizationURLAsync({
        clientName: 'linkedin-web',
        redirectURL: window.location.href,
      })
      .then(setUrl);
  }, []);

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">LinkedIn Redirect</span>
      </div>
      <div className="w-[500px]">
        {url ? (
          <a
            href={url}
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 no-underline"
          >
            Sign in with LinkedIn
          </a>
        ) : (
          <div className="inline-block px-4 py-2 bg-gray-400 text-white rounded">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}

function loadScript(src: string, id: string, callback: () => void) {
  if (document.getElementById(id)) {
    if (callback) {
      callback();
    }
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.id = id;
  script.type = 'text/javascript';
  script.async = true;

  script.onload = () => {
    if (callback) {
      callback();
    }
  };

  script.onerror = () => {
    console.error(`Failed to load script: ${src}`);
  };

  document.body.appendChild(script);
}

async function signInApplePopup() {
  let AppleID = (window as any).AppleID;
  let nonce = crypto.randomUUID();
  let resp = await AppleID.auth.signIn({
    nonce: nonce,
    usePopup: true,
  });
  await auth.signInWithIdToken({
    clientName: 'apple',
    idToken: resp.authorization.id_token,
    nonce: nonce,
  });
}

function AppleLoginPopup() {
  useEffect(() => {
    const scriptUrl =
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    loadScript(scriptUrl, 'appleid_auth', () => {
      let AppleID = (window as any).AppleID;
      if (AppleID) {
        AppleID.auth.init({
          clientId: 'com.instantdb.signin.test',
          scope: 'name email',
          redirectURI: window.location.href,
        });
      }
    });
  }, []);

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Apple Popup</span>
      </div>
      <div className="w-[500px]">
        <button
          className="inline-block px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          style={{
            fontFamily: 'SF Pro, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
          onClick={signInApplePopup}
        >
          􀣺 Sign in with Apple Popup
        </button>
      </div>
    </div>
  );
}

function AppleLoginRedirect() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    auth
      .createAuthorizationURLAsync({
        clientName: 'apple',
        redirectURL: window.location.href,
      })
      .then(setUrl);
  }, []);

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Apple Redirect</span>
      </div>
      <div className="w-[500px]">
        {url ? (
          <a
            href={url}
            className="inline-block px-4 py-2 bg-black text-white rounded hover:bg-gray-800 no-underline"
            style={{
              fontFamily:
                'SF Pro, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            􀣺 Sign in with Apple Redirect
          </a>
        ) : (
          <div className="inline-block px-4 py-2 bg-gray-400 text-white rounded">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}

function ClerkLoginInternal() {
  const { getToken } = useClerkAuth();

  const signInWithClerk = async () => {
    try {
      const jwt = await getToken();
      if (!jwt) {
        throw new Error('No JWT token available');
      }
      await auth.signInWithIdToken({ idToken: jwt, clientName: 'clerk' });
    } catch (error) {
      console.error('Clerk sign-in error:', error);
      alert('Error signing in with Clerk: ' + (error as Error).message);
    }
  };

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Clerk</span>
      </div>
      <div className="w-[500px]">
        <ClerkSignedOut>
          <SignInButton mode="modal">
            <button className="inline-block px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
              Sign in with Clerk
            </button>
          </SignInButton>
        </ClerkSignedOut>
        <ClerkSignedIn>
          <button
            onClick={signInWithClerk}
            className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Connect Clerk to Instant
          </button>
        </ClerkSignedIn>
      </div>
    </div>
  );
}

function ClerkLogin() {
  const clerkPublishableKey =
    'pk_test_Z3Jvd24tY2FyaWJvdS04NC5jbGVyay5hY2NvdW50cy5kZXYk';

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkLoginInternal />
    </ClerkProvider>
  );
}

function UserSignIns() {
  return (
    <>
      <SignInWithMagicCode />
      <GoogleLoginPopup />
      <GoogleLoginRedirect />
      <AppleLoginPopup />
      <AppleLoginRedirect />
      <ClerkLogin />
      <LinkedInLoginRedirect />
    </>
  );
}

function SignedOut() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>

      <div className="space-y-4">
        <SignInAsGuest />
        <UserSignIns />
      </div>
    </div>
  );
}

function SignedInAsGuest({ user }: { user: any }) {
  return (
    <div className="max-w-4xl mx-auto">
      <SignedIn user={user} />

      <h2 className="text-lg font-semibold mb-4">Upgrade your account</h2>
      <div className="space-y-4">
        <UserSignIns />
      </div>
    </div>
  );
}

function SignedIn({ user }: { user: any }) {
  return (
    <div className="my-6 max-w-4xl mx-auto">
      <table className="min-w-full border mb-6">
        <tbody className="bg-white divide-y divide-gray-200">
          {Object.entries(user)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => (
              <tr key={key}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {key}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <button
        onClick={() => auth.signOut()}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Sign out
      </button>
    </div>
  );
}

function UserDashboard() {
  const { user } = useAuth();
  const isGuest = user?.type === 'guest';
  return isGuest ? <SignedInAsGuest user={user} /> : <SignedIn user={user} />;
}

function App() {
  return (
    <div>
      <db.SignedIn>
        <UserDashboard />
      </db.SignedIn>
      <db.SignedOut>
        <SignedOut />
      </db.SignedOut>
    </div>
  );
}

export default App;
