import React, { HTMLAttributes } from 'react';

export const CoolBackground: React.FC<HTMLAttributes<HTMLDivElement>> = (
  props,
) => {
  const { children, ...rest } = props;
  return (
    <div className="bg-gray-50" {...rest}>
      {children}
    </div>
  );
};
