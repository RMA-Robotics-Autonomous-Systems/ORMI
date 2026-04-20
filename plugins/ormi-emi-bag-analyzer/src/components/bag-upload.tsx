"use client";

import React, { useCallback } from "react";
import { Upload } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

interface BagUploadProps {
	onFileLoaded: (buffer: ArrayBuffer) => void;
	loading: boolean;
}

export function BagUpload({ onFileLoaded, loading }: BagUploadProps) {
	const handleFile = useCallback(
		(file: File) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result instanceof ArrayBuffer) {
					onFileLoaded(e.target.result);
				}
			};
			reader.readAsArrayBuffer(file);
		},
		[onFileLoaded],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			const file = e.dataTransfer.files[0];
			if (file) handleFile(file);
		},
		[handleFile],
	);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) handleFile(file);
		},
		[handleFile],
	);

	return (
		<label
			className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 transition-colors hover:border-primary hover:bg-muted/40"
			onDrop={handleDrop}
			onDragOver={(e) => e.preventDefault()}
		>
			<Upload className="h-8 w-8 text-muted-foreground" />
			<span className="text-sm font-medium">
				{loading
					? "Loading bag…"
					: "Drop a .db3 bag file or click to browse"}
			</span>
			<span className="text-xs text-muted-foreground">
				Processed entirely in the browser — nothing is uploaded.
			</span>
			<input
				type="file"
				accept=".db3"
				className="hidden"
				disabled={loading}
				onChange={handleInputChange}
			/>
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				type="button"
				onClick={(e) => {
					e.preventDefault();
					(
						e.currentTarget
							.previousElementSibling as HTMLInputElement
					)?.click();
				}}
			>
				Browse
			</Button>
		</label>
	);
}
