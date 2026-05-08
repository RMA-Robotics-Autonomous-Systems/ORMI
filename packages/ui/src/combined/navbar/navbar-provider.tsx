"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { createSafeContext } from "@workspace/utils";

export type NavbarZone = "left" | "center" | "right";

export interface NavbarRegistration {
	id: string;
	zone: NavbarZone;
	priority: number;
	sequence: number;
}

interface NavbarRegistryContextType {
	registrations: NavbarRegistration[];
	registerItem: (item: Omit<NavbarRegistration, "sequence">) => void;
	unregisterItem: (id: string) => void;
	setHostNode: (id: string, node: HTMLDivElement | null) => void;
	hostNodes: Map<string, HTMLDivElement>;
}

const [NavbarRegistryContextProvider, useNavbarRegistryContext] =
	createSafeContext<NavbarRegistryContextType>("NavbarRegistry");

interface NavbarProviderProps {
	children: React.ReactNode;
}

export interface NavbarItemProps {
	id: string;
	zone: NavbarZone;
	priority?: number;
	children: React.ReactNode;
	className?: string;
}

export const NavbarProvider = ({ children }: NavbarProviderProps) => {
	const sequenceRef = useRef(0);
	const [registrationsById, setRegistrationsById] = useState<
		Map<string, NavbarRegistration>
	>(new Map());
	const [hostNodes, setHostNodes] = useState<Map<string, HTMLDivElement>>(
		new Map(),
	);

	const registerItem = useCallback(
		(item: Omit<NavbarRegistration, "sequence">) => {
			setRegistrationsById((prev) => {
				const current = prev.get(item.id);
				if (
					current &&
					current.zone === item.zone &&
					current.priority === item.priority
				) {
					return prev;
				}

				const next = new Map(prev);
				next.set(item.id, {
					...item,
					sequence: current?.sequence ?? sequenceRef.current++,
				});
				return next;
			});
		},
		[],
	);

	const unregisterItem = useCallback((id: string) => {
		setRegistrationsById((prev) => {
			if (!prev.has(id)) {
				return prev;
			}

			const next = new Map(prev);
			next.delete(id);
			return next;
		});
		setHostNodes((prev) => {
			if (!prev.has(id)) {
				return prev;
			}

			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const setHostNode = useCallback(
		(id: string, node: HTMLDivElement | null) => {
			setHostNodes((prev) => {
				const current = prev.get(id) ?? null;
				if (current === node) {
					return prev;
				}

				const next = new Map(prev);
				if (node) {
					next.set(id, node);
				} else {
					next.delete(id);
				}
				return next;
			});
		},
		[],
	);

	const registrations = useMemo(() => {
		return Array.from(registrationsById.values()).sort((left, right) => {
			if (left.zone !== right.zone) {
				return left.zone.localeCompare(right.zone);
			}

			if (left.priority !== right.priority) {
				return left.priority - right.priority;
			}

			return left.sequence - right.sequence;
		});
	}, [registrationsById]);

	const value = useMemo(
		() => ({
			registrations,
			registerItem,
			unregisterItem,
			setHostNode,
			hostNodes,
		}),
		[registrations, registerItem, unregisterItem, setHostNode, hostNodes],
	);

	return (
		<NavbarRegistryContextProvider value={value}>
			{children}
		</NavbarRegistryContextProvider>
	);
};

export const NavbarItem = ({
	id,
	zone,
	priority = 5,
	children,
	className,
}: NavbarItemProps) => {
	const { registerItem, unregisterItem, hostNodes } =
		useNavbarRegistryContext();

	useEffect(() => {
		registerItem({ id, zone, priority });
		return () => unregisterItem(id);
	}, [id, zone, priority, registerItem, unregisterItem]);

	const hostNode = hostNodes.get(id);
	if (!hostNode) {
		return null;
	}

	return createPortal(
		<div
			className={className}
			data-navbar-item={id}
			style={{ height: "100%" }}
		>
			{children}
		</div>,
		hostNode,
	);
};

export const useNavbarRegistry = () => {
	return useNavbarRegistryContext();
};
