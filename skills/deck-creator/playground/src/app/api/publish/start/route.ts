import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { getDeckDir } from "@/lib/server/deck";
import {
	createPublishJob,
	type DeployTarget,
	type ProjectStrategy,
	type PublishMethod,
	type RepoMode,
} from "@/lib/server/publish";

type StartPublishBody = {
	method?: PublishMethod;
	deckDir?: string;
	promptText?: string;
	scope?: string;
	projectName?: string;
	repoMode?: RepoMode;
	projectStrategy?: ProjectStrategy;
	deployTarget?: DeployTarget;
	ensureVercelJson?: boolean;
	appName?: string;
	versionTag?: string;
	versionDescription?: string;
	paymentKey?: string;
	satsPerKb?: number;
	dryRun?: boolean;
	ordinalContentUrl?: string;
	ordinalIndexerUrl?: string;
};

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as StartPublishBody;
		const method = body.method || "vercel";
		if (!["vercel", "react-onchain"].includes(method)) {
			return NextResponse.json(
				{ ok: false, error: `Unsupported publish method "${body.method}"` },
				{ status: 400 },
			);
		}
		if (!body.deckDir?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "deckDir is required" },
				{ status: 400 },
			);
		}
		const deckDir = resolve(body.deckDir);
		const currentDeck = resolve(getDeckDir());
		if (deckDir !== currentDeck) {
			return NextResponse.json(
				{
					ok: false,
					error:
						"Deck directory mismatch — refresh the publish dialog and retry",
				},
				{ status: 409 },
			);
		}
		if (method === "vercel") {
			if (!body.scope?.trim()) {
				return NextResponse.json(
					{ ok: false, error: "scope is required" },
					{ status: 400 },
				);
			}
			if (!body.projectName?.trim()) {
				return NextResponse.json(
					{ ok: false, error: "projectName is required" },
					{ status: 400 },
				);
			}
			const repoMode: RepoMode = body.repoMode || "keep-nested";
			if (!["keep-nested", "init-deck-repo"].includes(repoMode)) {
				return NextResponse.json(
					{ ok: false, error: `Unsupported repoMode "${repoMode}"` },
					{ status: 400 },
				);
			}
			const projectStrategy: ProjectStrategy =
				body.projectStrategy || "create-new-project";
			if (
				![
					"create-new-project",
					"link-existing-project",
					"reuse-current-link",
				].includes(projectStrategy)
			) {
				return NextResponse.json(
					{
						ok: false,
						error: `Unsupported projectStrategy "${projectStrategy}"`,
					},
					{ status: 400 },
				);
			}
			const deployTarget: DeployTarget = body.deployTarget || "production";
			if (!["production", "preview"].includes(deployTarget)) {
				return NextResponse.json(
					{ ok: false, error: `Unsupported deployTarget "${deployTarget}"` },
					{ status: 400 },
				);
			}

			const job = createPublishJob({
				method: "vercel",
				deckDir,
				scope: body.scope.trim(),
				projectName: body.projectName.trim(),
				repoMode,
				projectStrategy,
				deployTarget,
				ensureVercelJson: body.ensureVercelJson !== false,
				promptText: body.promptText,
			});
			return NextResponse.json({ ok: true, job });
		}

		if (!body.appName?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "appName is required for react-onchain" },
				{ status: 400 },
			);
		}
		if (!body.versionTag?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "versionTag is required for react-onchain" },
				{ status: 400 },
			);
		}
		if (!body.versionDescription?.trim()) {
			return NextResponse.json(
				{
					ok: false,
					error: "versionDescription is required for react-onchain",
				},
				{ status: 400 },
			);
		}
		const dryRun = body.dryRun === true;
		if (!dryRun && !body.paymentKey?.trim()) {
			return NextResponse.json(
				{
					ok: false,
					error: "paymentKey is required unless dryRun is enabled",
				},
				{ status: 400 },
			);
		}
		const satsPerKb =
			typeof body.satsPerKb === "number" && Number.isFinite(body.satsPerKb)
				? body.satsPerKb
				: 1;
		if (satsPerKb <= 0) {
			return NextResponse.json(
				{ ok: false, error: "satsPerKb must be greater than 0" },
				{ status: 400 },
			);
		}

		const job = createPublishJob({
			method: "react-onchain",
			deckDir,
			appName: body.appName.trim(),
			versionTag: body.versionTag.trim(),
			versionDescription: body.versionDescription.trim(),
			paymentKey: body.paymentKey?.trim() || undefined,
			satsPerKb,
			dryRun,
			ordinalContentUrl: body.ordinalContentUrl?.trim() || undefined,
			ordinalIndexerUrl: body.ordinalIndexerUrl?.trim() || undefined,
			promptText: body.promptText,
		});
		return NextResponse.json({ ok: true, job });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}
