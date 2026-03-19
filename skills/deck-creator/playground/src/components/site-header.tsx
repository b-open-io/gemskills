"use client";

import {
	CloudSavingDone01Icon,
	File01Icon,
	FileExportIcon,
	FolderOpenIcon,
	Link04Icon,
	Loading03Icon,
	MoreHorizontalIcon,
	PresentationBarChart01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	buildPdf,
	buildPresenter,
	cancelPublish,
	fetchPublishContext,
	getGitUrl,
	getPublishStatus,
	getSiblingDecks,
	pickDeckDirectory,
	saveAnnotations,
	saveDeck,
	saveVariants,
	startPublish,
	switchDeck,
} from "@/lib/api";
import { setAutoSaveEnabled } from "@/lib/hooks";
import type { DeckAction, DeckState } from "@/lib/types";
import { ThemeToggle } from "./theme-toggle";

interface SiteHeaderProps {
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
}

export function SiteHeader({ state, dispatch }: SiteHeaderProps) {
	const [saving, setSaving] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [publishOpen, setPublishOpen] = useState(false);
	const slide = state.slides[state.currentSlide];

	async function handleSave(): Promise<boolean> {
		setSaving(true);
		try {
			const body = {
				deckDir: state.deckDir,
				aspectRatio: state.aspectRatio,
				title: state.title,
				audience: state.audience,
				purpose: state.purpose,
				context: state.context,
				keyMessage: state.keyMessage,
				brandNotes: state.brandNotes,
				tone: state.tone,
				fontFamily: state.fontFamily,
				slideThemeMode: state.slideThemeMode,
				themeConfig: state.themeConfig,
				themeModes: state.themeModes,
				slideCount: state.slideCount,
				styleId: state.styleId,
				styleRecipeId: state.styleRecipeId,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt,
				backgroundMedia: state.videoUrl,
				slides: state.slides.map((s) => ({
					index: s.index,
					title: s.title,
					headline: s.headline,
					content: s.content,
					visualConcept: s.visualConcept,
					backgroundMode: s.backgroundMode,
					type: s.type,
					filename: s.filename,
					renderMode: s.renderMode,
				})),
				annotations: state.annotations,
			};
			await saveDeck(body);
			await saveVariants({
				deckDir: state.deckDir,
				variants: Object.fromEntries(
					state.slides.map((s) => [
						String(s.index),
						{
							variants: s.variants || [],
							activeVariant: s.activeVariant || 0,
							filename: s.filename,
						},
					]),
				),
			});
			await saveAnnotations(state.annotationsFile);
			toast.success("Deck saved");
			return true;
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Save failed: ${msg}`);
			toast.error(`Save failed: ${msg}`);
			return false;
		} finally {
			setSaving(false);
		}
	}

	async function handleExport() {
		const saved = await handleSave();
		if (!saved) {
			dispatch({
				type: "SET_STATUS",
				text: "Export cancelled: save failed",
			});
			return;
		}
		dispatch({ type: "SET_STATUS", text: "Exporting .deck..." });
		window.location.href = "/api/export";
		setTimeout(() => {
			dispatch({ type: "SET_STATUS", text: "Ready" });
			toast.success(`Exported ${state.title || "deck"}.deck`);
		}, 1000);
	}

	async function handleBuildPdf() {
		dispatch({ type: "SET_STATUS", text: "Building PDF..." });
		let nextStatusText = "Ready";
		try {
			const data = await buildPdf();
			if (data.ok) toast.success(`PDF built: ${data.path}`);
			else {
				const msg = data.error || "Unknown";
				nextStatusText = `PDF build failed: ${msg}`;
				toast.error(`PDF failed: ${msg}`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Build PDF failed: ${msg}`);
			nextStatusText = `PDF build failed: ${msg}`;
			toast.error(`Build PDF failed: ${msg}`);
		}
		dispatch({ type: "SET_STATUS", text: nextStatusText });
	}

	async function handleBuildPresenter() {
		const built = await saveAndBuildPresenter({ openPreview: true });
		if (!built) return;
	}

	async function saveAndBuildPresenter({
		openPreview,
		showSuccessToast = true,
	}: {
		openPreview: boolean;
		showSuccessToast?: boolean;
	}): Promise<boolean> {
		const saved = await handleSave();
		if (!saved) {
			dispatch({
				type: "SET_STATUS",
				text: "Presenter build cancelled: save failed",
			});
			return false;
		}
		dispatch({ type: "SET_STATUS", text: "Building presenter..." });
		let nextStatusText = "Ready";
		try {
			const data = await buildPresenter(state.videoUrl || undefined);
			if (data.ok) {
				if (showSuccessToast) {
					toast.success("Presenter built!");
				}
				if (openPreview) {
					window.open("/presenter", "_blank");
				}
				dispatch({ type: "SET_STATUS", text: nextStatusText });
				return true;
			} else {
				const msg = data.error || "Unknown";
				nextStatusText = `Presenter build failed: ${msg}`;
				toast.error(`Build failed: ${msg}`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Build presenter failed: ${msg}`);
			nextStatusText = `Presenter build failed: ${msg}`;
			toast.error(`Build presenter failed: ${msg}`);
		}
		dispatch({ type: "SET_STATUS", text: nextStatusText });
		return false;
	}

	async function handleCopyGitUrl() {
		try {
			const data = await getGitUrl();
			if (data.url) {
				await navigator.clipboard.writeText(data.url);
				toast.success(`Copied: ${data.url}`);
			} else {
				toast.info("Not a git repository");
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Failed to detect git remote: ${msg}`);
			toast.error(`Failed to detect git remote: ${msg}`);
		}
	}

	return (
		<>
			<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
				<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
					{/* LEFT: Sidebar trigger + title */}
					<SidebarTrigger className="-ml-1" />
					<Separator
						orientation="vertical"
						className="mx-2 data-[orientation=vertical]:h-4"
					/>
					<span className="text-sm font-medium truncate max-w-48">
						{state.title || "Deck Playground"}
					</span>

					{/* CENTER: Render mode tabs */}
					{slide && (
						<div className="ml-auto mr-auto flex items-center">
							<Tabs
								value={slide.renderMode}
								onValueChange={(v) =>
									dispatch({
										type: "SET_RENDER_MODE",
										mode: v as "image" | "html",
									})
								}
							>
								<TabsList className="h-7 p-0.5 bg-muted/50 border border-border/50">
									<TabsTrigger
										value="image"
										className="h-6 px-3 text-[10px] font-medium"
									>
										Image
									</TabsTrigger>
									<TabsTrigger
										value="html"
										className="h-6 px-3 text-[10px] font-medium"
									>
										HTML
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					)}

					{/* RIGHT: Save, theme, overflow */}
					<div className="ml-auto flex items-center gap-1.5">
						<div className="flex items-center gap-0.5">
							<Button
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground"
								onClick={handleSave}
								title={saving ? "Saving..." : "Save"}
							>
								<HugeiconsIcon
									icon={saving ? Loading03Icon : CloudSavingDone01Icon}
									className={`size-3.5 ${saving ? "animate-spin" : ""}`}
								/>
							</Button>
							<ThemeToggle />
						</div>

						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-4"
						/>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 text-muted-foreground"
								>
									<HugeiconsIcon
										icon={MoreHorizontalIcon}
										className="size-3.5"
									/>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-52">
								<DropdownMenuLabel className="text-[10px] text-muted-foreground">
									Deck
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setImportOpen(true)}>
									<HugeiconsIcon
										icon={FolderOpenIcon}
										className="size-3.5 mr-2"
									/>
									Open Deck...
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setPublishOpen(true)}>
									<HugeiconsIcon icon={Link04Icon} className="size-3.5 mr-2" />
									Publish & Share...
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-[10px] text-muted-foreground">
									Export & Build
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={handleBuildPresenter}>
									<HugeiconsIcon
										icon={PresentationBarChart01Icon}
										className="size-3.5 mr-2"
									/>
									Build Presenter
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleBuildPdf}>
									<HugeiconsIcon icon={File01Icon} className="size-3.5 mr-2" />
									Build PDF
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={handleExport}>
									<HugeiconsIcon
										icon={FileExportIcon}
										className="size-3.5 mr-2"
									/>
									Export .deck
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleCopyGitUrl}>
									<HugeiconsIcon icon={Link04Icon} className="size-3.5 mr-2" />
									Copy GitHub URL
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</header>

			<ImportDeckDialog open={importOpen} onOpenChange={setImportOpen} />
			<PublishDialog
				open={publishOpen}
				onOpenChange={setPublishOpen}
				deckTitle={state.title}
				prepareForPublish={() =>
					saveAndBuildPresenter({ openPreview: false, showSuccessToast: false })
				}
			/>
		</>
	);
}

// ── Import Deck Dialog ──────────────────────────────────────────────

function ImportDeckDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [customPath, setCustomPath] = useState("");
	const [recentDecks, setRecentDecks] = useState<
		Array<{ name: string; path: string; hasPlan: boolean }>
	>([]);
	const [siblings, setSiblings] = useState<
		Array<{ name: string; path: string; hasPlan: boolean }>
	>([]);
	const [currentPath, setCurrentPath] = useState("");
	const [switching, setSwitching] = useState(false);
	const [browsing, setBrowsing] = useState(false);

	const loadSiblings = useCallback(async () => {
		try {
			const data = await getSiblingDecks();
			setRecentDecks(data.recent || []);
			setSiblings(data.siblings);
			setCurrentPath(data.current);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		if (open) loadSiblings();
	}, [open, loadSiblings]);

	async function handleSwitch(path: string) {
		setSwitching(true);
		setAutoSaveEnabled(false); // Prevent autosave from writing old data to new deck
		try {
			const result = await switchDeck(path);
			if (result.ok) {
				toast.success(`Switched to ${result.path}`);
				onOpenChange(false);
				// Hard navigation instead of reload — ensures fully fresh state
				window.location.href = window.location.pathname;
			} else {
				setAutoSaveEnabled(true);
				toast.error(result.error || "Failed to switch deck");
			}
		} catch {
			setAutoSaveEnabled(true);
			toast.error("Network error switching deck");
		}
		setSwitching(false);
	}

	async function handleBrowse() {
		setBrowsing(true);
		try {
			const result = await pickDeckDirectory();
			if (result.ok && result.path) {
				setCustomPath(result.path);
				toast.success("Folder selected");
			} else if (!result.cancelled) {
				toast.error(result.error || "Failed to open folder picker");
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			toast.error(`Failed to open folder picker: ${msg}`);
		} finally {
			setBrowsing(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="text-sm">Open Deck</DialogTitle>
					<DialogDescription className="text-xs">
						Switch to a different deck directory. Current:{" "}
						<code className="text-[0.65rem] bg-muted px-1 py-0.5 rounded">
							{currentPath.split("/").slice(-2).join("/")}
						</code>
					</DialogDescription>
				</DialogHeader>

				{/* Sibling decks */}
				{recentDecks.length > 0 && (
					<div className="space-y-1">
						<p className="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider">
							Recent Decks
						</p>
						<div className="max-h-40 overflow-y-auto space-y-0.5">
							{recentDecks.map((s) => (
								<button
									key={`recent-${s.path}`}
									type="button"
									disabled={switching || s.path === currentPath}
									onClick={() => handleSwitch(s.path)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50 transition-colors"
								>
									<HugeiconsIcon
										icon={FolderOpenIcon}
										className="size-3.5 shrink-0 text-muted-foreground"
									/>
									<span className="truncate font-medium">{s.name}</span>
									{s.path === currentPath && (
										<span className="ml-auto text-[0.6rem] text-muted-foreground">
											current
										</span>
									)}
									{s.hasPlan && s.path !== currentPath && (
										<span className="ml-auto text-[0.6rem] text-muted-foreground">
											has plan
										</span>
									)}
								</button>
							))}
						</div>
					</div>
				)}

				{siblings.length > 0 && (
					<div className="space-y-1">
						<p className="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider">
							Nearby Decks
						</p>
						<div className="max-h-48 overflow-y-auto space-y-0.5">
							{siblings.map((s) => (
								<button
									key={s.path}
									type="button"
									disabled={switching || s.path === currentPath}
									onClick={() => handleSwitch(s.path)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50 transition-colors"
								>
									<HugeiconsIcon
										icon={FolderOpenIcon}
										className="size-3.5 shrink-0 text-muted-foreground"
									/>
									<span className="truncate font-medium">{s.name}</span>
									{s.path === currentPath && (
										<span className="ml-auto text-[0.6rem] text-muted-foreground">
											current
										</span>
									)}
									{s.hasPlan && s.path !== currentPath && (
										<span className="ml-auto text-[0.6rem] text-muted-foreground">
											has plan
										</span>
									)}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Custom path */}
				<div className="space-y-1.5">
					<p className="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider">
						Custom Path
					</p>
					<div className="flex gap-1.5">
						<Input
							value={customPath}
							onChange={(e) => setCustomPath(e.target.value)}
							placeholder="/path/to/deck-folder"
							className="h-8 text-xs font-mono"
							onKeyDown={(e) => {
								if (e.key === "Enter" && customPath.trim()) {
									handleSwitch(customPath.trim());
								}
							}}
						/>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-2 text-xs shrink-0"
							disabled={switching || browsing}
							onClick={handleBrowse}
						>
							<HugeiconsIcon icon={FolderOpenIcon} className="size-3.5 mr-1" />
							{browsing ? "..." : "Browse"}
						</Button>
						<Button
							size="sm"
							className="h-8 px-3 text-xs shrink-0"
							disabled={switching || browsing || !customPath.trim()}
							onClick={() => handleSwitch(customPath.trim())}
						>
							{switching ? "..." : "Open"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ── Publish & Share Dialog ──────────────────────────────────────────

type PublishMethod = "vercel" | "react-onchain" | "zip" | "tunnel";
type PublishContext = Awaited<ReturnType<typeof fetchPublishContext>>;
type PublishJob = NonNullable<
	Awaited<ReturnType<typeof getPublishStatus>>["job"]
>;

interface VercelExecutionSettings {
	scope: string;
	projectName: string;
	repoMode: "keep-nested" | "init-deck-repo";
	projectStrategy:
		| "create-new-project"
		| "link-existing-project"
		| "reuse-current-link";
	deployTarget: "production" | "preview";
	ensureVercelJson: boolean;
}

interface ReactOnchainExecutionSettings {
	appName: string;
	versionTag: string;
	versionDescription: string;
	paymentKey: string;
	satsPerKb: number;
	dryRun: boolean;
	ordinalContentUrl: string;
	ordinalIndexerUrl: string;
}

function buildVercelPrompt(
	ctx: PublishContext,
	settings: VercelExecutionSettings,
): string {
	const vercelLinked =
		ctx.vercel.isLinked && ctx.vercel.project
			? `Linked Vercel project detected: ${
					ctx.vercel.project.projectName || ctx.vercel.project.projectId
				}.`
			: "No linked Vercel project detected in .vercel/project.json.";
	const repoContext = ctx.git.isGitRepo
		? `Git repo root: ${ctx.git.repoRoot}${
				ctx.git.originUrl ? ` (origin: ${ctx.git.originUrl})` : ""
			}`
		: "No git repository detected for this deck directory.";
	const presenterStep = ctx.summary.hasPresenter
		? "presenter.html already exists."
		: `presenter.html is missing; build it first with:
bun run presenter -- --dir "${ctx.deckDir}"`;
	const vercelJsonStep = settings.ensureVercelJson
		? "Ensure vercel.json exists and routes / -> /presenter.html."
		: "Do not create or modify vercel.json automatically.";
	const deployFlag =
		settings.deployTarget === "production" ? "--prod" : "(preview deployment)";

	return [
		"You are helping me publish a GemSkills deck to Vercel.",
		`Deck directory: ${ctx.deckDir}`,
		`Deck title: ${ctx.title}`,
		"",
		"Preselected execution values (use exactly these, do not ask again):",
		`- Scope/team: ${settings.scope}`,
		`- Project name: ${settings.projectName}`,
		`- Project strategy: ${settings.projectStrategy}`,
		`- Repo mode: ${settings.repoMode}`,
		`- Deploy target: ${settings.deployTarget}`,
		`- Ensure vercel.json: ${settings.ensureVercelJson ? "yes" : "no"}`,
		"",
		"Hard requirements:",
		"- Do not create randomly named projects.",
		"- Run commands only from the deck folder.",
		"- Fail loudly if any command fails; show raw stderr.",
		"",
		"Context:",
		`- ${repoContext}`,
		`- ${vercelLinked}`,
		`- Slide assets found: ${ctx.summary.slideFileCount} (${ctx.summary.imageSlideCount} image, ${ctx.summary.htmlSlideCount} html).`,
		"",
		"Execution plan:",
		`1. Validate files in "${ctx.deckDir}" and confirm ${presenterStep}`,
		`2. ${vercelJsonStep}`,
		`3. Apply repo mode: ${settings.repoMode}.`,
		`4. Link project in scope "${settings.scope}" with project "${settings.projectName}" according to strategy "${settings.projectStrategy}".`,
		`5. Deploy from deck folder only: vercel deploy ${deployFlag} --yes --cwd "${ctx.deckDir}" --scope "${settings.scope}"`,
		"6. Return: exact commands run, linked project, deployment URL, deployment id, and changed files.",
	].join("\n");
}

function buildReactOnchainPrompt(
	ctx: PublishContext,
	settings: ReactOnchainExecutionSettings,
): string {
	const presenterStep = ctx.summary.hasPresenter
		? "presenter.html already exists."
		: `presenter.html is missing; build it first with:
bun run presenter -- --dir "${ctx.deckDir}"`;

	return [
		"You are helping me publish a GemSkills deck with react-onchain.",
		`Deck directory: ${ctx.deckDir}`,
		`Deck title: ${ctx.title}`,
		"",
		"Preselected execution values (use exactly these, do not ask again):",
		`- App name: ${settings.appName}`,
		`- Version tag: ${settings.versionTag}`,
		`- Version description: ${settings.versionDescription}`,
		`- Dry run: ${settings.dryRun ? "yes" : "no"}`,
		`- Sats per KB: ${settings.satsPerKb}`,
		`- Ordinal content URL override: ${settings.ordinalContentUrl || "(none)"}`,
		`- Ordinal indexer URL override: ${settings.ordinalIndexerUrl || "(none)"}`,
		`- Payment key provided: ${settings.paymentKey.trim() ? "yes" : "no"}`,
		"",
		"Hard requirements:",
		"- Never print the raw payment key in logs or output.",
		"- Fail loudly on command errors and include stderr.",
		"- Use a staged build with presenter.html as index.html entrypoint.",
		"",
		"Execution plan:",
		`1. Validate files in "${ctx.deckDir}" and confirm ${presenterStep}`,
		"2. Stage publish assets to a temporary folder and copy presenter.html to index.html.",
		"3. Run: npx --yes react-onchain deploy with the provided flags.",
		"4. Copy deployment-manifest.json back into the deck directory.",
		"5. Return: exact command (with key redacted), deployment URL, deployment id/outpoint, and updated files.",
	].join("\n");
}

function buildZipPrompt(ctx: PublishContext): string {
	return [
		"You are preparing this deck for shareable file export.",
		`Deck directory: ${ctx.deckDir}`,
		"",
		"Do exactly this:",
		"1. Verify DECK-PLAN.md, DECK-INDEX.md, THEME.md, and slides files exist and report missing files.",
		"2. If presenter.html is missing, build it before export.",
		"3. Trigger export and produce a single .deck zip artifact.",
		"4. Print the absolute path of the exported file and its size.",
		"5. Fail immediately on command errors and show raw stderr.",
	].join("\n");
}

function buildTunnelPrompt(ctx: PublishContext): string {
	return [
		"You are creating a temporary share link for a local deck presenter using Cloudflare Tunnel.",
		`Deck directory: ${ctx.deckDir}`,
		"",
		"Rules:",
		"- This is temporary only; make it explicit that the URL dies when the local process stops.",
		"- Do not claim this is a durable publish flow.",
		"",
		"Steps:",
		"1. Ensure presenter.html exists in the deck directory.",
		`2. Start a local static server scoped to this deck folder (example: python3 -m http.server 4173 --directory "${ctx.deckDir}").`,
		"3. Start a Cloudflare tunnel to that local server URL.",
		"4. Return the public URL plus stop/restart commands.",
		"5. If any step fails, stop and show full error output.",
	].join("\n");
}

function buildPromptForMethod(
	method: PublishMethod,
	ctx: PublishContext,
	vercelSettings: VercelExecutionSettings,
	reactOnchainSettings: ReactOnchainExecutionSettings,
): string {
	switch (method) {
		case "vercel":
			return buildVercelPrompt(ctx, vercelSettings);
		case "react-onchain":
			return buildReactOnchainPrompt(ctx, reactOnchainSettings);
		case "tunnel":
			return buildTunnelPrompt(ctx);
		default:
			return buildZipPrompt(ctx);
	}
}

function InfoLabel({ label, tip }: { label: string; tip: string }) {
	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex items-center gap-1">
				<Label className="text-[11px]">{label}</Label>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/30 text-[9px] text-muted-foreground cursor-help leading-none">
							i
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-[220px] text-xs">
						{tip}
					</TooltipContent>
				</Tooltip>
			</div>
		</TooltipProvider>
	);
}

function PublishDialog({
	open,
	onOpenChange,
	deckTitle,
	prepareForPublish,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	deckTitle: string;
	prepareForPublish: () => Promise<boolean>;
}) {
	const [method, setMethod] = useState<PublishMethod>("vercel");
	const [loading, setLoading] = useState(false);
	const [context, setContext] = useState<PublishContext | null>(null);
	const [error, setError] = useState<string>("");
	const [scope, setScope] = useState("");
	const [projectName, setProjectName] = useState("");
	const [repoMode, setRepoMode] = useState<"keep-nested" | "init-deck-repo">(
		"keep-nested",
	);
	const [projectStrategy, setProjectStrategy] = useState<
		"create-new-project" | "link-existing-project" | "reuse-current-link"
	>("create-new-project");
	const [deployTarget, setDeployTarget] = useState<"production" | "preview">(
		"production",
	);
	const [ensureVercelJson, setEnsureVercelJson] = useState(true);
	const [appName, setAppName] = useState("");
	const [versionTag, setVersionTag] = useState("v1");
	const [versionDescription, setVersionDescription] = useState(
		"Initial on-chain publish",
	);
	const [paymentKey, setPaymentKey] = useState("");
	const [satsPerKb, setSatsPerKb] = useState(1);
	const [dryRun, setDryRun] = useState(false);
	const [ordinalContentUrl, setOrdinalContentUrl] = useState("");
	const [ordinalIndexerUrl, setOrdinalIndexerUrl] = useState("");
	const [promptDraft, setPromptDraft] = useState("");
	const [promptDirty, setPromptDirty] = useState(false);
	const [job, setJob] = useState<PublishJob | null>(null);
	const [pollingJobId, setPollingJobId] = useState<string | null>(null);
	const [running, setRunning] = useState(false);
	const [cancelling, setCancelling] = useState(false);

	useEffect(() => {
		if (!open) return;
		setLoading(true);
		setError("");
		fetchPublishContext()
			.then((data) => {
				setContext(data);

				// Restore last-used publish settings from localStorage (keyed by deck dir).
				const cacheKey = `deck-publish:${data.deckDir}`;
				let cached: {
					scope?: string;
					projectName?: string;
					deployTarget?: string;
					appName?: string;
					versionTag?: string;
				} = {};
				try {
					const raw = localStorage.getItem(cacheKey);
					if (raw) cached = JSON.parse(raw);
				} catch {
					/* ignore */
				}

				const defaultScope =
					cached.scope ||
					data.vercel.scopes.find((s) => s.current)?.id ||
					data.vercel.scopes[0]?.id ||
					"";
				setScope(defaultScope);
				setProjectName(
					cached.projectName ||
						data.vercel.project?.projectName ||
						data.suggestedProjectName ||
						"",
				);
				setEnsureVercelJson(!data.vercel.hasVercelJson);
				setProjectStrategy(
					data.vercel.isLinked ? "reuse-current-link" : "create-new-project",
				);
				setRepoMode(data.git.isDeckRepoRoot ? "keep-nested" : "keep-nested");
				setDeployTarget(
					(cached.deployTarget as "production" | "preview") || "production",
				);
				setAppName(cached.appName || data.suggestedProjectName || "deck");
				setVersionTag("v1");
				setVersionDescription("Initial on-chain publish");
				setPaymentKey("");
				setSatsPerKb(1);
				setDryRun(false);
				setOrdinalContentUrl("");
				setOrdinalIndexerUrl("");
				setJob(null);
				setPollingJobId(null);
				setRunning(false);
				setCancelling(false);
				setPromptDirty(false);
			})
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [open]);

	const effectiveSettings = useMemo<VercelExecutionSettings>(
		() => ({
			scope,
			projectName,
			repoMode,
			projectStrategy,
			deployTarget,
			ensureVercelJson,
		}),
		[
			scope,
			projectName,
			repoMode,
			projectStrategy,
			deployTarget,
			ensureVercelJson,
		],
	);

	const reactOnchainSettings = useMemo<ReactOnchainExecutionSettings>(
		() => ({
			appName,
			versionTag,
			versionDescription,
			paymentKey,
			satsPerKb,
			dryRun,
			ordinalContentUrl,
			ordinalIndexerUrl,
		}),
		[
			appName,
			versionTag,
			versionDescription,
			paymentKey,
			satsPerKb,
			dryRun,
			ordinalContentUrl,
			ordinalIndexerUrl,
		],
	);

	useEffect(() => {
		if (!context) return;
		if (promptDirty) return;
		setPromptDraft(
			buildPromptForMethod(
				method,
				context,
				effectiveSettings,
				reactOnchainSettings,
			),
		);
	}, [context, method, promptDirty, effectiveSettings, reactOnchainSettings]);

	useEffect(() => {
		if (!pollingJobId) return;
		let cancelled = false;
		const poll = async () => {
			try {
				const data = await getPublishStatus(pollingJobId);
				if (cancelled || !data.job) return;
				setJob(data.job as PublishJob);
				if (data.job.status !== "running") {
					setPollingJobId(null);
					setRunning(false);
					setCancelling(false);
					if (data.job.status === "done") {
						const url = data.job.result?.deploymentUrl;
						toast.success(url ? `Published: ${url}` : "Publish completed");
						// Persist publish settings so the next publish pre-fills them.
						if (context) {
							try {
								const cacheKey = `deck-publish:${context.deckDir}`;
								localStorage.setItem(
									cacheKey,
									JSON.stringify({
										scope,
										projectName,
										deployTarget,
										appName,
										versionTag,
									}),
								);
							} catch {
								/* localStorage may be unavailable */
							}
						}
					} else if (data.job.status === "cancelled") {
						toast.info("Publish cancelled");
					} else {
						toast.error(data.job.error || "Publish failed");
					}
				}
			} catch (pollErr: unknown) {
				if (cancelled) return;
				const msg =
					pollErr instanceof Error ? pollErr.message : String(pollErr);
				setPollingJobId(null);
				setRunning(false);
				setCancelling(false);
				toast.error(`Publish status polling failed: ${msg}`);
			}
		};
		void poll();
		const timer = setInterval(() => {
			void poll();
		}, 1200);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [pollingJobId]);

	async function handleCopyPrompt(selected: PublishMethod) {
		if (!context) return;
		try {
			await navigator.clipboard.writeText(
				selected === method
					? promptDraft
					: buildPromptForMethod(
							selected,
							context,
							effectiveSettings,
							reactOnchainSettings,
						),
			);
			toast.success("Publish prompt copied");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.error(`Copy failed: ${msg}`);
		}
	}

	async function handleExecute() {
		if (!context) return;
		if (method !== "vercel" && method !== "react-onchain") {
			toast.info("Execute is currently supported for Vercel and React Onchain");
			return;
		}

		setRunning(true);
		setError("");
		try {
			if (method === "vercel") {
				if (!scope.trim()) {
					throw new Error("Scope/team is required");
				}
				if (!projectName.trim()) {
					throw new Error("Project name is required");
				}
			}
			if (method === "react-onchain") {
				if (!appName.trim()) {
					throw new Error("App name is required");
				}
				if (!versionTag.trim()) {
					throw new Error("Version tag is required");
				}
				if (!versionDescription.trim()) {
					throw new Error("Version description is required");
				}
				if (!dryRun && !paymentKey.trim()) {
					throw new Error("Payment key is required unless dry run is enabled");
				}
				if (!Number.isFinite(satsPerKb) || satsPerKb <= 0) {
					throw new Error("Sats per KB must be greater than 0");
				}
			}

			const prepared = await prepareForPublish();
			if (!prepared) {
				setRunning(false);
				toast.error("Publish cancelled: save/build presenter failed");
				return;
			}
			const response =
				method === "vercel"
					? await startPublish({
							method: "vercel",
							deckDir: context.deckDir,
							scope: scope.trim(),
							projectName: projectName.trim(),
							repoMode,
							projectStrategy,
							deployTarget,
							ensureVercelJson,
							promptText: promptDraft,
						})
					: await startPublish({
							method: "react-onchain",
							deckDir: context.deckDir,
							appName: appName.trim(),
							versionTag: versionTag.trim(),
							versionDescription: versionDescription.trim(),
							paymentKey: paymentKey.trim() || undefined,
							satsPerKb,
							dryRun,
							ordinalContentUrl: ordinalContentUrl.trim() || undefined,
							ordinalIndexerUrl: ordinalIndexerUrl.trim() || undefined,
							promptText: promptDraft,
						});
			if (!response.ok || !response.job) {
				throw new Error(response.error || "Failed to start publish job");
			}
			setJob(response.job as PublishJob);
			setPollingJobId(response.job.id);
			toast.success("Publish job started");
		} catch (execErr: unknown) {
			const msg = execErr instanceof Error ? execErr.message : String(execErr);
			setRunning(false);
			toast.error(`Publish start failed: ${msg}`);
		}
	}

	async function handleCancel() {
		if (!job?.id) return;
		setCancelling(true);
		try {
			const response = await cancelPublish(job.id);
			if (!response.ok || !response.job) {
				throw new Error(response.error || "Cancel failed");
			}
			setJob(response.job as PublishJob);
			if (response.job.status === "running") {
				setPollingJobId(response.job.id);
			} else {
				setPollingJobId(null);
				setRunning(false);
			}
			toast.info("Cancel requested");
		} catch (cancelErr: unknown) {
			const msg =
				cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
			toast.error(`Cancel failed: ${msg}`);
		} finally {
			setCancelling(false);
		}
	}

	async function handleCopyLogs() {
		if (!job) return;
		try {
			await navigator.clipboard.writeText(job.logs.join("\n"));
			toast.success("Publish logs copied");
		} catch (copyErr: unknown) {
			const msg = copyErr instanceof Error ? copyErr.message : String(copyErr);
			toast.error(`Copy logs failed: ${msg}`);
		}
	}

	const readiness = context?.summary;
	const promptText = promptDraft;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
				<DialogHeader className="shrink-0">
					<DialogTitle className="text-sm">Publish & Share</DialogTitle>
					<DialogDescription className="text-xs">
						Choose a sharing path. Vercel and React Onchain are durable publish
						flows; tunnel is temporary; zip is file handoff.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 min-h-0 overflow-y-auto pr-1">
					<div className="text-xs text-muted-foreground">
						<span className="font-medium text-foreground">
							{deckTitle || context?.title || "Current Deck"}
						</span>
						{context?.deckDir ? ` • ${context.deckDir}` : ""}
					</div>

					{loading && (
						<div className="text-xs text-muted-foreground">
							Loading publish context...
						</div>
					)}
					{error && <div className="text-xs text-destructive">{error}</div>}

					{readiness && (
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="rounded border px-2 py-1.5">
								presenter.html:{" "}
								<span className="font-medium">
									{readiness.hasPresenter ? "ready" : "missing"}
								</span>
							</div>
							<div className="rounded border px-2 py-1.5">
								deck.pdf:{" "}
								<span className="font-medium">
									{readiness.hasPdf ? "ready" : "missing"}
								</span>
							</div>
							<div className="rounded border px-2 py-1.5">
								slides:{" "}
								<span className="font-medium">{readiness.slideFileCount}</span>
							</div>
							<div className="rounded border px-2 py-1.5">
								git root:{" "}
								<span className="font-medium">
									{context?.git.isDeckRepoRoot
										? "deck dir"
										: context?.git.isGitRepo
											? "parent repo"
											: "none"}
								</span>
							</div>
						</div>
					)}

					<Tabs
						value={method}
						onValueChange={(value) => setMethod(value as PublishMethod)}
					>
						<TabsList className="grid w-full grid-cols-4 h-8">
							<TabsTrigger value="vercel" className="text-xs">
								Vercel
							</TabsTrigger>
							<TabsTrigger value="react-onchain" className="text-xs">
								React Onchain
							</TabsTrigger>
							<TabsTrigger value="zip" className="text-xs">
								Zip
							</TabsTrigger>
							<TabsTrigger value="tunnel" className="text-xs">
								Cloudflare Tunnel
							</TabsTrigger>
						</TabsList>

						<TabsContent value="vercel" className="space-y-2">
							<div className="text-xs text-muted-foreground pb-1">
								Recommended for persistent share links and project-managed
								deployments. Configure once, then run non-interactively.
							</div>
							{context?.vercel.scopesError && (
								<div className="text-xs text-destructive">
									Vercel scope lookup failed: {context.vercel.scopesError}
								</div>
							)}
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1">
									<InfoLabel
										label="Scope / Team"
										tip="Your Vercel account or team. Detected from your local Vercel CLI login."
									/>
									{context && context.vercel.scopes.length > 0 ? (
										<Select value={scope} onValueChange={setScope}>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue placeholder="Select scope" />
											</SelectTrigger>
											<SelectContent>
												{context.vercel.scopes.map((s) => (
													<SelectItem key={s.id} value={s.id}>
														{s.name}
														{s.current ? " (current)" : ""} — {s.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<Input
											value={scope}
											onChange={(e) => setScope(e.target.value)}
											placeholder="scope id"
											className="h-8 text-xs"
										/>
									)}
								</div>
								<div className="space-y-1">
									<InfoLabel
										label="Project Name"
										tip="The Vercel project name. Used as the subdomain for the deployment URL."
									/>
									<Input
										value={projectName}
										onChange={(e) => setProjectName(e.target.value)}
										placeholder="deck project name"
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1">
									<InfoLabel
										label="Project Strategy"
										tip="How to handle the Vercel project. 'Reuse Current Link' uses an existing .vercel/project.json. 'Create New' makes a fresh project. 'Link Existing' connects to a project already on Vercel."
									/>
									<Select
										value={projectStrategy}
										onValueChange={(value) =>
											setProjectStrategy(
												value as VercelExecutionSettings["projectStrategy"],
											)
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{context?.vercel.isLinked && (
												<SelectItem value="reuse-current-link">
													Reuse Current Link
												</SelectItem>
											)}
											<SelectItem value="create-new-project">
												Create New Project
											</SelectItem>
											<SelectItem value="link-existing-project">
												Link Existing Project
											</SelectItem>
											{!context?.vercel.isLinked && (
												<SelectItem value="reuse-current-link" disabled>
													Reuse Current Link (not linked)
												</SelectItem>
											)}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<InfoLabel
										label="Repo Mode"
										tip="'Keep Nested' deploys from the current directory within your repo. 'Init Deck Repo' creates a standalone git repo for this deck."
									/>
									<Select
										value={repoMode}
										onValueChange={(value) =>
											setRepoMode(value as VercelExecutionSettings["repoMode"])
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="keep-nested">Keep Nested</SelectItem>
											<SelectItem value="init-deck-repo">
												Init Deck Repo
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<InfoLabel
										label="Deploy Target"
										tip="'Production' publishes to the live URL. 'Preview' creates a temporary preview deployment."
									/>
									<Select
										value={deployTarget}
										onValueChange={(value) =>
											setDeployTarget(
												value as VercelExecutionSettings["deployTarget"],
											)
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="production">Production</SelectItem>
											<SelectItem value="preview">Preview</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<InfoLabel
										label="vercel.json Handling"
										tip="When enabled, creates a vercel.json with static file serving config if one doesn't exist."
									/>
									<Button
										type="button"
										variant={ensureVercelJson ? "default" : "outline"}
										size="sm"
										className="h-8 w-full text-xs justify-start"
										onClick={() => setEnsureVercelJson((v) => !v)}
									>
										{ensureVercelJson ? "Ensure vercel.json" : "Leave as-is"}
									</Button>
								</div>
							</div>
						</TabsContent>
						<TabsContent value="react-onchain" className="space-y-2">
							<div className="text-xs text-muted-foreground pb-1">
								Deploy a staged presenter build with{" "}
								<code className="font-mono">react-onchain</code>. Keep payment
								key private and prefer dry runs first.
							</div>
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1">
									<Label className="text-[11px]">App Name</Label>
									<Input
										value={appName}
										onChange={(e) => setAppName(e.target.value)}
										placeholder="deck-app"
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-[11px]">Version Tag</Label>
									<Input
										value={versionTag}
										onChange={(e) => setVersionTag(e.target.value)}
										placeholder="v1"
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1 col-span-2">
									<Label className="text-[11px]">Version Description</Label>
									<Input
										value={versionDescription}
										onChange={(e) => setVersionDescription(e.target.value)}
										placeholder="Initial publish"
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-[11px]">Payment Key</Label>
									<Input
										type="password"
										value={paymentKey}
										onChange={(e) => setPaymentKey(e.target.value)}
										placeholder={dryRun ? "(optional in dry run)" : "L..."}
										className="h-8 text-xs font-mono"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-[11px]">Sats / KB</Label>
									<Input
										type="number"
										min={1}
										step={1}
										value={String(satsPerKb)}
										onChange={(e) => {
											const parsed = Number.parseFloat(e.target.value);
											setSatsPerKb(Number.isFinite(parsed) ? parsed : 0);
										}}
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-[11px]">Mode</Label>
									<Button
										type="button"
										variant={dryRun ? "outline" : "default"}
										size="sm"
										className="h-8 w-full text-xs justify-start"
										onClick={() => setDryRun((v) => !v)}
									>
										{dryRun ? "Dry Run Enabled" : "Live Publish"}
									</Button>
								</div>
								<div className="space-y-1 col-span-2">
									<Label className="text-[11px]">
										Ordinal Content URL (optional)
									</Label>
									<Input
										value={ordinalContentUrl}
										onChange={(e) => setOrdinalContentUrl(e.target.value)}
										placeholder="https://ordfs.network/content"
										className="h-8 text-xs"
									/>
								</div>
								<div className="space-y-1 col-span-2">
									<Label className="text-[11px]">
										Ordinal Indexer URL (optional)
									</Label>
									<Input
										value={ordinalIndexerUrl}
										onChange={(e) => setOrdinalIndexerUrl(e.target.value)}
										placeholder="https://ordinals.gorillapool.io"
										className="h-8 text-xs"
									/>
								</div>
							</div>
						</TabsContent>
						<TabsContent value="zip" className="space-y-2">
							<div className="text-xs text-muted-foreground">
								Good for handoff. Recipient must open it in a compatible deck
								workflow.
							</div>
						</TabsContent>
						<TabsContent value="tunnel" className="space-y-2">
							<div className="text-xs text-muted-foreground">
								Temporary URL while your machine stays online.
							</div>
						</TabsContent>
					</Tabs>

					<Textarea
						readOnly={false}
						value={promptText}
						onChange={(e) => {
							setPromptDirty(true);
							setPromptDraft(e.target.value);
						}}
						className="h-[36vh] min-h-[220px] max-h-[48vh] font-mono text-[11px]"
					/>

					{job && (
						<div className="space-y-2 rounded border p-2">
							<div className="flex items-center justify-between text-xs">
								<div>
									Publish status:{" "}
									<span className="font-medium uppercase">{job.status}</span>
								</div>
								{job.result?.deploymentUrl && (
									<a
										href={job.result.deploymentUrl}
										target="_blank"
										rel="noreferrer"
										className="text-primary underline underline-offset-2"
									>
										Open Deployment
									</a>
								)}
							</div>
							<div className="max-h-24 overflow-y-auto space-y-1">
								{job.steps.map((step) => (
									<div key={step.id} className="text-[11px]">
										<span className="font-medium">{step.label}</span>:{" "}
										<span className="uppercase">{step.status}</span>
										{step.error ? ` — ${step.error}` : ""}
									</div>
								))}
							</div>
							<Textarea
								readOnly
								value={job.logs.join("\n")}
								className="h-28 font-mono text-[11px]"
							/>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="outline" onClick={handleCopyLogs}>
									Copy Logs
								</Button>
							</div>
						</div>
					)}

					<div className="flex justify-between gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={!context || !promptDirty}
							onClick={() => {
								if (!context) return;
								setPromptDirty(false);
								setPromptDraft(
									buildPromptForMethod(
										method,
										context,
										effectiveSettings,
										reactOnchainSettings,
									),
								);
							}}
						>
							Reset Prompt
						</Button>
						<Button
							size="sm"
							disabled={!context}
							onClick={() => handleCopyPrompt(method)}
						>
							Copy Prompt
						</Button>
						<Button
							size="sm"
							disabled={
								!context ||
								running ||
								(method !== "vercel" && method !== "react-onchain")
							}
							onClick={handleExecute}
						>
							{running ? (
								<>
									<HugeiconsIcon
										icon={Loading03Icon}
										className="size-3.5 mr-1 animate-spin"
									/>
									Running...
								</>
							) : (
								"Execute Prompt"
							)}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							disabled={!running || !job?.id || cancelling}
							onClick={handleCancel}
						>
							{cancelling ? (
								<>
									<HugeiconsIcon
										icon={Loading03Icon}
										className="size-3.5 mr-1 animate-spin"
									/>
									Cancelling...
								</>
							) : (
								"Cancel"
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
