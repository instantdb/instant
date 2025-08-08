import { init } from '@instantdb/react';
import config from '../../config';
import { useState } from 'react';

const db = init({ ...config });

const RequiresAuth = () => {
  const user = db.useUser();
  return (
    <div style={{ background: '#a6ffbe' }}>
      <div>This view requires auth</div>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
};

function App() {
  const [codeInput, setCodeInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const loginWithCode = () => {
    db.auth.signInWithMagicCode({
      email: emailInput,
      code: codeInput,
    });
  };

  const sendEmail = () => {
    db.auth.sendMagicCode({
      email: emailInput,
    });
  };

  const signOut = () => {
    db.auth.signOut();
  };

  const auth = db.useAuth();

  return (
    <div className="">
      <div className="flex gap-2">
        <input
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="Email"
        />
        <button onClick={sendEmail}>Send Email</button>
      </div>
      <div className="flex gap-2">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Code"
        />
        <button onClick={loginWithCode}>Login with Code</button>
      </div>
      <div className="flex gap-2">
        <button onClick={signOut}>Sign Out</button>
      </div>

      <pre>{JSON.stringify(auth, null, 2)}</pre>

      <db.SignedIn>
        <RequiresAuth />
      </db.SignedIn>

      <db.SignedOut>User Is signed out</db.SignedOut>
    </div>
  );
}

export default App;
