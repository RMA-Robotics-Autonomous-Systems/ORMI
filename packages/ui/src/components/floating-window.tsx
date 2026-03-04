"use client";

import React, { useRef, useState, useEffect } from "react";
import { X, Minus, Plus } from "lucide-react";
import { Button } from "./button";

export interface FloatingWindowProps {
	title: string;
	description?: string;
	children: React.ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultWidth?: number;
	defaultHeight?: number;
}

/**
 * Free-floating, resizable, and draggable window component.
 * Manages position and size with keyboard/mouse controls.
 */
export const FloatingWindow: React.FC<FloatingWindowProps> = ({
	title,
	description,
	children,
	open,
	onOpenChange,
	defaultWidth = 1200,
	defaultHeight = 700,
}) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ x: 100, y: 100 });
	const [size, setSize] = useState({
		width: defaultWidth,
		height: defaultHeight,
	});
	const [isMinimized, setIsMinimized] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
	const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
	const [resizeStartSize, setResizeStartSize] = useState({
		width: 0,
		height: 0,
	});

	// Handle drag start
	const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
		// Prevent drag if clicking on buttons
		if ((e.target as HTMLElement).closest("button")) {
			return;
		}
		if (isMinimized) return;
		const rect = windowRef.current?.getBoundingClientRect();
		if (!rect) return;

		setIsDragging(true);
		setDragOffset({
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		});
	};

	// Handle resize start
	const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsResizing(true);
		setResizeStart({ x: e.clientX, y: e.clientY });
		setResizeStartSize({ width: size.width, height: size.height });
	};

	// Global mouse move for dragging
	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			const newX = e.clientX - dragOffset.x;
			const newY = e.clientY - dragOffset.y;

			setPosition({
				x: Math.max(0, newX),
				y: Math.max(0, newY),
			});
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, dragOffset]);

	// Global mouse move for resizing
	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = e.clientX - resizeStart.x;
			const deltaY = e.clientY - resizeStart.y;

			const newWidth = Math.max(400, resizeStartSize.width + deltaX);
			const newHeight = Math.max(300, resizeStartSize.height + deltaY);

			setSize({
				width: newWidth,
				height: newHeight,
			});
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, resizeStart, resizeStartSize]);

	if (!open) return null;

	return (
		<div
			ref={windowRef}
			className="fixed bg-card border border-border rounded-lg shadow-2xl flex flex-col z-50"
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				width: isMinimized ? "auto" : `${size.width}px`,
				height: isMinimized ? "auto" : `${size.height}px`,
			}}
		>
			{/* Header - Draggable */}
			<div
				ref={headerRef}
				onMouseDown={handleDragStart}
				className="flex items-center justify-between p-4 border-b border-border bg-background cursor-move rounded-t-[calc(0.5rem-1px)] select-none hover:bg-secondary/20 transition-colors"
			>
				<div className="flex-1">
					<h2 className="text-sm font-semibold text-foreground">
						{title}
					</h2>
					{description && (
						<p className="text-xs text-muted-foreground mt-1">
							{description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={() => setIsMinimized(!isMinimized)}
						title={isMinimized ? "Restore" : "Minimize"}
					>
						{isMinimized ? (
							<Plus className="h-4 w-4" />
						) : (
							<Minus className="h-4 w-4" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={() => onOpenChange(false)}
						title="Close"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Content */}
			{!isMinimized && (
				<div className="flex-1 overflow-hidden flex flex-col bg-card">
					{children}
				</div>
			)}

			{/* Resize Handle */}
			{!isMinimized && (
				<div
					onMouseDown={handleResizeStart}
					className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize hover:bg-primary/10 transition-colors"
					title="Drag to resize"
				>
					<svg
						className="absolute bottom-0 right-0 w-4 h-4 text-muted-foreground opacity-50"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<polyline points="21 21 13 13 5 21"></polyline>
						<polyline points="21 21 21 13"></polyline>
						<polyline points="21 21 13 21"></polyline>
					</svg>
				</div>
			)}
		</div>
	);
};
