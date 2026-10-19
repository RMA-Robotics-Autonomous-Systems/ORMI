"use client";
import React, { useState } from "react";
import type { JsonSchema } from "@jsonforms/core";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Whether a resolved property schema marks its value as a secret, through the
 * standard JSON Schema `writeOnly` annotation (credentials such as a password,
 * a bearer token or an API key header value).
 *
 * @param schema - The control's resolved property schema.
 * @returns `true` when the value must be masked on screen.
 */
export function isSecretSchema(schema: JsonSchema | undefined): boolean {
	return (schema as { writeOnly?: unknown } | undefined)?.writeOnly === true;
}

/**
 * A masked text input with a show/hide toggle, for `writeOnly` string
 * properties. `autoComplete="new-password"` keeps the browser from filling in
 * the operator's own login credentials.
 *
 * @param props - Native input props; `type` and `autoComplete` are fixed.
 * @returns The masked input.
 */
export function SecretInput({
	className,
	disabled,
	...props
}: Omit<React.ComponentProps<"input">, "type" | "autoComplete">) {
	const [revealed, setRevealed] = useState(false);
	const label = revealed ? "Hide value" : "Show value";

	return (
		<div className="relative w-full">
			<Input
				{...props}
				type={revealed ? "text" : "password"}
				autoComplete="new-password"
				spellCheck={false}
				disabled={disabled}
				className={cn("pr-9", className)}
			/>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="text-muted-foreground absolute top-1/2 right-0.5 -translate-y-1/2"
				aria-label={label}
				aria-pressed={revealed}
				disabled={disabled}
				onClick={() => setRevealed((value) => !value)}
			>
				{revealed ? <EyeOffIcon /> : <EyeIcon />}
			</Button>
		</div>
	);
}
