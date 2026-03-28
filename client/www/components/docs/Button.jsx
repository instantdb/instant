import Link from 'next/link';
import clsx from 'clsx';

const styles = {
  primary:
    'rounded-full bg-orange-600 py-2 px-4 text-sm font-semibold text-white hover:bg-orange-700 focus:outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300/50 active:bg-orange-800',
  secondary:
    'rounded-full border border-gray-200 bg-white py-2 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300/50 active:text-gray-500',
};

export function Button({ variant = 'primary', className, href, ...props }) {
  className = clsx(styles[variant], className);

  return href ? (
    <Link href={href} className={className} {...props} />
  ) : (
    <button className={className} {...props} />
  );
}
