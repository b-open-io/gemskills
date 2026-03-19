import { NextResponse } from "next/server";
import { getPublishJob } from "@/lib/server/publish";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const job = getPublishJob(jobId);
	if (!job) {
		return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
	}
	return NextResponse.json({ ok: true, job });
}
