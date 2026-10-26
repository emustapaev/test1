// Тонкий корневой layout: <html> задают [locale]/layout.tsx (с lang локали)
// и not-found.tsx (статическая /404.html).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
