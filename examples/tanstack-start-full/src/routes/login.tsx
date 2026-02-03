import { db } from "@/lib/db";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Welcome } from ".";

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
    <div className="p-8 grid-cols-2 gap-2 grid">
      <Welcome />
      <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col gap-4">
        <h2 className="tracking-wide text-[#F54A00] text-2xl">
          {stage === "email" ? "Sign In" : "Enter Code"}
        </h2>
        <p className="text-xs text-neutral-600">
          {stage === "email"
            ? "Enter your email to receive a magic code"
            : `We sent a code to ${emailInput}`}
        </p>
        <div className="rounded">
          {stage === "email" ? (
            <>
              <form
                className="flex items-center border border-neutral-300 h-10"
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
                  className="h-full cursor-pointer px-2 border-l border-0 border-neutral-300 text-neutral-600 hover:text-neutral-500 disabled:hover:text-neutral-300"
                >
                  Send
                </button>
              </form>
              <div className="h-10" />
            </>
          ) : (
            <>
              <form
                className="flex items-center h-10 border border-neutral-300"
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
                  className="h-full px-2 cursor-pointer border-l border-neutral-300 text-neutral-600 hover:text-neutral-500 disabled:hover:text-neutral-300"
                >
                  Submit
                </button>
              </form>
              <div className="flex justify-center items-center h-10 px-2 text-xs">
                <button
                  type="button"
                  onClick={goBack}
                  className="text-neutral-600 hover:text-neutral-500"
                >
                  Use a different email
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
