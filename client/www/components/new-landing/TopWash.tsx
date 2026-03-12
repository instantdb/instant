export function TopWash({
  className = 'bg-[#F8F8F8]',
}: {
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-x-0 top-0 h-[420px] overflow-hidden ${className}`}
    >
      <div className="absolute right-0 bottom-0 left-0 h-48 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}
