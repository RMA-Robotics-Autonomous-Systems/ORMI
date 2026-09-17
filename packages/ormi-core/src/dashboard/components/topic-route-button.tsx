"use client";

import React, { useMemo } from "react";
import { Check, Gamepad2, Plus, SettingsIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@workspace/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import {
	resolveTopicCommands,
	resolveTopicRoute,
	type RoutingDecision,
	type RoutingOption,
} from "../../widgets/topic-routing";
import { WidgetDefinition } from "../../widgets/widget-interface";
import { TopicRouting } from "../state/use-topic-router";
import { useDashboardActions } from "../state/use-dashboard-actions";

/** Short label for a routing option in the disambiguation menu. */
function optionLabel(option: RoutingOption): string {
	if (option.direction === "publish")
		return `Command with ${option.widgetName}`;
	return option.kind === "append"
		? `Add to ${option.instanceTitle || option.widgetName}`
		: `New ${option.widgetName}`;
}

/** Stable React key for a routing option. */
function optionKey(option: RoutingOption): string {
	return `${option.kind}-${option.boxId ?? ""}-${option.slot?.slotId ?? option.widgetId}`;
}

/**
 * One destination, as the card the operator already knows.
 *
 * The icon and name are the widget definition's own, so a destination looks
 * the same here as it does in the widgets grid — picking "Image Viewer" from a
 * topic and picking it from the widget list must not look like two different
 * things, or the two surfaces read as two different products.
 *
 * The wording is unchanged from the text menu this replaces, because it is the
 * wording that carries the safety: "Command with …" is a robot moving, "Add
 * to …" is an existing panel gaining a series, "New …" is another panel. A
 * publish destination additionally keeps its gamepad marker and amber framing
 * so it cannot be picked by momentum while reading down a list of viewers.
 *
 * @param props - Component props.
 * @returns React element.
 */
const RouteOptionCard: React.FC<{
	option: RoutingOption;
	definition: WidgetDefinition;
	onSelect: () => void;
}> = ({ option, definition, onSelect }) => {
	const isPublish = option.direction === "publish";

	return (
		<DropdownMenuItem
			onClick={onSelect}
			className={cn(
				"flex h-auto flex-col items-center gap-1.5 rounded-md border p-2 text-center",
				isPublish
					? "border-amber-500/40 focus:bg-amber-500/10"
					: "border-border",
			)}
		>
			<span
				className={cn(
					"relative flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
					isPublish
						? "bg-amber-500/10 text-amber-600 dark:text-amber-500 [&_svg:not([class*='text-'])]:text-amber-600 dark:[&_svg:not([class*='text-'])]:text-amber-500"
						: "bg-muted",
				)}
			>
				{definition.icon || <SettingsIcon />}
				{isPublish ? (
					<Gamepad2
						className="absolute -right-1 -bottom-1 size-3.5 text-amber-600 dark:text-amber-500"
						aria-hidden
					/>
				) : null}
			</span>
			<span
				className="line-clamp-2 w-full text-xs font-medium break-words"
				title={optionLabel(option)}
			>
				{optionLabel(option)}
			</span>
			{option.slot && option.slot.requiresCompanions.length > 0 ? (
				<span className="text-muted-foreground line-clamp-2 w-full text-[10px] break-words">
					Then choose {option.slot.requiresCompanions.join(" and ")}
				</span>
			) : null}
		</DropdownMenuItem>
	);
};

/** Props for {@link TopicRouteButton}. */
export interface TopicRouteButtonProps {
	/** Topic the button would display. */
	topic: DatasourceTopic;
	/** Routing context from `useTopicRouter()`. */
	routing: TopicRouting;
	/**
	 * Called once the topic has been placed on the dashboard, so a host that
	 * covers the dashboard can get out of the way. Never called for a topic no
	 * widget can display, and never for merely opening the chooser.
	 */
	onRouted?: () => void;
}

/**
 * What an operator can do with a topic, on the topic's own row.
 *
 * **Two affordances, never one list.** A neutral `+` places a viewer; an amber
 * gamepad places a control that commands the robot with the topic. Viewing and
 * commanding are different acts, and an operator reading down a column must
 * never pick a control by momentum, so they never share a menu: the split that
 * used to exist as two labelled groups inside one chooser is now two buttons,
 * each keeping its own heading when it has to ask.
 *
 * **Both cost the same.** Each side acts on click when there is one answer and
 * opens a chooser when there is a tie. Previously the controls lived only in
 * the chooser, and the chooser only opened when the *display* decision was a
 * tie — so for every topic with an obvious viewer, which is most of them, the
 * controls were not reachable from here at all and placing one meant a trip
 * through the widget catalogue and a topic picker.
 *
 * Nothing here ever removes a row: a topic no widget displays keeps a
 * **disabled** `+` whose tooltip names the type, because hiding incompatible
 * rows turns "why is my topic not listed?" into a permanent support question.
 * A topic no control accepts simply has no gamepad — an affordance that cannot
 * lead anywhere must not look like it can.
 *
 * Routing itself is unchanged: `resolveTopicRoute` still never returns a
 * command claim as a `create` or an `append`, so the `+` is unconditionally
 * safe and every control placement is a deliberate act on the amber button.
 *
 * Shared by every topic-first surface so a topic row reads identically wherever
 * an operator meets one.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const TopicRouteButton: React.FC<TopicRouteButtonProps> = ({
	topic,
	routing,
	onRouted,
}) => {
	const { getDefinition } = useDashboardActions();

	const decision: RoutingDecision = useMemo(
		() =>
			resolveTopicRoute({
				topic,
				widgets: routing.widgets,
				claims: routing.claims,
			}),
		[topic, routing],
	);

	// Resolved on its own rather than read off the decision: routing never
	// returns a control, so a forced display decision carries no options at all
	// and the controls would simply vanish for exactly the topics whose display
	// answer is obvious.
	const commandOptions = useMemo(
		() => resolveTopicCommands({ topic, claims: routing.claims }),
		[topic, routing],
	);

	const route = (option: RoutingOption) => {
		routing.route(option, topic);
		onRouted?.();
	};

	const renderGroup = (options: RoutingOption[]) => (
		<div className="grid grid-cols-2 gap-2 p-1">
			{options.map((option) => (
				<RouteOptionCard
					key={optionKey(option)}
					option={option}
					definition={getDefinition(option.widgetId)}
					onSelect={() => route(option)}
				/>
			))}
		</div>
	);

	/**
	 * The display half of the row action.
	 *
	 * A forced decision acts on click, a tie opens a chooser of the viewers it
	 * could not choose between, and a topic no widget displays keeps a disabled
	 * button whose tooltip names the type. The control destinations are not in
	 * here — they have their own affordance beside it.
	 */
	const renderDisplayAction = () => {
		if (decision.kind === "create" || decision.kind === "append") {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							aria-label={`Display ${topic.topic}`}
							onClick={() => route(decision.option)}
						>
							<Plus className="h-4 w-4" aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{decision.reason}</TooltipContent>
				</Tooltip>
			);
		}

		// Already on screen in a widget that discovers its own topics. Shown as
		// a settled state rather than an action: the operator's goal is met, so
		// offering them a button that would add a duplicate panel is the wrong
		// answer, and offering nothing reads as a broken row.
		if (decision.kind === "present") {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span tabIndex={0}>
							<Button
								variant="ghost"
								size="sm"
								disabled
								aria-label={`${topic.topic} is already shown in ${decision.widgetName}`}
							>
								<Check className="h-4 w-4" aria-hidden />
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>{decision.reason}</TooltipContent>
				</Tooltip>
			);
		}

		const viewOptions =
			decision.kind === "ask"
				? decision.options.filter(
						(option) => option.direction !== "publish",
					)
				: [];

		// A topic only controls accept still reaches `ask`, carrying nothing
		// but publish options. The display button is honestly disabled and says
		// why; the controls are on the affordance beside it.
		if (viewOptions.length === 0) {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span tabIndex={0}>
							<Button
								variant="ghost"
								size="sm"
								disabled
								aria-label={`Cannot display ${topic.topic}`}
							>
								<Plus className="h-4 w-4" aria-hidden />
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>{decision.reason}</TooltipContent>
				</Tooltip>
			);
		}

		return (
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								aria-label={`Choose where to display ${topic.topic}`}
							>
								<Plus className="h-4 w-4" aria-hidden />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>{decision.reason}</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-72">
					<DropdownMenuLabel>Display in</DropdownMenuLabel>
					{renderGroup(viewOptions)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	/**
	 * The command half of the row action.
	 *
	 * Its own button, never a second entry in the display menu: the amber
	 * gamepad is the marker the rest of the product uses for "this moves a
	 * robot", and separating the affordances is what stops an operator reading
	 * down a list of viewers and picking a control by momentum. A sole control
	 * acts on click, several open a chooser under the heading that says what
	 * they do, and a topic no control accepts renders nothing here at all.
	 */
	const renderCommandAction = () => {
		if (commandOptions.length === 0) return null;

		const commandClass =
			"text-amber-600 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500 hover:bg-amber-500/10";

		if (commandOptions.length === 1) {
			const option = commandOptions[0]!;
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={commandClass}
							aria-label={`Command a robot with ${topic.topic}`}
							onClick={() => route(option)}
						>
							<Gamepad2 className="h-4 w-4" aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{`Command a robot with it — adds ${option.widgetName}.`}
					</TooltipContent>
				</Tooltip>
			);
		}

		return (
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className={commandClass}
								aria-label={`Choose a control to command ${topic.topic}`}
							>
								<Gamepad2 className="h-4 w-4" aria-hidden />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>
						{`${commandOptions.length} controls can command this topic.`}
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-72">
					<DropdownMenuLabel className="text-amber-600 dark:text-amber-500">
						Command a robot with it
					</DropdownMenuLabel>
					{renderGroup(commandOptions)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	return (
		<div className="flex items-center justify-end gap-0.5">
			{renderDisplayAction()}
			{renderCommandAction()}
		</div>
	);
};
