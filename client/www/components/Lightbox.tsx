import { useState } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/solid';

export function Lightbox({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        onClick={() => setOpen(true)}
        style={{ cursor: 'zoom-in' }}
      />
      <Dialog open={open} onClose={() => setOpen(false)}>
        <div className="fixed inset-0 z-50 bg-black/80" aria-hidden="true" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPanel className="relative max-h-[90vh] max-w-[90vw]">
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-2 -right-2 rounded-full bg-white p-1 shadow-lg hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5 text-gray-700" />
            </button>
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] rounded-sm shadow-2xl"
            />
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
