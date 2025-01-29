import React from 'react';

const VercelIcon = React.forwardRef<SVGSVGElement, React.ComponentProps<'svg'>>(
  (props: React.ComponentProps<'svg'>, ref) => (
    <svg
      viewBox="0 0 1155 1150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      ref={ref}
      {...props}
    >
      <path d="M577.344 0L1154.69 1000H0L577.344 0Z" fill="black" />
    </svg>
  ),
);

export default VercelIcon;
