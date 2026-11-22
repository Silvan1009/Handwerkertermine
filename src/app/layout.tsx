export const metadata = { title: "Handwerkertermine" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
        <h1><a href="/">Handwerkertermine</a></h1>
        {children}
      </body>
    </html>
  );
}
