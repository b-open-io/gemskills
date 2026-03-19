import type { Metadata } from "next"
import { Inter, Geist_Mono, Silkscreen } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({
	variable: "--font-sans",
	subsets: ["latin"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

const geistPixel = Silkscreen({
	weight: ["400", "700"],
	variable: "--font-geist-pixel",
	subsets: ["latin"],
})

export const metadata: Metadata = {
	title: "Deck Playground",
	description: "Visual deck editor for presentation slides",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			className={`${inter.variable} ${geistPixel.variable}`}
			suppressHydrationWarning
		>
			<body
				className={`${geistMono.variable} antialiased`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					<TooltipProvider>
						{children}
					</TooltipProvider>
					<Toaster />
				</ThemeProvider>
			</body>
		</html>
	)
}
