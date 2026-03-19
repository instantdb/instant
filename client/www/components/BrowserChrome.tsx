export function BrowserChrome({ url }: { url?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 border-b border-gray-200/60 px-3 py-2"
      style={{ backgroundColor: '#faf8f5' }}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-[#ddd8d0]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#ddd8d0]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#ddd8d0]" />
      <span className="ml-2 flex-1 truncate rounded-sm bg-[#f0ece6] px-2 py-0.5 text-center text-[10px] text-[#797593]">
        {url ?? '\u00A0'}
      </span>
    </div>
  );
}
