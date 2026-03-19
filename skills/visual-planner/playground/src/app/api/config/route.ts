import { NextResponse } from "next/server"

export async function GET() {
	return NextResponse.json({
		waitSignal: process.env.NEXT_PUBLIC_WAIT_SIGNAL === "1",
	})
}
