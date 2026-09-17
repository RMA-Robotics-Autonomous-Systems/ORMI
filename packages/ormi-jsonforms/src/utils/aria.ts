/**
 * Accessibility helpers shared by the Shadcn JSON Forms controls.
 *
 * Error and required state must not be communicated by colour alone: every
 * control wires `aria-invalid`, `aria-required` and an `aria-describedby` that
 * points at whichever of its description / error paragraphs is actually
 * rendered. These helpers keep the element ids consistent across controls.
 */

/** Id of the description paragraph belonging to the control `id`. */
export const descriptionId = (id?: string): string | undefined =>
	id ? `${id}-description` : undefined;

/** Id of the error paragraph belonging to the control `id`. */
export const errorId = (id?: string): string | undefined =>
	id ? `${id}-error` : undefined;

/** Inputs used to derive the ARIA attributes of a control. */
export interface ControlAriaOptions {
	/** The control's DOM id; description/error ids are derived from it. */
	id?: string;
	/** `false` when the control currently has validation errors. */
	isValid: boolean;
	/** Whether the underlying schema marks the property as required. */
	required?: boolean;
	/** Whether the description paragraph is actually rendered. */
	showDescription?: boolean;
}

/** ARIA attributes to spread onto the interactive element of a control. */
export interface ControlAriaProps {
	"aria-invalid"?: true;
	"aria-required"?: true;
	"aria-describedby"?: string;
}

/**
 * Builds the ARIA attributes for a control's interactive element.
 *
 * `aria-describedby` only references paragraphs that are rendered, so it never
 * points at a missing node.
 */
export const controlAriaProps = ({
	id,
	isValid,
	required,
	showDescription,
}: ControlAriaOptions): ControlAriaProps => {
	const describedBy = [
		showDescription ? descriptionId(id) : undefined,
		isValid ? undefined : errorId(id),
	]
		.filter((value): value is string => Boolean(value))
		.join(" ");

	return {
		...(isValid ? {} : { "aria-invalid": true as const }),
		...(required ? { "aria-required": true as const } : {}),
		...(describedBy ? { "aria-describedby": describedBy } : {}),
	};
};

/**
 * Props interface for the inner input components rendered by
 * {@link ShadcnInputControl}, which receive their ARIA attributes from the
 * wrapper that owns the label, description and error paragraphs.
 */
export interface WithAria {
	ariaProps?: ControlAriaProps;
}
