import localFont from 'next/font/local';

// Self-hosted woff2 с сабсетами latin + cyrillic (public/fonts, лицензия SIL OFL).
export const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-cyrillic.woff2', weight: '400 600' },
    { path: '../../public/fonts/inter-latin.woff2', weight: '400 600' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

export const manrope = localFont({
  src: [
    { path: '../../public/fonts/manrope-cyrillic.woff2', weight: '600 800' },
    { path: '../../public/fonts/manrope-latin.woff2', weight: '600 800' },
  ],
  variable: '--font-manrope',
  display: 'swap',
});
