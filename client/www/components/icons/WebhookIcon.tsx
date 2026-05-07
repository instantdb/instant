import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
  titleId?: string;
};

// Webhook icon, ported from lucide-react so it matches the heroicons
// component shape used by the dashboard sidebar.
const WebhookIcon = React.forwardRef<SVGSVGElement, IconProps>(
  function WebhookIcon({ title, titleId, ...props }, ref) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        aria-labelledby={titleId}
        ref={ref}
        {...props}
      >
        {title ? <title id={titleId}>{title}</title> : null}
        <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
        <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
        <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
      </svg>
    );
  },
);

export default WebhookIcon;
