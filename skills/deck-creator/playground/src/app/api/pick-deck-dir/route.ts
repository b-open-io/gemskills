import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

async function pickDirectoryMac(): Promise<string> {
	const script =
		'set chosenFolder to choose folder with prompt "Select deck folder" default location (path to home folder)\nreturn POSIX path of chosenFolder';
	const { stdout } = await execFileAsync("osascript", ["-e", script], {
		maxBuffer: 1024 * 1024,
	});
	return stdout.trim().replace(/\/+$/, "");
}

/** POST — open native folder picker and return selected deck path */
export async function POST() {
	try {
		if (process.platform !== "darwin") {
			return NextResponse.json(
				{
					ok: false,
					error: "Native folder picker is currently supported on macOS only",
				},
				{ status: 501 },
			);
		}

		const selected = await pickDirectoryMac();
		const resolved = resolve(selected);

		if (!existsSync(resolved)) {
			return NextResponse.json(
				{ ok: false, error: `Directory not found: ${resolved}` },
				{ status: 404 },
			);
		}

		const home = process.env.HOME || "/Users";
		if (!resolved.startsWith(home)) {
			return NextResponse.json(
				{ ok: false, error: "Path must be within home directory" },
				{ status: 403 },
			);
		}

		return NextResponse.json({ ok: true, path: resolved });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		const lower = msg.toLowerCase();
		if (lower.includes("user canceled") || lower.includes("cancelled")) {
			return NextResponse.json({ ok: false, cancelled: true });
		}
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}
