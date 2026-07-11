import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
});

export const metadata: Metadata = {
  title: "Micro Lessons",
  description:
    "Age-ordered micro-topic lessons with quizzes. Use local or OpenAI-compatible AI when running locally.",
};

const themeBootScript = `
(function(){
  try {
    var t = localStorage.getItem('gradeschool-micro-lessons:theme')
      || localStorage.getItem('lesson-tutorials:theme');
    if (t !== 'light' && t !== 'dark') {
      t = 'dark';
    }
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={sans.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={sans.className}>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              Micro Lessons
            </Link>
            <SiteNav />
          </header>
          {children}
          <footer className="site-footer">
            <p className="site-footer-copy">
              © {new Date().getFullYear()} Kei Sakai ·{" "}
              <a
                href="https://x.com/KeiSakaiX"
                target="_blank"
                rel="noopener noreferrer"
              >
                @KeiSakaiX
              </a>
              {" · "}
              <a
                href="https://kunani.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                kunani.dev
              </a>
              {" · "}
              <a
                href="https://github.com/budezllc/os-taxonomy"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </p>
            <p className="site-footer-cite">
              Data:{" "}
              <a
                href="https://github.com/withmarbleapp/os-taxonomy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Marble Skill Taxonomy
              </a>{" "}
              (v1) · © Generative Spark, Inc. (Marble) ·{" "}
              <a
                href="https://withmarble.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                withmarble.com
              </a>{" "}
              · licensed under{" "}
              <a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                ODbL 1.0
              </a>{" "}
              (database) and CC BY-SA 4.0 (content). Authors: Guillaume
              Boniface-Chang; Generative Spark, Inc. (Marble).
            </p>
            <div className="site-footer-theme">
              <ThemeToggle variant="icon" />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
