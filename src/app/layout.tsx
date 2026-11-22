export const metadata = { title: "Handwerkertermine" };

// Minimal-CSS fürs Handy: große Touch-Ziele, nichts ragt über den Rand.
const css = `
  body { font-family: system-ui; max-width: 720px; margin: 1rem auto; padding: 0 1rem; line-height: 1.4 }
  input, select, textarea, button { font-size: 16px; max-width: 100%; box-sizing: border-box; margin: 2px 0 }
  button { padding: 0.4rem 0.8rem }
  textarea { width: 100% }
  .scroll { overflow-x: auto }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <style>{css}</style>
        <h1><a href="/">Handwerkertermine</a></h1>
        {children}
      </body>
    </html>
  );
}
