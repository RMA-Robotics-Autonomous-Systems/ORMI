import React, { useEffect, useRef, useState } from "react";
import { useJsonForms, withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	JsonSchema,
	rankWith,
	isControl,
	and,
	uiTypeIs,
} from "@jsonforms/core";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Settings } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import {
	DatasourceTopic,
	SelectedTopic,
} from "../datasources/datasource-interface";
import { DataRequirements, TopicSlotRole } from "../widgets/widget-interface";
import { TopicSelectionDialog } from "./topic-selection/topic-selection-dialog";
import {
	buildSelectedTopic,
	canAutoBindSlot,
	deriveTopicBufferSize,
	findSoleDirectMatch,
	TopicBufferOptions,
} from "./topic-selection/topic-auto-select";
import { resolveDerivedNameUpdates } from "./topic-selection/topic-derived-name";
import {
	buildCandidatePool,
	EMPTY_CANDIDATE_POOL,
	resolveTopicPickerMode,
	TopicCandidatePool,
} from "./topic-selection/topic-inline-candidates";
import { TopicInlinePicker } from "./topic-selection/topic-inline-picker";
import { useSettledTopics } from "./topic-selection/use-settled-topics";

/** Per-render inputs the settle-once effects read without restarting. */
interface TopicSlotInputs {
	/** Write the binding itself. */
	commit: (value: SelectedTopic) => void;
	/**
	 * Fill in any sibling name property the newly bound topic may name — see
	 * `resolveDerivedNameUpdates`.
	 */
	applyDerivedNames: (
		previous: SelectedTopic | undefined,
		next: SelectedTopic,
	) => void;
	requirements?: DataRequirements;
	role?: TopicSlotRole;
	bufferOptions?: TopicBufferOptions;
}

/**
 * JsonForms renderer for selecting a datasource topic.
 *
 * The control scales its affordance to the size of the choice:
 *
 * - **one direct match, slot unbound, and a slot that may bind itself** — bound
 *   automatically and shown as a settled value, no interaction at all;
 * - **a handful of direct matches** — an inline radio list in the form itself,
 *   one click to bind, with a link through to the full picker;
 * - **anything larger, or any binding the radio list cannot honestly express**
 *   — the settled-value button that opens the two-pane selection dialog.
 *
 * Which slots may bind themselves is `canAutoBindSlot`: a scalar-only slot
 * (`number`, `boolean`, `string`) or a `secondary` slot never does, because
 * "the only match right now" says nothing about intent there. Those slots offer
 * their lone candidate as a one-click row instead.
 *
 * Both the auto-select decision and the candidate list are taken **once**, from
 * the first non-empty available-topics list this control sees, and are never
 * revisited: options that shift under the operator are worse than a modal. A
 * second robot coming online leaves the binding and the list alone; the dialog
 * re-reads on open and is the way to reach whatever arrived late. The poll
 * itself never gives up, so a robot that takes a minute to enumerate still
 * fills the control it was opened for.
 *
 * Binding a topic also names its object: a blank or placeholder `name`, `label`
 * or `title` beside the slot takes the topic name, and anything the operator
 * typed is left alone (`resolveDerivedNameUpdates`).
 *
 * @param props - JsonForms control props.
 * @returns React element.
 */
const TopicSelectRenderer = (props: ControlProps) => {
	const { data, handleChange, path, rootSchema, uischema, label } = props;
	const [dialogOpen, setDialogOpen] = useState(false);
	const [autoSelected, setAutoSelected] = useState(false);

	// Extract data requirements from uischema options (new system)
	const dataRequirements = uischema.options?.dataRequirements as
		DataRequirements | undefined;

	const slotRole = uischema.options?.role as TopicSlotRole | undefined;

	const bufferOptions = uischema.options as TopicBufferOptions | undefined;

	/**
	 * The whole form's data, needed to tell a name the operator typed from the
	 * placeholder this build put there. JsonForms hands a control only its own
	 * slice, and the sibling being named lives one level up.
	 */
	const formData = useJsonForms().core?.data as unknown;

	// Current selected topic
	const selectedTopic = data as SelectedTopic | undefined;
	const hasSelection = Boolean(selectedTopic?.topic);

	/**
	 * Widget definition factories are re-invoked on every dashboard render, so
	 * `uischema` and `handleChange` arrive with fresh identities. Mirroring them
	 * into a ref keeps the settle-once effects below out of the dependency
	 * arrays — a restarting effect would re-derive the candidate list on every
	 * keystroke in a sibling field, and a restarting poll would never reach its
	 * first `await`.
	 */
	const buildInputs = (): TopicSlotInputs => ({
		commit: (value: SelectedTopic) => handleChange(path, value),
		applyDerivedNames: (previous, next) => {
			for (const update of resolveDerivedNameUpdates({
				rootSchema: rootSchema as JsonSchema | undefined,
				rootData: formData,
				path,
				previous,
				next,
				role: slotRole,
			})) {
				handleChange(update.path, update.value);
			}
		},
		requirements: dataRequirements,
		role: slotRole,
		bufferOptions,
	});

	const inputsRef = useRef<TopicSlotInputs>(buildInputs());
	useEffect(() => {
		inputsRef.current = buildInputs();
	});

	const settledTopics = useSettledTopics();
	const availableTopics =
		settledTopics.status === "settled" ? settledTopics.topics : null;
	const waitingForTopics = settledTopics.status === "waiting";

	/**
	 * Write a binding, then name whatever the binding is for.
	 *
	 * Both halves go through the ref so every entry point — auto-select, the
	 * inline rows and the dialog — names the same way.
	 */
	const commitSelection = (selection: SelectedTopic) => {
		const { commit, applyDerivedNames } = inputsRef.current;
		commit(selection);
		applyDerivedNames(selectedTopic, selection);
	};

	const commitTopic = (topic: DatasourceTopic, property: string) => {
		const { bufferOptions: options } = inputsRef.current;
		commitSelection(
			buildSelectedTopic(topic, property, deriveTopicBufferSize(options)),
		);
	};

	const handleTopicSelect = (selection: SelectedTopic) => {
		commitSelection(selection);
		setAutoSelected(false);
		setDialogOpen(false);
	};

	const handleInlineSelect = (topic: DatasourceTopic) => {
		commitTopic(topic, "");
		setAutoSelected(false);
	};

	/**
	 * True once this control has made (or declined to make) its auto-select
	 * decision. A ref rather than state: it must never re-arm.
	 */
	const settledRef = useRef(false);

	useEffect(() => {
		if (settledRef.current) return;

		// A stored binding, or a slot with no requirements to match against, is
		// nothing to decide: any topic would do and the choice stays the
		// operator's.
		if (hasSelection || !inputsRef.current.requirements) {
			settledRef.current = true;
			return;
		}

		// Still polling.
		if (availableTopics === null) return;

		// The first non-empty list decides, for better or worse.
		settledRef.current = true;

		const {
			commit,
			applyDerivedNames,
			requirements,
			role,
			bufferOptions: options,
		} = inputsRef.current;
		const sole = findSoleDirectMatch(availableTopics, requirements, {
			role,
		});
		if (!sole) return;

		const selection = buildSelectedTopic(
			sole,
			"",
			deriveTopicBufferSize(options),
		);
		commit(selection);
		applyDerivedNames(undefined, selection);
		// One cascading render, once per mount, to surface the badge on a value
		// this control bound rather than the operator. The effect cannot re-arm
		// (`settledRef`), so it cannot cascade further.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setAutoSelected(true);
	}, [availableTopics, hasSelection]);

	/**
	 * Candidate pool for the inline list.
	 *
	 * Derived in an effect rather than a `useMemo` because the compatibility
	 * scan walks a JSON schema per topic and `dataRequirements` arrives with a
	 * fresh identity on every render — a memo keyed on it would re-scan the
	 * whole topic list on each keystroke in a sibling field. Requirements are
	 * authored in the widget definition and never actually change for a given
	 * control, so reading them through the ref is exact.
	 */
	const [pool, setPool] = useState<TopicCandidatePool>(EMPTY_CANDIDATE_POOL);
	useEffect(() => {
		if (availableTopics === null) return;
		setPool(
			buildCandidatePool(availableTopics, inputsRef.current.requirements),
		);
	}, [availableTopics]);

	const mode = resolveTopicPickerMode(pool, selectedTopic, {
		autoBindable: canAutoBindSlot({
			requirements: dataRequirements,
			role: slotRole,
		}),
	});

	const getDisplayText = () => {
		if (!selectedTopic) {
			// "No topics" and "no datasource has enumerated yet" are different
			// answers and the poll now distinguishes them, so say which one this
			// is rather than showing an idle prompt over an empty dialog.
			return waitingForTopics
				? "Waiting for topics…"
				: "Select a topic...";
		}

		const parts = [selectedTopic.topic];

		if (selectedTopic.property) {
			parts.push(selectedTopic.property);
		}

		return parts.join(" → ");
	};

	const getTypeInfo = () => {
		if (!selectedTopic) return null;

		return (
			<div className="flex gap-1 mt-1">
				{selectedTopic.type && (
					<Badge variant="secondary" className="text-xs">
						{selectedTopic.type}
					</Badge>
				)}
				{selectedTopic.rawType &&
					selectedTopic.rawType !== selectedTopic.type && (
						<Badge variant="outline" className="text-xs">
							{selectedTopic.rawType}
						</Badge>
					)}
				{autoSelected && (
					<Badge variant="outline" className="text-xs">
						Auto-selected
					</Badge>
				)}
			</div>
		);
	};

	return (
		<div className="space-y-2">
			<Label>{label}</Label>

			{mode === "inline" ? (
				<TopicInlinePicker
					pool={pool}
					value={selectedTopic}
					onSelect={handleInlineSelect}
					onBrowse={() => setDialogOpen(true)}
					idPrefix={path}
				/>
			) : (
				<Button
					variant="outline"
					type="button"
					className={cn(
						"w-full justify-between h-auto p-3",
						!selectedTopic && "text-muted-foreground",
					)}
					onClick={() => setDialogOpen(true)}
				>
					<div className="flex flex-col items-start gap-1 flex-1 min-w-0">
						<span className="truncate text-left">
							{getDisplayText()}
						</span>
						{getTypeInfo()}
					</div>

					<div className="flex items-center gap-2 ml-2">
						<Settings className="w-4 h-4" />
					</div>
				</Button>
			)}

			{/* Requirements Display */}
			{process.env.NODE_ENV === "development" && (
				<div className="text-xs text-muted-foreground p-2 bg-muted rounded">
					{dataRequirements ? (
						<span>
							<strong>Requirements:</strong>{" "}
							{[
								...dataRequirements.accepts,
								...(dataRequirements.acceptsRaw ?? []),
							].join(", ")}
						</span>
					) : (
						<span>
							<strong>No Requirements:</strong> Any topic can be
							selected
						</span>
					)}
				</div>
			)}

			<TopicSelectionDialog
				isOpen={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onSelect={handleTopicSelect}
				requirements={dataRequirements}
				initialValue={selectedTopic}
				label={label || "Select Topic"}
				bufferOptions={bufferOptions}
			/>
		</div>
	);
};

export default withJsonFormsControlProps(TopicSelectRenderer);

/** JsonForms tester for the TopicSelect UI schema type. */
const topicSelectTester = rankWith(10, and(isControl, uiTypeIs("TopicSelect")));

export { topicSelectTester };

/** UI schema element for TopicSelect. */
export interface TopicSelectElement {
	type: "TopicSelect";
	scope: string;
	options?: {
		dataRequirements?: DataRequirements;
		/**
		 * Role of this slot within the widget. Defaults to `"primary"`.
		 *
		 * A `"secondary"` slot is a supporting input: it is never bound
		 * unattended and never names the object it sits in.
		 */
		role?: TopicSlotRole;
		/**
		 * Per-slot history depth override. Leave unset — the widget's own
		 * `buffersSize` on `LocalDataSourcesProvider` governs by default.
		 */
		buffer?: number;
		// Legacy options (deprecated but still supported)
		asyncFunction?: () => Promise<any[]>;
		canSelectProperty?: boolean;
		propertyType?: string;
	};
}
