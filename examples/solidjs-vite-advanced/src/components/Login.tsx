import { type Component, createSignal, Show } from "solid-js";
import { db } from "../lib/db";

const Login: Component = () => {
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [sentTo, setSentTo] = createSignal("");
  const [error, setError] = createSignal("");

  const handleSendCode = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      await db.auth.sendMagicCode({ email: email() });
      setSentTo(email());
    } catch (err: any) {
      setError(err.body?.message || err.message);
    }
  };

  const handleVerifyCode = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      await db.auth.signInWithMagicCode({
        email: sentTo(),
        code: code(),
      });
    } catch (err: any) {
      setError(err.body?.message || err.message);
    }
  };

  return (
    <div class="flex items-center justify-center min-h-screen">
      <div class="bg-white rounded-lg shadow p-6 w-full max-w-sm space-y-4">
        <h2 class="text-lg font-bold text-center">Sign in</h2>

        <Show when={error()}>
          <p class="text-red-500 text-sm">{error()}</p>
        </Show>

        <Show
          when={sentTo()}
          fallback={
            <form onSubmit={handleSendCode} class="space-y-3">
              <input
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full border rounded px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                class="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm hover:bg-blue-700 transition-colors"
              >
                Send magic code
              </button>
            </form>
          }
        >
          <form onSubmit={handleVerifyCode} class="space-y-3">
            <p class="text-sm text-gray-600">
              We sent a code to <strong>{sentTo()}</strong>
            </p>
            <input
              type="text"
              placeholder="Enter code"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
              class="w-full border rounded px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              class="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm hover:bg-blue-700 transition-colors"
            >
              Verify code
            </button>
            <button
              type="button"
              class="w-full text-sm text-gray-500 hover:text-gray-700"
              onClick={() => {
                setSentTo("");
                setCode("");
              }}
            >
              Use a different email
            </button>
          </form>
        </Show>
      </div>
    </div>
  );
};

export default Login;
