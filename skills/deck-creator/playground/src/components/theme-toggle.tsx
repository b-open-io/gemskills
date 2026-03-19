"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()

	return (
		<Button
			variant="ghost"
			size="icon"
			className="size-7"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
		>
			<HugeiconsIcon icon={Sun01Icon} className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
			<HugeiconsIcon icon={Moon01Icon} className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
			<span className="sr-only">Toggle theme</span>
		</Button>
	)
}
