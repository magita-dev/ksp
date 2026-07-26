import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "KRIME AI | K.P. Intelligence Portal",
  description: "Karnataka State Police Criminal Records Intelligence & Management Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <script
          id="tailwind-config"
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: "class",
                theme: {
                  extend: {
                    colors: {
                      "primary": "#b3c5ff",
                      "outline-variant": "#444650",
                      "on-tertiary-container": "#ff524c",
                      "tertiary-container": "#5a0006",
                      "on-surface-variant": "#c5c6d2",
                      "on-secondary-fixed": "#221b00",
                      "error-container": "#93000a",
                      "surface-tint": "#b3c5ff",
                      "on-tertiary-fixed": "#410003",
                      "on-secondary-container": "#725f00",
                      "surface-dim": "#051424",
                      "secondary-fixed-dim": "#e9c400",
                      "secondary": "#fff9ef",
                      "surface-container": "#122131",
                      "primary-fixed": "#dbe1ff",
                      "surface-bright": "#2c3a4c",
                      "inverse-primary": "#435b9f",
                      "on-primary-container": "#758dd5",
                      "on-primary-fixed": "#00174a",
                      "on-secondary": "#3a3000",
                      "on-primary": "#0d2c6e",
                      "primary-container": "#002366",
                      "surface": "#051424",
                      "error": "#ffb4ab",
                      "surface-container-high": "#1c2b3c",
                      "secondary-fixed": "#ffe16d",
                      "on-error": "#690005",
                      "tertiary-fixed-dim": "#ffb3ac",
                      "background": "#051424",
                      "surface-container-low": "#0d1c2d",
                      "surface-container-highest": "#273647",
                      "on-background": "#d4e4fa",
                      "on-error-container": "#ffdad6",
                      "on-primary-fixed-variant": "#2a4386",
                      "primary-fixed-dim": "#b3c5ff",
                      "inverse-surface": "#d4e4fa",
                      "tertiary": "#ffb3ac",
                      "inverse-on-surface": "#233143",
                      "outline": "#8e909c",
                      "on-tertiary-fixed-variant": "#930010",
                      "surface-variant": "#273647",
                      "on-surface": "#d4e4fa",
                      "tertiary-fixed": "#ffdad6",
                      "on-secondary-fixed-variant": "#544600",
                      "surface-container-lowest": "#010f1f",
                      "secondary-container": "#ffdb3c",
                      "on-tertiary": "#680008"
                    },
                    borderRadius: {
                      "DEFAULT": "0.125rem",
                      "lg": "0.25rem",
                      "xl": "0.5rem",
                      "full": "0.75rem"
                    },
                    spacing: {
                      "base": "4px",
                      "xl": "48px",
                      "lg": "32px",
                      "sm": "16px",
                      "md": "24px",
                      "gutter": "20px",
                      "xs": "8px",
                      "margin": "32px"
                    },
                    fontFamily: {
                      "body-sm": ["Inter", "sans-serif"],
                      "headline-xl": ["Inter", "sans-serif"],
                      "headline-lg": ["Inter", "sans-serif"],
                      "mono-data": ["monospace"],
                      "label-md": ["Inter", "sans-serif"],
                      "headline-md": ["Inter", "sans-serif"],
                      "body-md": ["Inter", "sans-serif"],
                      "body-lg": ["Inter", "sans-serif"]
                    },
                    fontSize: {
                      "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
                      "headline-xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "700" }],
                      "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
                      "mono-data": ["13px", { lineHeight: "18px", fontWeight: "500" }],
                      "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
                      "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
                      "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
                      "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }]
                    }
                  }
                }
              };
            `,
          }}
        />
      </head>
      <body className="bg-surface text-on-surface min-h-screen font-body-md" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

