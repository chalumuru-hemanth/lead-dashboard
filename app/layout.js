import "./globals.css";
import { CallsProvider, EmailsProvider } from "./providers";
import Shell from "./components/Shell";

export const metadata = {
  title: "Riley · Lead Intelligence",
  description: "Live dashboard for Riley (Vapi voice agent) calls",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CallsProvider>
          <EmailsProvider>
            <Shell>{children}</Shell>
          </EmailsProvider>
        </CallsProvider>
      </body>
    </html>
  );
}
