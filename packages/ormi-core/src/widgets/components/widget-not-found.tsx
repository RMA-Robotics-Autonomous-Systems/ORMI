import { JSX } from "react";
import { WidgetDefinition } from "../widget-interface";
import { OctagonAlertIcon } from "lucide-react";

const notFound = (): JSX.Element => {
	return (
		<div
			style={{
				height: "100%",
				overflow: "auto",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					padding: "1.5rem",
					borderRadius: "6px",
					backgroundColor: "#fafafa",
					border: "1px solid #eaeaea",
					maxWidth: "400px",
					width: "90%",
				}}
			>
				<div
					style={{
						fontSize: "2.5rem",
						color: "#6b7280",
						marginBottom: "1rem",
						textAlign: "center",
						display: "flex",
						justifyContent: "center",
					}}
				>
					<OctagonAlertIcon />
				</div>
				<h2
					style={{
						color: "#111827",
						marginBottom: "0.75rem",
						fontWeight: "500",
						textAlign: "center",
					}}
				>
					Widget Not Found
				</h2>
				<p
					style={{
						color: "#6b7280",
						fontSize: "0.875rem",
						textAlign: "center",
						lineHeight: "1.5",
					}}
				>
					The requested widget could not be found. This may be due to
					a missing plugin or an incorrect widget ID.
				</p>
				<div
					style={{
						width: "100%",
						height: "1px",
						margin: "1rem 0",
						backgroundColor: "#f1f1f1",
					}}
				></div>
				<p
					style={{
						fontSize: "0.75rem",
						color: "#6b7280",
						textAlign: "center",
					}}
				>
					Make sure that the required plugin is installed.
				</p>
			</div>
		</div>
	);
};

export const widgetNotFound = {
	id: "widget-not-found",
	name: "Widget Not Found",
	description: "Widget Not Found",
	icon: <></>,
	schema: {
		type: "object",
		properties: {},
	},
	uischema: {
		type: "Control",
		scope: "#",
	},
	data: {},
	Component: notFound,
} as WidgetDefinition;
