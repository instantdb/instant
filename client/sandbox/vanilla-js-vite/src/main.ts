import './style.css';
import { User, init } from '@instantdb/core';

const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;
const db = init({
  appId: APP_ID,
});

const appEl = document.querySelector<HTMLDivElement>('#app')!;

function renderLoading() {
  appEl.innerHTML = `<div>Loading...</div>`;
}

function renderAuthError(message: string) {
  appEl.innerHTML = `<div>Uh oh! ${message}</div>`;
}

function renderLoggedInPage(user: User) {
  appEl.innerHTML = `
    <div>
      <h1>Welcome, ${user.email}!</h1>
      <button id='sign-out-button'>Sign out</button>
    </div>
  `;
  const signOutBtn =
    document.querySelector<HTMLButtonElement>('#sign-out-button')!;
  signOutBtn.addEventListener('click', () => {
    db.auth.signOut();
  });
}

function renderSignInPage() {
  const googAuthURI = db.auth.createAuthorizationURL({
    clientName: 'google-web',
    redirectURL: window.location.href,
  });
  appEl.innerHTML = `
    <div>
      Welcome to Instant's auth example:
      <h3>First and foremost, you can log in with a magic code:</h3>
      <form id='email-input-form'>
        <p>
          Enter your email, and we’ll send you a verification code.
          We'll create an account for you too if you don't already have one :)
        </p>
        <input type='email' name='email' placeholder='Email' />
        <button type='submit'>Send code</button>
      </form>
      <hr />
      <div>
        <h3>You can use google too</h3>
        <p>Just click <a href="${googAuthURI}">Sign in with Google</a> to get you started</p>
        <p>Alternatively, you can also use the Google button:</p>
        <div id="google-one-tap"></div>
      </div>
    </div>
  `;
  const formEl = document.querySelector<HTMLFormElement>('#email-input-form')!;
  formEl.email.focus();
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = formEl.email.value;
    try {
      await db.auth.sendMagicCode({ email });
    } catch (e: any) {
      alert(`Uh oh! ${e.body?.message}`);
    }
    renderMagicCodePage(email);
  });
  const nonce = crypto.randomUUID();
  window.google.accounts.id.initialize({
    client_id:
      '873926401300-t33oit5b8j5n0gl1nkk9fee6lvuiaia0.apps.googleusercontent.com',
    callback: (response: any) => {
      db.auth.signInWithIdToken({
        idToken: response.credential,
        clientName: 'google-web',
        nonce: nonce,
      });
    },
    nonce: nonce,
  });
  window.google.accounts.id.renderButton(
    document.getElementById('google-one-tap')!,
    {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      width: 300,
    },
  );
}

function renderMagicCodePage(email: string) {
  appEl.innerHTML = `
    <div>
      <form id='magic-code-form'>
        <h3>Check your email</h3>
        <p>
          We've sent a magic code to ${email}. Enter it below to sign in.
        </p>
        <input type='text' name='code' placeholder='Magic Code' />
        <button type='submit'>Verify code</button>
      </form>
    </div>
  `;
  const formEl = document.querySelector<HTMLFormElement>('#magic-code-form')!;
  formEl.code.focus();
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = formEl.code.value;
    try {
      await db.auth.signInWithMagicCode({ email, code });
    } catch (e: any) {
      alert(`Uh oh! ${e.body?.message}`);
    }
  });
}

if (!APP_ID) {
  appEl.innerHTML = `<div>
  <h1>Welcome to the vanilla-js-vite playground!</h1>
  <p>
    In order to use the playground, you need to set up a you \`.env\` file
  </p>
  <p>
    Take a look at the
    <a
      href="https://github.com/instantdb/instant/tree/main/client/sandbox/vanilla-js-vite"
    >
      <code>sandbox/vanilla-js-vite</code> README
    </a>
    to learn more
  </p>
</div>`;
} else {
  renderLoading();
  db.subscribeAuth((auth) => {
    if (auth.error) {
      renderAuthError(auth.error.message);
    } else if (auth.user) {
      renderLoggedInPage(auth.user);
    } else {
      renderSignInPage();
    }
  });
}
