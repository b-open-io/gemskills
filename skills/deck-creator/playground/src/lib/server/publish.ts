import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

export type PublishMethod = "vercel" | "react-onchain";
export type RepoMode = "keep-nested" | "init-deck-repo";
export type ProjectStrategy =
	| "create-new-project"
	| "link-existing-project"
	| "reuse-current-link";
export type DeployTarget = "production" | "preview";

interface PublishIntentBase {
	method: PublishMethod;
	deckDir: string;
	promptText?: string;
}

export interface VercelPublishIntent extends PublishIntentBase {
	method: "vercel";
	scope: string;
	projectName: string;
	repoMode: RepoMode;
	projectStrategy: ProjectStrategy;
	deployTarget: DeployTarget;
	ensureVercelJson: boolean;
}

export interface ReactOnchainPublishIntent extends PublishIntentBase {
	method: "react-onchain";
	appName: string;
	versionTag: string;
	versionDescription: string;
	paymentKey?: string;
	satsPerKb: number;
	dryRun: boolean;
	ordinalContentUrl?: string;
	ordinalIndexerUrl?: string;
}

export type PublishIntent = VercelPublishIntent | ReactOnchainPublishIntent;

export interface PublishStep {
	id: string;
	label: string;
	status: "pending" | "running" | "done" | "error" | "cancelled";
	startedAt?: number;
	endedAt?: number;
	command?: string;
	output?: string;
	error?: string;
}

export interface PublishJob {
	id: string;
	status: "running" | "done" | "error" | "cancelled";
	startedAt: number;
	endedAt?: number;
	intent: PublishIntent;
	steps: PublishStep[];
	logs: string[];
	result?: {
		deploymentUrl?: string;
		deploymentId?: string;
		linkedProjectName?: string;
		scope?: string;
		protocol?: "vercel" | "react-onchain";
		createdFiles?: string[];
	};
	error?: string;
}

export interface VercelScopeInfo {
	id: string;
	name: string;
	current: boolean;
}

const VERCEL_JSON_CONTENT = `${JSON.stringify(
	{
		$schema: "https://openapi.vercel.sh/vercel.json",
		rewrites: [{ source: "/", destination: "/presenter.html" }],
	},
	null,
	2,
)}\n`;

const publishJobs = new Map<string, PublishJob>();
const publishRuntimes = new Map<
	string,
	{ cancelRequested: boolean; activeChild: ChildProcess | null }
>();
let publishJobCounter = 0;

class PublishCancelledError extends Error {
	constructor(message = "Publish cancelled by user") {
		super(message);
		this.name = "PublishCancelledError";
	}
}

function getPublishRuntime(jobId: string) {
	let runtime = publishRuntimes.get(jobId);
	if (!runtime) {
		runtime = { cancelRequested: false, activeChild: null };
		publishRuntimes.set(jobId, runtime);
	}
	return runtime;
}

function assertNotCancelled(job: PublishJob) {
	if (getPublishRuntime(job.id).cancelRequested) {
		throw new PublishCancelledError();
	}
}

function addLog(job: PublishJob, line: string) {
	const ts = new Date().toISOString();
	job.logs.push(`[${ts}] ${line}`);
}

function makeStep(id: string, label: string): PublishStep {
	return { id, label, status: "pending" };
}

function findStep(job: PublishJob, id: string): PublishStep {
	const step = job.steps.find((s) => s.id === id);
	if (!step) throw new Error(`Missing publish step "${id}"`);
	return step;
}

function beginStep(job: PublishJob, id: string, label: string): PublishStep {
	let step: PublishStep;
	try {
		step = findStep(job, id);
		step.label = label;
	} catch {
		step = makeStep(id, label);
		job.steps.push(step);
	}
	step.status = "running";
	step.startedAt = Date.now();
	addLog(job, `▶ ${label}`);
	return step;
}

function completeStep(
	job: PublishJob,
	step: PublishStep,
	status: "done" | "error" | "cancelled",
	details?: { output?: string; error?: string },
) {
	step.status = status;
	step.endedAt = Date.now();
	if (details?.output) step.output = details.output;
	if (details?.error) step.error = details.error;
	if (status === "done") {
		addLog(job, `✓ ${step.label}`);
	} else if (status === "cancelled") {
		addLog(
			job,
			`⏹ ${step.label}${details?.error ? ` — ${details.error}` : ""}`,
		);
	} else {
		addLog(
			job,
			`✗ ${step.label}${details?.error ? ` — ${details.error}` : ""}`,
		);
	}
}

async function runCommand(
	job: PublishJob,
	step: PublishStep,
	cmd: string,
	args: string[],
	cwd: string,
	options?: { displayArgs?: string[] },
): Promise<{ stdout: string; stderr: string; combined: string }> {
	assertNotCancelled(job);
	const displayArgs = options?.displayArgs ?? args;
	const commandText = `${cmd} ${displayArgs.join(" ")}`.trim();
	step.command = commandText;
	addLog(job, `$ ${commandText}`);
	const runtime = getPublishRuntime(job.id);

	return await new Promise((resolveRun, rejectRun) => {
		const child = spawn(cmd, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
		runtime.activeChild = child;

		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdoutChunks.push(
				typeof chunk === "string" ? chunk : chunk.toString("utf-8"),
			);
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(
				typeof chunk === "string" ? chunk : chunk.toString("utf-8"),
			);
		});

		child.once("error", (error: Error) => {
			runtime.activeChild = null;
			rejectRun(error);
		});

		child.once("close", (code) => {
			runtime.activeChild = null;
			const stdout = stdoutChunks.join("");
			const stderr = stderrChunks.join("");
			const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
			if (combined) {
				addLog(job, combined);
			}

			if (runtime.cancelRequested) {
				rejectRun(new PublishCancelledError(`Cancelled: ${commandText}`));
				return;
			}

			if ((code ?? 1) !== 0) {
				rejectRun(
					new Error(
						`Command failed (${code ?? "unknown"}): ${commandText}${
							combined ? `\n${combined}` : ""
						}`,
					),
				);
				return;
			}

			resolveRun({ stdout, stderr, combined });
		});
	});
}

function ensureDeckAssets(job: PublishJob, deckDir: string) {
	assertNotCancelled(job);
	const step = beginStep(job, "validate", "Validate deck files");
	try {
		const presenterPath = join(deckDir, "presenter.html");
		if (!existsSync(presenterPath)) {
			throw new Error("presenter.html is missing");
		}
		const slidesDirCandidates = [
			join(deckDir, "slides"),
			join(deckDir, "pages"),
		];
		const slidesDir = slidesDirCandidates.find((d) => existsSync(d));
		if (!slidesDir) {
			throw new Error("No slides/ or pages/ directory found");
		}
		const slideFiles = readdirSync(slidesDir).filter((f) =>
			/\.(png|jpg|jpeg|webp|html)$/i.test(f),
		);
		if (slideFiles.length === 0) {
			throw new Error(`No slide assets found in ${slidesDir}`);
		}
		completeStep(job, step, "done", {
			output: `presenter.html + ${slideFiles.length} slide assets`,
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

function ensureVercelJson(job: PublishJob, deckDir: string) {
	assertNotCancelled(job);
	const step = beginStep(job, "vercel-json", "Ensure vercel.json");
	try {
		const vercelJsonPath = join(deckDir, "vercel.json");
		if (!existsSync(vercelJsonPath)) {
			writeFileSync(vercelJsonPath, VERCEL_JSON_CONTENT, "utf-8");
			job.result = {
				...(job.result || {}),
				createdFiles: [...(job.result?.createdFiles || []), vercelJsonPath],
			};
			completeStep(job, step, "done", { output: "Created vercel.json" });
			return;
		}
		completeStep(job, step, "done", { output: "vercel.json already present" });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

async function handleRepoMode(
	job: PublishJob,
	deckDir: string,
	repoMode: RepoMode,
) {
	assertNotCancelled(job);
	const step = beginStep(job, "repo-mode", "Apply repository mode");
	try {
		const hasGit = existsSync(join(deckDir, ".git"));
		if (repoMode === "init-deck-repo" && !hasGit) {
			await runCommand(job, step, "git", ["init"], deckDir);
			completeStep(job, step, "done", { output: "Initialized git repository" });
			return;
		}
		if (repoMode === "init-deck-repo" && hasGit) {
			completeStep(job, step, "done", {
				output: "Deck directory is already a git repository",
			});
			return;
		}
		completeStep(job, step, "done", {
			output: "Keeping nested repository structure",
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

async function linkVercelProject(job: PublishJob, intent: VercelPublishIntent) {
	assertNotCancelled(job);
	const step = beginStep(job, "link", "Link deck directory to Vercel project");
	try {
		const linkedPath = join(intent.deckDir, ".vercel", "project.json");
		if (intent.projectStrategy === "reuse-current-link") {
			if (!existsSync(linkedPath)) {
				throw new Error(
					"Reuse-current-link selected but .vercel/project.json is missing",
				);
			}
			completeStep(job, step, "done", {
				output: "Reused existing .vercel/project.json link",
			});
			job.result = {
				...(job.result || {}),
				linkedProjectName: intent.projectName,
				scope: intent.scope,
			};
			return;
		}
		await runCommand(
			job,
			step,
			"vercel",
			[
				"link",
				"--yes",
				"--cwd",
				intent.deckDir,
				"--scope",
				intent.scope,
				"--project",
				intent.projectName,
				"--no-color",
			],
			intent.deckDir,
		);
		completeStep(job, step, "done", {
			output:
				intent.projectStrategy === "create-new-project"
					? `Created/linked project ${intent.projectName}`
					: `Linked existing project ${intent.projectName}`,
		});
		job.result = {
			...(job.result || {}),
			linkedProjectName: intent.projectName,
			scope: intent.scope,
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

function parseDeploymentUrl(output: string): string | undefined {
	const matches = output.match(/https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g);
	if (!matches || matches.length === 0) return undefined;
	return matches[matches.length - 1];
}

function parseDeploymentId(url?: string): string | undefined {
	if (!url) return undefined;
	const match = url.match(/https:\/\/([a-zA-Z0-9-]+)\.vercel\.app/);
	return match?.[1];
}

async function deployProject(job: PublishJob, intent: VercelPublishIntent) {
	assertNotCancelled(job);
	const step = beginStep(job, "deploy", "Deploy deck to Vercel");
	try {
		const args = [
			"deploy",
			"--yes",
			"--cwd",
			intent.deckDir,
			"--scope",
			intent.scope,
			"--no-color",
		];
		if (intent.deployTarget === "production") {
			args.push("--prod");
		}
		const { combined } = await runCommand(
			job,
			step,
			"vercel",
			args,
			intent.deckDir,
		);
		const deploymentUrl = parseDeploymentUrl(combined);
		const deploymentId = parseDeploymentId(deploymentUrl);
		completeStep(job, step, "done", {
			output: deploymentUrl
				? `Deployment URL: ${deploymentUrl}`
				: "Deployment completed (URL not detected in CLI output)",
		});
		job.result = {
			...(job.result || {}),
			protocol: "vercel",
			deploymentUrl,
			deploymentId,
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

interface ReactOnchainStage {
	tempRoot: string;
	workDir: string;
	buildDir: string;
	manifestPath: string;
}

function parseReactOnchainDeploymentUrl(output: string): string | undefined {
	const matches = output.match(/https?:\/\/[^\s"'`<>]+/g);
	if (!matches || matches.length === 0) return undefined;
	for (let i = matches.length - 1; i >= 0; i--) {
		if (matches[i].includes("/content/")) {
			return matches[i];
		}
	}
	return matches[matches.length - 1];
}

function parseReactOnchainDeploymentId(
	url: string | undefined,
	output: string,
): string | undefined {
	if (url) {
		const urlMatch = url.match(/\/content\/([^/?#]+)/);
		if (urlMatch?.[1]) return urlMatch[1];
	}
	const outpointMatch = output.match(/\b[0-9a-f]{64}_[0-9]+\b/i);
	return outpointMatch?.[0];
}

function prepareReactOnchainStage(
	job: PublishJob,
	intent: ReactOnchainPublishIntent,
): ReactOnchainStage {
	assertNotCancelled(job);
	const step = beginStep(
		job,
		"react-stage",
		"Prepare staged build for react-onchain",
	);
	try {
		const tempRoot = join(
			tmpdir(),
			`deck-react-onchain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		);
		const workDir = join(tempRoot, "work");
		const buildDir = join(tempRoot, "build");
		const manifestPath = join(workDir, "deployment-manifest.json");
		mkdirSync(workDir, { recursive: true });
		cpSync(intent.deckDir, buildDir, {
			recursive: true,
			filter: (src: string) => {
				const base = basename(src);
				return base !== ".git" && base !== ".vercel" && base !== "node_modules";
			},
		});
		const presenterPath = join(buildDir, "presenter.html");
		const indexPath = join(buildDir, "index.html");
		if (!existsSync(presenterPath)) {
			throw new Error("presenter.html is missing from staged build");
		}
		if (!existsSync(indexPath)) {
			copyFileSync(presenterPath, indexPath);
		}
		const existingManifestPath = join(
			intent.deckDir,
			"deployment-manifest.json",
		);
		if (existsSync(existingManifestPath)) {
			copyFileSync(existingManifestPath, manifestPath);
		}
		completeStep(job, step, "done", {
			output: `Staged build at ${buildDir} with index.html entrypoint`,
		});
		return { tempRoot, workDir, buildDir, manifestPath };
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

async function deployWithReactOnchain(
	job: PublishJob,
	intent: ReactOnchainPublishIntent,
	stage: ReactOnchainStage,
) {
	assertNotCancelled(job);
	const step = beginStep(
		job,
		"react-deploy",
		"Deploy deck using react-onchain",
	);
	try {
		const args = [
			"--yes",
			"react-onchain",
			"deploy",
			"--build-dir",
			stage.buildDir,
			"--app-name",
			intent.appName,
			"--version-tag",
			intent.versionTag,
			"--version-description",
			intent.versionDescription,
			"--manifest",
			stage.manifestPath,
			"--sats-per-kb",
			String(intent.satsPerKb),
		];
		if (intent.dryRun) {
			args.push("--dry-run");
		}
		if (intent.paymentKey?.trim()) {
			args.push("--payment-key", intent.paymentKey.trim());
		}
		if (intent.ordinalContentUrl?.trim()) {
			args.push("--ordinal-content-url", intent.ordinalContentUrl.trim());
		}
		if (intent.ordinalIndexerUrl?.trim()) {
			args.push("--ordinal-indexer-url", intent.ordinalIndexerUrl.trim());
		}

		const displayArgs = [...args];
		const paymentFlagIndex = displayArgs.indexOf("--payment-key");
		if (paymentFlagIndex >= 0 && paymentFlagIndex + 1 < displayArgs.length) {
			displayArgs[paymentFlagIndex + 1] = "[REDACTED]";
		}

		const { combined } = await runCommand(
			job,
			step,
			"npx",
			args,
			stage.workDir,
			{
				displayArgs,
			},
		);
		const deploymentUrl = parseReactOnchainDeploymentUrl(combined);
		const deploymentId = parseReactOnchainDeploymentId(deploymentUrl, combined);
		completeStep(job, step, "done", {
			output: deploymentUrl
				? `Deployment URL: ${deploymentUrl}`
				: "Deployment completed (URL not detected in CLI output)",
		});
		job.result = {
			...(job.result || {}),
			protocol: "react-onchain",
			deploymentUrl,
			deploymentId,
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

function persistReactOnchainManifest(
	job: PublishJob,
	intent: ReactOnchainPublishIntent,
	stage: ReactOnchainStage,
) {
	const step = beginStep(
		job,
		"react-manifest",
		"Persist react-onchain deployment manifest",
	);
	try {
		if (!existsSync(stage.manifestPath)) {
			completeStep(job, step, "done", {
				output: "No deployment-manifest.json generated by react-onchain",
			});
			return;
		}
		const targetPath = join(intent.deckDir, "deployment-manifest.json");
		const existed = existsSync(targetPath);
		copyFileSync(stage.manifestPath, targetPath);
		job.result = {
			...(job.result || {}),
			createdFiles: [...(job.result?.createdFiles || []), targetPath],
		};
		completeStep(job, step, "done", {
			output: existed
				? "Updated deployment-manifest.json"
				: "Created deployment-manifest.json",
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof PublishCancelledError ? "cancelled" : "error";
		completeStep(job, step, status, { error: msg });
		throw error;
	}
}

function cleanupReactOnchainStage(job: PublishJob, stage: ReactOnchainStage) {
	const step = beginStep(job, "react-cleanup", "Cleanup react-onchain staging");
	try {
		rmSync(stage.tempRoot, { recursive: true, force: true });
		completeStep(job, step, "done", {
			output: `Removed ${stage.tempRoot}`,
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		completeStep(job, step, "error", { error: msg });
	}
}

async function runReactOnchainPublish(
	job: PublishJob,
	intent: ReactOnchainPublishIntent,
) {
	const stage = prepareReactOnchainStage(job, intent);
	try {
		await deployWithReactOnchain(job, intent, stage);
		persistReactOnchainManifest(job, intent, stage);
	} finally {
		cleanupReactOnchainStage(job, stage);
	}
}

async function runPublishJob(job: PublishJob) {
	try {
		ensureDeckAssets(job, job.intent.deckDir);
		if (job.intent.method === "vercel") {
			if (job.intent.ensureVercelJson) {
				ensureVercelJson(job, job.intent.deckDir);
			}
			await handleRepoMode(job, job.intent.deckDir, job.intent.repoMode);
			await linkVercelProject(job, job.intent);
			await deployProject(job, job.intent);
		} else {
			await runReactOnchainPublish(job, job.intent);
		}
		job.status = "done";
		addLog(job, "Publish completed.");
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		job.status = error instanceof PublishCancelledError ? "cancelled" : "error";
		job.error = msg;
		addLog(
			job,
			error instanceof PublishCancelledError
				? `Publish cancelled: ${msg}`
				: `Publish failed: ${msg}`,
		);
	} finally {
		job.endedAt = Date.now();
		publishRuntimes.delete(job.id);
	}
}

export function createPublishJob(intent: PublishIntent): PublishJob {
	const id = `publish-${++publishJobCounter}`;
	const job: PublishJob = {
		id,
		status: "running",
		startedAt: Date.now(),
		intent: { ...intent, deckDir: resolve(intent.deckDir) },
		steps: [],
		logs: [],
	};
	publishJobs.set(id, job);
	getPublishRuntime(id);
	void runPublishJob(job);
	return job;
}

export function getPublishJob(id: string): PublishJob | undefined {
	return publishJobs.get(id);
}

export function cancelPublishJob(id: string): PublishJob | undefined {
	const job = publishJobs.get(id);
	if (!job) return undefined;
	if (job.status !== "running") return job;

	const runtime = getPublishRuntime(id);
	if (runtime.cancelRequested) return job;
	runtime.cancelRequested = true;
	addLog(job, "Cancellation requested by user.");

	if (runtime.activeChild && runtime.activeChild.exitCode === null) {
		addLog(job, "Sending SIGTERM to active publish process...");
		runtime.activeChild.kill("SIGTERM");
	}

	return job;
}

export function listVercelScopes(): {
	scopes: VercelScopeInfo[];
	error?: string;
} {
	const result = spawnSync("vercel", ["teams", "ls", "--no-color"], {
		stdio: "pipe",
		encoding: "utf-8",
		maxBuffer: 5 * 1024 * 1024,
		env: process.env,
	});
	if (result.status !== 0) {
		const stderr = (result.stderr || result.stdout || "").trim();
		return {
			scopes: [],
			error: stderr || "Failed to list Vercel scopes",
		};
	}
	const lines = (result.stdout || "").split("\n");
	const scopes: VercelScopeInfo[] = [];
	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line.trim()) continue;
		if (
			line.includes("Vercel CLI") ||
			line.startsWith("Fetching") ||
			line.includes("Team name") ||
			line.startsWith("id ")
		) {
			continue;
		}
		const current = line.includes("✔");
		const cleaned = line.replace("✔", " ").trimStart();
		const match = cleaned.match(/^([a-z0-9-]+)\s{2,}(.+)$/i);
		if (!match) continue;
		scopes.push({
			id: match[1].trim(),
			name: match[2].trim(),
			current,
		});
	}
	return { scopes };
}
