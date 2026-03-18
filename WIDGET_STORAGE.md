# Widget Storage — Implementation Design

Generic persistence layer for widget instance state (viewport, rotation, loaded assets, annotations, etc.).

---

## Problem Statement

Widgets currently have two places to store data:

| Where                                           | What                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `widget.settings` (JSON in workspace `content`) | User-configured settings managed through the JSONForms settings panel |
| ROS topic stream                                | Live data — ephemeral, not persisted                                  |

There is no place for a widget to save **runtime state that is not a user setting**: camera position after the user pans around a 3D scene, a 3D model the user loaded at runtime, an annotation layer, a zoom level, etc.

This document covers a `WidgetStorage` feature that fills that gap.

---

## Goals

- Widgets can persist arbitrary JSON state and/or a reference to a large external asset (blobUrl).
- Zero boilerplate for widget developers — a single hook, one namespace string.
- Scoped automatically to the widget instance (type + box_id) and optionally to the workspace.
- No changes to `packages/ormi-core` public API or any core types — **core immutability rule is respected**.

---

## Non-goals

- Binary / file storage — the DB holds only a URL pointer; uploading bytes to an object store is a separate concern and is intentionally deferred.
- Real-time sync — this is a save/restore mechanism, not a reactive stream.
- Shared state between widget instances.

---

## Architecture Overview

```
Widget component
  └─ useWidgetStorage("camera")
       └─ reads WidgetInstanceContext   ← injected by WidgetHost (packages/ormi-core)
            ├─ widgetType  e.g. "std-scene-3d"
            └─ instanceId  e.g. box_id "abc-123"
       └─ storageApi.get / upsert       ← apps/web/lib/api/storage-api.ts
            └─ HTTP  /api/storage
                 └─ withAuth → prisma-widget-storage.ts
                      └─ WidgetStorage table (Prisma)
```

---

## 1. Database Schema

File: `apps/web/prisma/schema.prisma`

```prisma
model WidgetStorage {
    id          Int       @id @default(autoincrement())

    /// User who owns this record
    createdById String
    createdBy   User      @relation(fields: [createdById], references: [id], onDelete: Cascade)

    /// Optional workspace scope. Null = user-global record (shared across workspaces).
    workspaceId Int?
    workspace   Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

    /// WidgetDefinition.id  e.g. "std-scene-3d"
    widgetType  String

    /// box_id from widgetsAtom — unique per widget instance on a dashboard
    instanceId  String

    /// Bucket name within a widget instance e.g. "camera", "model", "annotations"
    namespace   String    @default("default")

    /// Small structured state (rotation, zoom, toggles, …)
    data        Json?

    /// URL pointing to a large external asset (3D model, map file, …) — bytes stored elsewhere
    blobUrl     String?

    /// MIME type of the asset at blobUrl — helps consumers know how to decode it
    mimeType    String?

    createdAT   DateTime  @default(now())
    updatedAT   DateTime  @updatedAt

    /// One record per logical slot — upsert-friendly
    @@unique([createdById, workspaceId, widgetType, instanceId, namespace])
    @@index([createdById, widgetType, instanceId])
}
```

**Notes on the unique constraint:**

The combination `(createdById, workspaceId, widgetType, instanceId, namespace)` is the natural key. PostgreSQL treats two `NULL` values as not equal in unique constraints, meaning two rows with `workspaceId = NULL` and otherwise identical keys would not conflict. We handle this with a **partial Prisma upsert** that uses `workspaceId: null` explicitly (Prisma converts this to `IS NULL` in the where clause).

**Migrations needed:**

- Add `WidgetStorage` model.
- Add `widgetStorages WidgetStorage[]` back-relation on `User`.
- Add `widgetStorages WidgetStorage[]` back-relation on `Workspace`.

---

## 2. Zod Validations

File: `apps/web/lib/validations/widget-storage.ts`

```typescript
import { z } from "zod";

export const widgetStorageReadSchema = z.object({
	widgetType: z.string().min(1),
	instanceId: z.string().min(1),
	namespace: z.string().min(1).default("default"),
	workspaceId: z.coerce.number().int().positive().optional(),
});

export const widgetStorageUpsertSchema = z.object({
	widgetType: z.string().min(1),
	instanceId: z.string().min(1),
	namespace: z.string().min(1).default("default"),
	workspaceId: z.number().int().positive().optional().nullable(),
	data: z.record(z.unknown()).nullable().optional(),
	blobUrl: z.string().url().nullable().optional(),
	mimeType: z.string().nullable().optional(),
});

export const widgetStorageDeleteSchema = z.object({
	widgetType: z.string().min(1),
	instanceId: z.string().min(1),
	namespace: z.string().min(1).default("default"),
	workspaceId: z.coerce.number().int().positive().optional().nullable(),
});

export type WidgetStorageUpsertInput = z.infer<
	typeof widgetStorageUpsertSchema
>;
```

---

## 3. Server Helper

File: `apps/web/server/prisma-widget-storage.ts`

```typescript
import { db } from "./db";
import type { WidgetStorageUpsertInput } from "@/lib/validations/widget-storage";

export interface WidgetStorageRecord {
	id: number;
	widgetType: string;
	instanceId: string;
	namespace: string;
	workspaceId: number | null;
	data: unknown;
	blobUrl: string | null;
	mimeType: string | null;
	updatedAT: Date;
}

/** Read one storage record or null if not found. */
export async function getWidgetStorage(
	userId: string,
	widgetType: string,
	instanceId: string,
	namespace: string,
	workspaceId?: number | null,
): Promise<WidgetStorageRecord | null> {
	return db.widgetStorage.findFirst({
		where: {
			createdById: userId,
			widgetType,
			instanceId,
			namespace,
			workspaceId: workspaceId ?? null,
		},
		select: {
			id: true,
			widgetType: true,
			instanceId: true,
			namespace: true,
			workspaceId: true,
			data: true,
			blobUrl: true,
			mimeType: true,
			updatedAT: true,
		},
	});
}

/** Upsert a storage record (insert or overwrite). */
export async function upsertWidgetStorage(
	userId: string,
	input: WidgetStorageUpsertInput,
): Promise<WidgetStorageRecord> {
	const {
		widgetType,
		instanceId,
		namespace,
		workspaceId,
		data,
		blobUrl,
		mimeType,
	} = input;

	return db.widgetStorage.upsert({
		where: {
			createdById_workspaceId_widgetType_instanceId_namespace: {
				createdById: userId,
				workspaceId: workspaceId ?? null,
				widgetType,
				instanceId,
				namespace,
			},
		},
		create: {
			createdById: userId,
			workspaceId: workspaceId ?? null,
			widgetType,
			instanceId,
			namespace,
			data: data ?? undefined,
			blobUrl: blobUrl ?? null,
			mimeType: mimeType ?? null,
		},
		update: {
			data: data !== undefined ? data : undefined,
			blobUrl: blobUrl !== undefined ? blobUrl : undefined,
			mimeType: mimeType !== undefined ? mimeType : undefined,
		},
		select: {
			id: true,
			widgetType: true,
			instanceId: true,
			namespace: true,
			workspaceId: true,
			data: true,
			blobUrl: true,
			mimeType: true,
			updatedAT: true,
		},
	});
}

/** Delete one storage record. Returns true if a record was deleted. */
export async function deleteWidgetStorage(
	userId: string,
	widgetType: string,
	instanceId: string,
	namespace: string,
	workspaceId?: number | null,
): Promise<boolean> {
	const record = await db.widgetStorage.findFirst({
		where: {
			createdById: userId,
			widgetType,
			instanceId,
			namespace,
			workspaceId: workspaceId ?? null,
		},
		select: { id: true },
	});
	if (!record) return false;
	await db.widgetStorage.delete({ where: { id: record.id } });
	return true;
}
```

**Review note — why `findFirst` + `delete` instead of `deleteMany`?**
The unique constraint makes both equivalent here. `findFirst` + `delete` by `id` is more explicit and avoids ambiguity when `workspaceId` is `null` (the `@@unique` key includes a nullable column; using `id` for the actual delete removes that ambiguity entirely).

---

## 4. API Route

File: `apps/web/app/api/storage/route.ts`

```typescript
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { apiResponse } from "@/lib/api-utils";
import {
	widgetStorageReadSchema,
	widgetStorageUpsertSchema,
	widgetStorageDeleteSchema,
} from "@/lib/validations/widget-storage";
import {
	getWidgetStorage,
	upsertWidgetStorage,
	deleteWidgetStorage,
} from "@/server/prisma-widget-storage";

/** GET /api/storage?widgetType=X&instanceId=Y&namespace=Z&workspaceId=1 */
export const GET = withAuth(async (req: NextRequest, session) => {
	const params = Object.fromEntries(req.nextUrl.searchParams.entries());
	const parsed = widgetStorageReadSchema.safeParse(params);
	if (!parsed.success)
		return apiResponse({ error: parsed.error.flatten() }, 400);

	const { widgetType, instanceId, namespace, workspaceId } = parsed.data;
	const record = await getWidgetStorage(
		session.user.id,
		widgetType,
		instanceId,
		namespace,
		workspaceId,
	);
	return apiResponse(record ?? null);
});

/** PUT /api/storage — upsert */
export const PUT = withAuth(async (req: NextRequest, session) => {
	const body = await req.json();
	const parsed = widgetStorageUpsertSchema.safeParse(body);
	if (!parsed.success)
		return apiResponse({ error: parsed.error.flatten() }, 400);

	const record = await upsertWidgetStorage(session.user.id, parsed.data);
	return apiResponse(record);
});

/** DELETE /api/storage?widgetType=X&instanceId=Y&namespace=Z */
export const DELETE = withAuth(async (req: NextRequest, session) => {
	const params = Object.fromEntries(req.nextUrl.searchParams.entries());
	const parsed = widgetStorageDeleteSchema.safeParse(params);
	if (!parsed.success)
		return apiResponse({ error: parsed.error.flatten() }, 400);

	const { widgetType, instanceId, namespace, workspaceId } = parsed.data;
	const deleted = await deleteWidgetStorage(
		session.user.id,
		widgetType,
		instanceId,
		namespace,
		workspaceId,
	);
	return apiResponse({ deleted });
});
```

---

## 5. Client API Wrapper

File: `apps/web/lib/api/storage-api.ts`

```typescript
import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";

export interface WidgetStorageRecord {
	id: number;
	widgetType: string;
	instanceId: string;
	namespace: string;
	workspaceId: number | null;
	data: unknown;
	blobUrl: string | null;
	mimeType: string | null;
	updatedAT: string;
}

export interface UpsertWidgetStorageInput {
	widgetType: string;
	instanceId: string;
	namespace?: string;
	workspaceId?: number | null;
	data?: Record<string, unknown> | null;
	blobUrl?: string | null;
	mimeType?: string | null;
}

export const storageApi = {
	async get(
		widgetType: string,
		instanceId: string,
		namespace = "default",
		workspaceId?: number | null,
	): Promise<ApiResult<WidgetStorageRecord | null>> {
		const params = new URLSearchParams({
			widgetType,
			instanceId,
			namespace,
		});
		if (workspaceId != null) params.set("workspaceId", String(workspaceId));
		return httpClient.get<WidgetStorageRecord | null>(
			`/api/storage?${params}`,
		);
	},

	async upsert(
		input: UpsertWidgetStorageInput,
	): Promise<ApiResult<WidgetStorageRecord>> {
		return httpClient.put<WidgetStorageRecord>("/api/storage", input);
	},

	async delete(
		widgetType: string,
		instanceId: string,
		namespace = "default",
		workspaceId?: number | null,
	): Promise<ApiResult<{ deleted: boolean }>> {
		const params = new URLSearchParams({
			widgetType,
			instanceId,
			namespace,
		});
		if (workspaceId != null) params.set("workspaceId", String(workspaceId));
		return httpClient.delete<{ deleted: boolean }>(
			`/api/storage?${params}`,
		);
	},
};
```

---

## 6. WidgetInstance Context (ormi-core)

This is the injection point. `WidgetHost` already has `widgetId` (the `box_id`) and calls `getDefinition(widget.widget_id)` which resolves the `WidgetDefinition`. Both pieces of information needed to uniquely identify the runtime instance are available there.

### 6a. Context definition

File: `packages/ormi-core/src/dashboard/layout/widget-instance-context.tsx`

```typescript
"use client";

import React, { ReactNode } from "react";
import { createSafeContext } from "@workspace/utils";

export interface WidgetInstanceContextValue {
	/** WidgetDefinition.id  e.g. "std-scene-3d" */
	widgetType: string;
	/** box_id from widgetsAtom — unique per widget instance on a dashboard */
	instanceId: string;
}

export const [WidgetInstanceProvider, useWidgetInstance] =
	createSafeContext<WidgetInstanceContextValue>("WidgetInstance");
```

### 6b. Injection into WidgetHost

File: `packages/ormi-core/src/dashboard/layout/widget-host.tsx` — one addition inside `WidgetHostComponent`:

```diff
+ import { WidgetInstanceProvider } from "./widget-instance-context";

  return (
      <ButtonHolderProvider>
+         <WidgetInstanceProvider value={{ widgetType: widget.widget_id, instanceId: widgetId }}>
              <div className={className ?? "w-full h-full overflow-hidden"}>
                  {portalTarget && (
                      <ButtonHolderPortal portalTarget={portalTarget} />
                  )}
                  <WidgetComponent {...widget.settings} />
              </div>
+         </WidgetInstanceProvider>
      </ButtonHolderProvider>
  );
```

The context is consumed exclusively by `useWidgetStorage` — nothing else in core
references it.

### 6c. Export from core

File: `packages/ormi-core/src/index.ts` — add:

```typescript
export { useWidgetInstance } from "./dashboard/layout/widget-instance-context";
export type { WidgetInstanceContextValue } from "./dashboard/layout/widget-instance-context";
```

---

## 7. useWidgetStorage Hook

File: `packages/utils/src/use-widget-storage.ts`

This is the **only** surface widget developers ever touch.

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWidgetInstance } from "@workspace/ormi-core";

export interface WidgetStorageOptions {
	/** When true the record is user-global (workspaceId omitted). Default: false (workspace-scoped). */
	global?: boolean;
	/** workspaceId to scope the record to. Required when global is false. */
	workspaceId?: number | null;
}

export interface UseWidgetStorageReturn<T> {
	/** Current value, null while loading or if no record exists yet. */
	value: T | null;
	/** Persist a new value. Resolves when the server responds. */
	save: (next: T) => Promise<void>;
	/** Delete the stored record for this namespace. */
	clear: () => Promise<void>;
	loading: boolean;
	error: string | null;
}

/**
 * Persist and restore widget runtime state.
 *
 * @param namespace - Bucket name within this widget instance. Use distinct strings
 *                    for independent state buckets e.g. "camera", "model", "annotations".
 * @param options   - Scope options. Pass `{ global: true }` for user-level (cross-workspace) state.
 *
 * @example
 * const { value: camera, save: saveCamera } = useWidgetStorage<CameraState>("camera");
 */
export function useWidgetStorage<T>(
	namespace: string,
	options: WidgetStorageOptions = {},
): UseWidgetStorageReturn<T> {
	//
	// NOTE: storageApi is imported lazily (inside the hook body) to avoid
	//       bundling apps/web HTTP details into packages/utils.
	//       The concrete import is injected via a module-level setter — see
	//       "Dependency injection" section below.
	//
	const { widgetType, instanceId } = useWidgetInstance();
	const workspaceId = options.global ? null : (options.workspaceId ?? null);

	const [value, setValue] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const savedRef = useRef<T | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		getStorageAdapter()
			.get(widgetType, instanceId, namespace, workspaceId)
			.then((result) => {
				if (cancelled) return;
				if (result.ok && result.data?.data) {
					setValue(result.data.data as T);
					savedRef.current = result.data.data as T;
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(String(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [widgetType, instanceId, namespace, workspaceId]);

	const save = useCallback(
		async (next: T) => {
			savedRef.current = next;
			setValue(next);
			const result = await getStorageAdapter().upsert({
				widgetType,
				instanceId,
				namespace,
				workspaceId,
				data: next as Record<string, unknown>,
			});
			if (!result.ok) setError(result.error);
		},
		[widgetType, instanceId, namespace, workspaceId],
	);

	const clear = useCallback(async () => {
		setValue(null);
		savedRef.current = null;
		await getStorageAdapter().delete(
			widgetType,
			instanceId,
			namespace,
			workspaceId,
		);
	}, [widgetType, instanceId, namespace, workspaceId]);

	return { value, save, clear, loading, error };
}
```

### Dependency injection — decoupling utils from apps/web

`packages/utils` must not import from `apps/web`. The `storageApi` object lives in `apps/web`. Two clean options exist:

**Option A — Adapter registration (recommended)**

`packages/utils` exports a `registerStorageAdapter(adapter)` function. `apps/web` calls it once at app startup (e.g. in `app/layout.tsx`). `useWidgetStorage` calls `getStorageAdapter()` which throws a descriptive error if nothing was registered.

```typescript
// packages/utils/src/use-widget-storage.ts
let _adapter: StorageAdapter | null = null;

export interface StorageAdapter {
    get(widgetType: string, instanceId: string, namespace: string, workspaceId: number | null): Promise<...>;
    upsert(input: UpsertInput): Promise<...>;
    delete(widgetType: string, instanceId: string, namespace: string, workspaceId: number | null): Promise<...>;
}

export function registerStorageAdapter(adapter: StorageAdapter) {
    _adapter = adapter;
}

function getStorageAdapter(): StorageAdapter {
    if (!_adapter) throw new Error(
        "[useWidgetStorage] No storage adapter registered. Call registerStorageAdapter() in your app entry point."
    );
    return _adapter;
}
```

**Option B — Pass the fetcher as a prop to the context**

`WidgetInstanceContext` carries a `storage` field of type `StorageAdapter` injected by `DashboardShell`. Avoids a module-level mutable, but requires `DashboardShell` to receive the adapter as a prop. This works but drags the dependency up into core.

Option A is preferable — it keeps the injection boundary at the app layer.

---

## 8. App-level registration

File: `apps/web/app/layout.tsx` (or a dedicated client bootstrap file)

```typescript
import { registerStorageAdapter } from "@workspace/utils";
import { storageApi } from "@/lib/api/storage-api";

// Called once at module evaluation time — safe because storageApi is stateless.
registerStorageAdapter(storageApi);
```

---

## Summary — File Change List

| File                                                                  | Change                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/prisma/schema.prisma`                                       | Add `WidgetStorage` model + back-relations on `User` and `Workspace` |
| `apps/web/server/prisma-widget-storage.ts`                            | **New** — server helpers (`get`, `upsert`, `delete`)                 |
| `apps/web/lib/validations/widget-storage.ts`                          | **New** — Zod schemas                                                |
| `apps/web/app/api/storage/route.ts`                                   | **New** — `GET`, `PUT`, `DELETE` handlers                            |
| `apps/web/lib/api/storage-api.ts`                                     | **New** — client HTTP wrapper                                        |
| `apps/web/app/layout.tsx`                                             | 2-line addition — `registerStorageAdapter`                           |
| `packages/ormi-core/src/dashboard/layout/widget-instance-context.tsx` | **New** — context + provider                                         |
| `packages/ormi-core/src/dashboard/layout/widget-host.tsx`             | Wrap `WidgetComponent` in `WidgetInstanceProvider`                   |
| `packages/ormi-core/src/index.ts`                                     | Export `useWidgetInstance`                                           |
| `packages/utils/src/use-widget-storage.ts`                            | **New** — `useWidgetStorage`, `registerStorageAdapter`               |
| `packages/utils/src/index.ts`                                         | Export `useWidgetStorage`, `registerStorageAdapter`                  |

Migration: `prisma migrate dev --name add-widget-storage`

---

## Open Questions / Review Points

1. **NULL uniqueness in Postgres** — the `@@unique` on a nullable `workspaceId` behaves as described (NULLs are not equal), so two global records for the same widget-type/instance/namespace owned by the same user would not conflict correctly. The server helper uses `findFirst` which sidesteps this; the upsert uses the explicit `null` comparator Prisma generates. Worth a smoke test.

2. **`blobUrl` field** — currently a placeholder. When file upload lands, should the upload endpoint write the URL directly (server-side), or should the client fetch a presigned URL, upload, then call `PUT /api/storage`? The latter is more standard (S3/MinIO pattern) and keeps this route small.

3. **Stale state when a widget instance is deleted** — records are not cleaned up when a widget is removed from a dashboard. Two strategies: (a) on-demand cleanup hook in `useDashboardActions.removeWidget`, (b) a background job that GCs orphaned `instanceId`s. Neither is blocking for MVP.

4. **Adapter registration timing** — `registerStorageAdapter` is called at module evaluation time. In Next.js app router with React Server Components, `app/layout.tsx` can be a server component. The call must be in a client boundary (`"use client"` file) or a client-only bootstrap module.

5. **core immutability** — `widget-host.tsx` is in `packages/ormi-core`. The change is strictly additive (one wrapping provider, no API changes). This qualifies as an approved additive change but should be confirmed before the PR.
