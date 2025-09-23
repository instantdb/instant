import { useState } from 'react';
import { init } from '@instantdb/react';
import config from '../../config';

const { useAuth, auth } = init(config);

function SignedOut() {
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
    auth
      .signInWithMagicCode({ email: sentEmail, code })
      .catch((err) => {
        alert('Error: ' + err.body?.message);
        setCode('');
      });
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>

      <div className="space-y-4">
        <button
          className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          onClick={() => {}}
        >
          Sign in as guest
        </button>

        <div className="border-t pt-4">
          {!sentEmail ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Sign in with email</h2>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendCode}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Send code
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Enter verification code</h2>
              <p className="text-sm text-gray-600">We sent a code to {sentEmail}</p>
              <input
                type="text"
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleVerifyCode}
                className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Verify
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignedIn({ user }: { user: any }) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">User Properties</h1>

      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Property
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(user).map(([key, value]) => (
              <tr key={key}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {key}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => auth.signOut()}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Sign out
      </button>
    </div>
  );
}

function App() {
  const { isLoading, user, error } = useAuth();

  if (isLoading) {
    return <div className="p-6 text-center">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">Error: {error.message}</div>;
  }

  if (user) {
    return <SignedIn user={user} />;
  }

  return <SignedOut />;
}

export default App;