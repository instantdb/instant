export function Loading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-2">
      <div className="rounded bg-red-100 p-4 text-red-700">{children}</div>
    </div>
  );
}
