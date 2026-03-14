import localFont from 'next/font/local';

export const switzer = localFont({
  src: [
    { path: './Switzer-Regular.woff', weight: '400', style: 'normal' },
    { path: './Switzer-Italic.woff', weight: '400', style: 'italic' },
    { path: './Switzer-Medium.woff', weight: '500', style: 'normal' },
    { path: './Switzer-MediumItalic.woff', weight: '500', style: 'italic' },
    { path: './Switzer-Semibold.woff', weight: '600', style: 'normal' },
    { path: './Switzer-SemiboldItalic.woff', weight: '600', style: 'italic' },
    { path: './Switzer-Bold.woff', weight: '700', style: 'normal' },
    { path: './Switzer-BoldItalic.woff', weight: '700', style: 'italic' },
  ],
  variable: '--font-switzer',
});
