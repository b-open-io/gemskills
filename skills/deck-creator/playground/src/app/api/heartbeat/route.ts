import { writeFileSync } from "node:fs"

export async function POST() {
	const file = process.env.HEARTBEAT_FILE
	if (file) {
		writeFileSync(file, Date.now().toString())
	}
	return Response.json({ ok: true })
}
