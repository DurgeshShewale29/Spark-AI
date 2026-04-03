import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google"; 
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css"; 

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spark AI",
  description: "AI App Generator",
};

export default function RootLayout({
  children, 
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        {/* 3. We apply it to the body here */}
        <body className={spaceGrotesk.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}