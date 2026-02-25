import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import { Separator } from "@workspace/ui/components/separator";
import {
	TableBody,
	TableRow,
	TableCell,
	TableHeader,
	TableHead,
	Table,
} from "@workspace/ui/components/table";
import { BagInfo } from "../bags";

interface BagViewerProps extends Record<string, unknown> {
	bag: BagInfo;
	trigger?: any;
}

export function BagViewer({ bag, trigger }: BagViewerProps) {
	// Filter out complex objects for the main properties display
	const displayableEntries = Object.entries(bag).filter(
		([key, value]) => key !== "meta" && typeof value !== "object",
	);

	// Function to format timestamps in a readable way
	const formatDate = (timestamp: string | number) => {
		try {
			return new Date(timestamp).toLocaleString();
		} catch {
			return String(timestamp);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				{trigger || <Button variant="outline">View Bag Details</Button>}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[800px] max-h-[80dvh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Bag Information</DialogTitle>
					<DialogDescription>
						{bag.path
							? `File: ${bag.path}`
							: "Details about the selected ROS bag file"}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4">
					<h3 className="text-lg font-medium mb-2">
						General Information
					</h3>
					<Table>
						<TableBody>
							{displayableEntries.map(([key, value]) => (
								<TableRow key={key}>
									<TableCell className="font-medium capitalize">
										{key.replace(/_/g, " ")}
									</TableCell>
									<TableCell>
										{key.includes("time")
											? formatDate(value)
											: String(value)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				{bag.meta && (
					<>
						<Separator className="my-4" />
						<div className="space-y-4">
							<h3 className="text-lg font-medium mb-2">
								Metadata
							</h3>
							<Table>
								<TableBody>
									{bag.meta.storage_identifier && (
										<TableRow>
											<TableCell className="font-medium">
												Storage Format
											</TableCell>
											<TableCell>
												{bag.meta.storage_identifier}
											</TableCell>
										</TableRow>
									)}
									{bag.meta.duration && (
										<TableRow>
											<TableCell className="font-medium">
												Duration
											</TableCell>
											<TableCell>
												{(
													bag.meta.duration
														.nanoseconds /
													1000000000
												).toFixed(2)}{" "}
												seconds
											</TableCell>
										</TableRow>
									)}
									{bag.meta.starting_time && (
										<TableRow>
											<TableCell className="font-medium">
												Starting Time
											</TableCell>
											<TableCell>
												{new Date(
													bag.meta.starting_time
														.nanoseconds_since_epoch /
														1000000,
												).toLocaleString()}
											</TableCell>
										</TableRow>
									)}
									{bag.meta.message_count && (
										<TableRow>
											<TableCell className="font-medium">
												Total Messages
											</TableCell>
											<TableCell>
												{bag.meta.message_count.toLocaleString()}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</>
				)}

				{bag.meta?.topics_with_message_count && (
					<>
						<Separator className="my-4" />
						<div className="space-y-2">
							<h3 className="text-lg font-medium">
								Topics (
								{bag.meta.topics_with_message_count.length})
							</h3>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead className="text-right">
											Messages
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{bag.meta.topics_with_message_count.map(
										(topic, index) => (
											<TableRow key={index}>
												<TableCell className="font-medium">
													{topic.topic_metadata.name}
												</TableCell>
												<TableCell>
													{topic.topic_metadata.type}
												</TableCell>
												<TableCell className="text-right">
													{topic.message_count.toLocaleString()}
												</TableCell>
											</TableRow>
										),
									)}
								</TableBody>
							</Table>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
