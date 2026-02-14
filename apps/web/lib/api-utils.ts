import { NextResponse } from "next/server";

export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}

export function ok(data: unknown, status = 200) {
	return apiResponse(data, status);
}

export function err(data: unknown, status = 400) {
	const payload = typeof data === "string" ? { error: data } : data;
	return apiResponse(payload, status);
}
