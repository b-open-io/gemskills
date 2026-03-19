import type { Metadata } from "next"
import { Geist, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({
	variable: "--font-geist",
	subsets: ["latin"],
	display: "swap",
	preload: true,
})

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains",
	subsets: ["latin"],
	display: "swap",
	preload: true,
})

export const metadata: Metadata = {
	title: "Visual Planner",
	description: "Interactive workflow diagram editor for agent orchestration",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			className={`${geist.variable} ${jetbrainsMono.variable} dark`}
			suppressHydrationWarning
		>
			<body className="antialiased">{children}</body>
		</html>
	)
}
