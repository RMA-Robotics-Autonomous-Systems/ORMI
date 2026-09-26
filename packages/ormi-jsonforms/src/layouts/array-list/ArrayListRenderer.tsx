"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
	and,
	ArrayLayoutProps,
	composePaths,
	createDefaultValue,
	deriveTypes,
	findUISchema,
	isObjectArrayControl,
	isObjectArrayWithNesting,
	isPrimitiveArrayControl,
	JsonSchema,
	not,
	or,
	RankedTester,
	rankWith,
	resolveSchema,
	Resolve,
	schemaMatches,
	UISchemaElement,
} from "@jsonforms/core";
import {
	DispatchCell,
	JsonFormsDispatch,
	useJsonForms,
	withJsonFormsArrayLayoutProps,
} from "@jsonforms/react";
import merge from "lodash/merge";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronRightIcon,
	CircleAlertIcon,
	PlusIcon,
	XIcon,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { cn } from "@workspace/ui/lib/utils";

import { deriveItemNoun, ItemNoun } from "./item-noun";
import { deriveRowTitle } from "./row-title";
import {
	describeArrayIssue,
	mapErrorsToArray,
	mapErrorsToRows,
	RowIssue,
	summarizeRowIssues,
	ValidationErrorLike,
} from "./row-issues";
import {
	moveRowKey,
	nextRowKey,
	reconcileRowKeys,
	removeRowKey,
} from "./row-keys";

/**
 * The one array renderer: a card per row for object arrays, a compact row per
 * value for scalar arrays, both with remove, reorder and an Add button below.
 *
 * It replaces the accordion layout (nested object arrays), the pseudo-table
 * (flat object and scalar arrays) and their confirm dialog. Every row renders
 * full controls through `JsonFormsDispatch`, never table cells, so a
 * `TopicSelect`, a `Key` binding or a slider inside a row behaves exactly as it
 * does at the top level of the form.
 *
 * - **Row headings** are derived (`deriveRowTitle`): a declared name, then the
 *   bound topic, then "Series 2". Never a placeholder.
 * - **Errors** are attributed to rows (`mapErrorsToRows`) and stated in the
 *   row heading by field name; the controls keep their inline messages.
 * - **Remove** is immediate: the configuration dialog's Cancel is the undo.
 * - **Reorder** is on by default for object rows (order is meaningful: a
 *   conditional status matches first-to-last, series and layers draw in list
 *   order). `orderable: false` turns it off; scalar rows opt in with
 *   `orderable: true` or `showSortButtons: true`.
 * - A **new row** opens expanded, takes focus and is scrolled into view.
 */

/** Row state the list keeps beside the JSON Forms data. */
interface RowState {
	/** Stable React key per row, parallel to the data (see `row-keys.ts`). */
	keys: readonly number[];
	/** Keys of the rows whose card is open. */
	expanded: ReadonlySet<number>;
	/** Keys of rows added in this session, which fade in once. */
	added: ReadonlySet<number>;
}

/** Scalar types a row can hold as a bare value. */
const SCALAR_TYPES = ["string", "number", "integer", "boolean"];

/**
 * Whether the array's items are bare scalars.
 *
 * @param itemSchema - Resolved item schema.
 * @returns True for `string` / `number` / `integer` / `boolean` items.
 */
function isScalarItems(itemSchema: JsonSchema): boolean {
	const types = deriveTypes(itemSchema);
	return types.length === 1 && SCALAR_TYPES.includes(types[0]!);
}

/**
 * The layout a row card renders its fields with.
 *
 * An unlabelled `Group` detail would draw a second framed box inside the card
 * that already frames the row, so it is flattened into a vertical layout. A
 * labelled group keeps its frame: the label is content.
 *
 * @param found - The uischema `findUISchema` resolved for the item.
 * @returns The layout to dispatch.
 */
function rowLayout(found: UISchemaElement): UISchemaElement {
	const labelled = (found as { label?: unknown }).label;
	if (found.type === "Group" && !labelled) {
		return { ...found, type: "VerticalLayout" } as UISchemaElement;
	}
	return found;
}

/**
 * The errors JSON Forms would show, honouring the validation mode.
 *
 * @param core - JSON Forms core state.
 * @returns Errors to attribute to rows.
 */
function visibleErrors(
	core: ReturnType<typeof useJsonForms>["core"],
): readonly ValidationErrorLike[] {
	if (!core || core.validationMode === "NoValidation") return [];
	const additional = (core.additionalErrors ?? []) as ValidationErrorLike[];
	if (core.validationMode === "ValidateAndHide") return additional;
	return [...((core.errors ?? []) as ValidationErrorLike[]), ...additional];
}

/** Props of the trailing button cluster of one row. */
interface RowActionsProps {
	idPrefix: string;
	title: string;
	index: number;
	count: number;
	orderable: boolean;
	removable: boolean;
	onMove: (index: number, direction: -1 | 1) => void;
	onRemove: (index: number) => void;
}

/**
 * Move up, move down and remove, as ghost icon buttons.
 *
 * @param props - Row identity and handlers.
 * @returns The cluster, or null when the row offers no action.
 */
function RowActions({
	idPrefix,
	title,
	index,
	count,
	orderable,
	removable,
	onMove,
	onRemove,
}: RowActionsProps) {
	const showMove = orderable && count > 1;
	if (!showMove && !removable) return null;
	return (
		<div className="flex shrink-0 items-center">
			{showMove && (
				<>
					<Button
						id={`${idPrefix}-up`}
						type="button"
						variant="ghost"
						size="icon-sm"
						className="text-muted-foreground"
						aria-label={`Move ${title} up`}
						disabled={index === 0}
						onClick={() => onMove(index, -1)}
					>
						<ArrowUpIcon />
					</Button>
					<Button
						id={`${idPrefix}-down`}
						type="button"
						variant="ghost"
						size="icon-sm"
						className="text-muted-foreground"
						aria-label={`Move ${title} down`}
						disabled={index === count - 1}
						onClick={() => onMove(index, 1)}
					>
						<ArrowDownIcon />
					</Button>
				</>
			)}
			{removable && (
				<Button
					id={`${idPrefix}-remove`}
					type="button"
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					aria-label={`Remove ${title}`}
					onClick={() => onRemove(index)}
				>
					<XIcon />
				</Button>
			)}
		</div>
	);
}

/** Props shared by both row kinds. */
interface RowProps {
	rowKey: number;
	idPrefix: string;
	index: number;
	count: number;
	title: string;
	issues: RowIssue[] | undefined;
	childPath: string;
	schema: JsonSchema;
	enabled: boolean;
	orderable: boolean;
	removable: boolean;
	isNew: boolean;
	onMove: (index: number, direction: -1 | 1) => void;
	onRemove: (index: number) => void;
	onAnimationEnd: (key: number) => void;
	rowRef: (element: HTMLLIElement | null) => void;
	renderers: ArrayLayoutProps["renderers"];
	cells: ArrayLayoutProps["cells"];
}

/**
 * One object row: a collapsible card whose heading names the row and states
 * what is missing from it.
 *
 * @param props - Row props, the layout to render and the open state.
 * @returns The card.
 */
function ObjectRow({
	rowKey,
	idPrefix,
	index,
	count,
	title,
	issues,
	childPath,
	schema,
	enabled,
	orderable,
	removable,
	isNew,
	onMove,
	onRemove,
	onAnimationEnd,
	rowRef,
	renderers,
	cells,
	layout,
	open,
	onOpenChange,
}: RowProps & {
	layout: UISchemaElement;
	open: boolean;
	onOpenChange: (key: number, open: boolean) => void;
}) {
	const summary = issues ? summarizeRowIssues(issues) : "";
	return (
		<Collapsible
			asChild
			open={open}
			onOpenChange={(next) => onOpenChange(rowKey, next)}
		>
			<li
				ref={rowRef}
				className={cn(
					"bg-card rounded-md border",
					summary && "border-destructive/40",
					isNew && "animate-in fade-in-0 duration-(--motion-base)",
				)}
				onAnimationEnd={(event) => {
					if (event.target === event.currentTarget) {
						onAnimationEnd(rowKey);
					}
				}}
			>
				<div className="flex items-center gap-1 pr-1">
					<CollapsibleTrigger
						id={`${idPrefix}-title`}
						className="group focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium outline-none focus-visible:ring-[3px]"
					>
						<ChevronRightIcon
							aria-hidden
							className="text-muted-foreground size-4 shrink-0 transition-transform duration-(--motion-base) group-data-[state=open]:rotate-90"
						/>
						<span className="min-w-0 truncate">{title}</span>
						{summary && (
							<span className="text-destructive ml-auto flex min-w-0 shrink items-center gap-1 text-xs font-normal">
								<CircleAlertIcon
									aria-hidden
									className="size-3.5 shrink-0"
								/>
								<span className="truncate">{summary}</span>
							</span>
						)}
					</CollapsibleTrigger>
					<RowActions
						idPrefix={idPrefix}
						title={title}
						index={index}
						count={count}
						orderable={orderable}
						removable={removable}
						onMove={onMove}
						onRemove={onRemove}
					/>
				</div>
				<CollapsibleContent animated>
					<div className="border-t px-3 py-3">
						<JsonFormsDispatch
							enabled={enabled}
							schema={schema}
							uischema={layout}
							path={childPath}
							renderers={renderers}
							cells={cells}
						/>
					</div>
				</CollapsibleContent>
			</li>
		</Collapsible>
	);
}

/** Uischema for a bare scalar row: the value itself, without a label. */
const SCALAR_CELL_UISCHEMA = {
	type: "Control",
	scope: "#",
	label: false,
} as const;

/**
 * One scalar row: a full-width input and the trailing actions.
 *
 * @param props - Row props.
 * @returns The row.
 */
function ScalarRow({
	rowKey,
	idPrefix,
	index,
	count,
	title,
	issues,
	childPath,
	schema,
	enabled,
	orderable,
	removable,
	isNew,
	onMove,
	onRemove,
	onAnimationEnd,
	rowRef,
	renderers,
	cells,
}: RowProps) {
	const summary = issues ? summarizeRowIssues(issues) : "";
	return (
		<li
			ref={rowRef}
			className={cn(
				"flex items-start gap-1",
				isNew && "animate-in fade-in-0 duration-(--motion-base)",
			)}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget)
					onAnimationEnd(rowKey);
			}}
		>
			<div className="min-w-0 flex-1 space-y-1">
				<DispatchCell
					schema={schema}
					uischema={SCALAR_CELL_UISCHEMA}
					path={childPath}
					enabled={enabled}
					renderers={renderers}
					cells={cells}
				/>
				{summary && (
					<p className="text-destructive flex items-center gap-1 text-xs">
						<CircleAlertIcon
							aria-hidden
							className="size-3.5 shrink-0"
						/>
						{summary}
					</p>
				)}
			</div>
			<RowActions
				idPrefix={idPrefix}
				title={title}
				index={index}
				count={count}
				orderable={orderable}
				removable={removable}
				onMove={onMove}
				onRemove={onRemove}
			/>
		</li>
	);
}

/**
 * Whether the uischema options turn reordering on or off.
 *
 * @param options - Merged config and uischema options.
 * @param scalar - Whether the rows are bare scalars.
 * @returns True when move buttons are shown.
 */
export function resolveOrderable(
	options: Record<string, unknown>,
	scalar: boolean,
): boolean {
	if (options.orderable === false || options.showSortButtons === false) {
		return false;
	}
	if (options.orderable === true || options.showSortButtons === true) {
		return true;
	}
	return !scalar;
}

/**
 * The array list: heading, rows, empty state and Add button.
 *
 * @param props - JSON Forms array layout props.
 * @returns The list, or null when hidden.
 */
export function ArrayListRenderer(props: ArrayLayoutProps) {
	const {
		visible,
		enabled,
		data,
		path,
		schema,
		uischema,
		uischemas,
		rootSchema,
		arraySchema,
		label,
		description,
		config,
		renderers,
		cells,
		addItem,
		removeItems,
		moveUp,
		moveDown,
		disableAdd,
		disableRemove,
	} = props;

	const ctx = useJsonForms();
	const idBase = useId();
	const options = merge({}, config, uischema.options) as Record<
		string,
		unknown
	>;

	const scalar = isScalarItems(schema);
	const noun: ItemNoun = deriveItemNoun(label);
	const orderable = enabled && resolveOrderable(options, scalar);
	const removable =
		enabled && !disableRemove && options.disableRemove !== true;
	const maxItems = arraySchema?.maxItems;
	const canAdd =
		enabled &&
		!disableAdd &&
		options.disableAdd !== true &&
		!(typeof maxItems === "number" && data >= maxItems);
	const labelProp =
		typeof options.elementLabelProp === "string"
			? options.elementLabelProp
			: undefined;

	const [rowState, setRowState] = useState<RowState>(() => ({
		keys: reconcileRowKeys([], data),
		expanded: new Set(),
		added: new Set(),
	}));

	// Rows added or removed by anything other than this list (the dialog
	// resetting the form from saved settings) are reconciled by length. The
	// operations this list performs keep the keys in step themselves.
	const keys = reconcileRowKeys(rowState.keys, data);
	if (keys !== rowState.keys) {
		setRowState({ ...rowState, keys });
	}

	/** A row to scroll to and focus once it has mounted. */
	const pendingScrollRef = useRef<number | null>(null);
	/** An element id to focus after the next commit. */
	const pendingFocusRef = useRef<string | null>(null);

	useEffect(() => {
		const id = pendingFocusRef.current;
		if (!id) return;
		pendingFocusRef.current = null;
		document.getElementById(id)?.focus();
	});

	// Not memoised by hand: the React Compiler memoises it on the same inputs.
	const rowLayoutSchema = scalar
		? undefined
		: rowLayout(
				findUISchema(
					uischemas ?? [],
					schema,
					uischema.scope,
					path,
					undefined,
					uischema,
					rootSchema,
				),
			);

	const errors = visibleErrors(ctx.core);
	const issuesByRow = mapErrorsToRows(errors, path, schema);
	const arrayIssues = mapErrorsToArray(errors, path);
	const rootData = ctx.core?.data as unknown;

	const rowId = (key: number) => `${idBase}-row-${key}`;

	const handleAdd = () => {
		const key = nextRowKey(keys);
		addItem(path, createDefaultValue(schema, rootSchema))();
		pendingScrollRef.current = key;
		setRowState((state) => ({
			keys: state.keys.includes(key) ? state.keys : [...state.keys, key],
			expanded: new Set(state.expanded).add(key),
			added: new Set(state.added).add(key),
		}));
	};

	const handleRemove = (index: number) => {
		removeItems?.(path, [index])();
		const remaining = removeRowKey(keys, index);
		const focusKey = remaining[index] ?? remaining[index - 1];
		pendingFocusRef.current =
			focusKey !== undefined
				? `${rowId(focusKey)}-remove`
				: `${idBase}-add`;
		setRowState((state) => ({
			...state,
			keys: removeRowKey(state.keys, index),
		}));
	};

	const handleMove = (index: number, direction: -1 | 1) => {
		const key = keys[index];
		if (key === undefined) return;
		if (direction === -1) moveUp?.(path, index)();
		else moveDown?.(path, index)();
		const target = index + direction;
		// The pressed button is disabled once the row reaches an end, so
		// focus falls to the opposite one.
		const control =
			target === 0 ? "down" : target === data - 1 ? "up" : null;
		pendingFocusRef.current = `${rowId(key)}-${control ?? (direction === -1 ? "up" : "down")}`;
		setRowState((state) => ({
			...state,
			keys: moveRowKey(state.keys, index, direction),
		}));
	};

	const handleOpenChange = (key: number, open: boolean) => {
		setRowState((state) => {
			const expanded = new Set(state.expanded);
			if (open) expanded.add(key);
			else expanded.delete(key);
			return { ...state, expanded };
		});
	};

	const handleAnimationEnd = (key: number) => {
		setRowState((state) => {
			if (!state.added.has(key)) return state;
			const added = new Set(state.added);
			added.delete(key);
			return { ...state, added };
		});
	};

	const refFor = (key: number) => (element: HTMLLIElement | null) => {
		if (!element || pendingScrollRef.current !== key) return;
		pendingScrollRef.current = null;
		const target =
			element.querySelector<HTMLElement>(`[id="${rowId(key)}-title"]`) ??
			element.querySelector<HTMLElement>("input, button");
		target?.focus({ preventScroll: true });
		element.scrollIntoView({ block: "nearest" });
	};

	if (!visible) return null;

	const incomplete = issuesByRow.size;
	const headingFacts = [
		...arrayIssues.map(describeArrayIssue),
		...(incomplete > 0 ? [`${incomplete} incomplete`] : []),
	];
	const headingId = `${idBase}-heading`;

	return (
		<section className="space-y-2" aria-labelledby={headingId}>
			<div className="space-y-1">
				<div className="flex items-baseline justify-between gap-3">
					<h3
						id={headingId}
						className="text-foreground text-sm font-semibold"
					>
						{label}
					</h3>
					{headingFacts.length > 0 && (
						<span className="text-destructive text-xs">
							{headingFacts.join(", ")}
						</span>
					)}
				</div>
				{description && (
					<p className="text-muted-foreground text-sm">
						{description}
					</p>
				)}
			</div>

			{data === 0 ? (
				<p className="text-muted-foreground text-sm">
					No {noun.plural}.
				</p>
			) : (
				<ul className="space-y-2">
					{keys.map((key, index) => {
						const childPath = composePaths(path, `${index}`);
						const title = deriveRowTitle({
							item: Resolve.data(rootData, childPath),
							itemSchema: schema,
							index,
							noun: noun.singularTitle,
							labelProp,
						});
						const shared: RowProps = {
							rowKey: key,
							idPrefix: rowId(key),
							index,
							count: data,
							title,
							issues: issuesByRow.get(index),
							childPath,
							schema,
							enabled,
							orderable,
							removable,
							isNew: rowState.added.has(key),
							onMove: handleMove,
							onRemove: handleRemove,
							onAnimationEnd: handleAnimationEnd,
							rowRef: refFor(key),
							renderers,
							cells,
						};
						return rowLayoutSchema ? (
							<ObjectRow
								key={key}
								{...shared}
								layout={rowLayoutSchema}
								open={rowState.expanded.has(key)}
								onOpenChange={handleOpenChange}
							/>
						) : (
							<ScalarRow key={key} {...shared} />
						);
					})}
				</ul>
			)}

			{canAdd && (
				<Button
					id={`${idBase}-add`}
					type="button"
					variant="outline"
					size="sm"
					onClick={handleAdd}
				>
					<PlusIcon />
					Add {noun.singular}
				</Button>
			)}
		</section>
	);
}

/**
 * Enum arrays with `uniqueItems` are a multi-select, not a list: they keep the
 * checkbox renderer (material's enum array renderer, rank 5).
 */
const isUniqueEnumArray = schemaMatches((schema, rootSchema) => {
	if (schema.uniqueItems !== true || !schema.items) return false;
	if (Array.isArray(schema.items)) return false;
	const items = schema.items.$ref
		? resolveSchema(rootSchema, schema.items.$ref, rootSchema)
		: schema.items;
	return Boolean(
		items &&
		((items.type === "string" && items.enum !== undefined) ||
			(items.oneOf?.length &&
				items.oneOf.every((entry) => entry.const !== undefined))),
	);
});

/**
 * Wins for every array control: object arrays with or without nesting, and
 * scalar arrays. Rank 10 outranks material's array layout (4), array control
 * (3) and enum array (5); unique enum arrays are excluded so the checkbox
 * renderer keeps them.
 */
export const arrayListTester: RankedTester = rankWith(
	10,
	and(
		or(
			isObjectArrayControl,
			isPrimitiveArrayControl,
			isObjectArrayWithNesting,
		),
		not(isUniqueEnumArray),
	),
);

export default withJsonFormsArrayLayoutProps(ArrayListRenderer);
