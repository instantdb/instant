import { db } from "@/lib/db";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  ssr: false,
  loader: async () => {
    const auth = await db.getAuth();
    if (auth) {
      throw redirect({
        to: "/",
      });
    }
  },
});

function RouteComponent() {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const navigate = useNavigate();

  const sendEmail = async () => {
    await db.auth.sendMagicCode({ email: emailInput });
    setStage("code");
  };

  const loginWithCode = async () => {
    const verifyResponse = await db.auth.signInWithMagicCode({
      email: emailInput,
      code: codeInput,
    });
    if (verifyResponse.user) {
      // Timeout allows user to sync cookie with server
      setTimeout(() => {
        navigate({ to: "/" });
      }, 201);
    }
  };

  const goBack = () => {
    setStage("email");
    setCodeInput("");
  };

  return (
    <div className="font-mono pt-24 flex justify-center items-center flex-col space-y-4">
      <h2 className="tracking-wide text-5xl text-gray-700">
        {stage === "email" ? "sign in" : "enter code"}
      </h2>
      <p className="text-xs text-gray-500">
        {stage === "email"
          ? "Enter your email to receive a magic code"
          : `We sent a code to ${emailInput}`}
      </p>
      <div className="border border-gray-300 max-w-xs w-full">
        {stage === "email" ? (
          <form
            className="flex items-center h-10"
            onSubmit={(e) => {
              e.preventDefault();
              sendEmail();
            }}
          >
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="flex-1 h-full px-2 outline-none bg-transparent"
            />
            <button
              type="submit"
              disabled={!emailInput}
              className="h-full px-2 border-l border-gray-300 text-gray-600 hover:text-gray-500 disabled:hover:text-gray-300"
            >
              Send
            </button>
          </form>
        ) : (
          <>
            <form
              className="flex items-center h-10 border-b border-gray-300"
              onSubmit={(e) => {
                e.preventDefault();
                loginWithCode();
              }}
            >
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Enter your code"
                required
                autoFocus
                className="flex-1 h-full px-2 outline-none bg-transparent"
              />
              <button
                type="submit"
                disabled={!codeInput}
                className="h-full px-2 border-l border-gray-300 text-gray-600 hover:text-gray-500 disabled:hover:text-gray-300"
              >
                Submit
              </button>
            </form>
            <div className="flex justify-center items-center h-10 px-2 text-xs">
              <button
                type="button"
                onClick={goBack}
                className="text-gray-600 hover:text-gray-500"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
