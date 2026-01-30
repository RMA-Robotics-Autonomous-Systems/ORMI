import React from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	CheckCircle2,
	XCircle,
	Info,
	ChevronRight,
	ChevronDown,
	FileText,
	Settings,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import { DataRequirements } from "../../widgets/widget-interface";
import {
	TopicCompatibilityResult,
	DualPropertyTree,
	PropertyTreeNode,
	getPropertyTreeTabInfo,
} from "../../widgets/topic-compatibility";

interface TopicDetailsProps {
	topic: DatasourceTopic | null;
	analysis: TopicCompatibilityResult | null;
	propertyTree: DualPropertyTree | null;
	selectedProperty: string | null;
	selectedPropertySource: "webapp" | "raw" | null;
	onPropertySelect: (path: string, source: "webapp" | "raw") => void;
	activeTab: "webapp" | "raw";
	onTabChange: (tab: "webapp" | "raw") => void;
	bufferSize: number;
	onBufferSizeChange: (size: number) => void;
	requirements?: DataRequirements;
}

export const TopicDetails: React.FC<TopicDetailsProps> = ({
	topic,
	analysis,
	propertyTree,
	selectedProperty,
	selectedPropertySource,
	onPropertySelect,
	activeTab,
	onTabChange,
	bufferSize,
	onBufferSizeChange,
	requirements,
}) => {
	if (!topic) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center">
					<FileText className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
					<p className="text-sm text-muted-foreground">
						Select a topic to view details
					</p>
				</div>
			</div>
		);
	}

	const tabInfo = propertyTree ? getPropertyTreeTabInfo(propertyTree) : null;

	return (
		<ScrollArea className="h-full">
			<div className="flex flex-col gap-4 p-4">
				{/* Topic Info Card */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span>{topic.topic}</span>
							{analysis &&
								(analysis.isCompatible ? (
									<CheckCircle2 className="w-5 h-5 text-green-500" />
								) : (
									<XCircle className="w-5 h-5 text-red-500" />
								))}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="text-sm">
							<div>
								<Label className="text-muted-foreground">
									Source
								</Label>
								<p className="font-medium">
									{topic.source.title}
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<Label className="text-muted-foreground">
								Types
							</Label>
							<div className="flex flex-wrap gap-2">
								{topic.type && (
									<Badge variant="secondary">
										Webapp: {topic.type}
									</Badge>
								)}
								{topic.rawType && (
									<Badge variant="outline">
										Raw: {topic.rawType}
									</Badge>
								)}
							</div>
						</div>

						{/* Compatibility Status */}
						{requirements && analysis && (
							<div className="space-y-2">
								<Label className="text-muted-foreground">
									Compatibility
								</Label>
								<div
									className={cn(
										"p-3 rounded-lg border",
										analysis.isCompatible
											? "bg-green-50 border-green-200"
											: "bg-red-50 border-red-200",
									)}
								>
									<div className="flex items-center gap-2 mb-1">
										{analysis.isCompatible ? (
											<CheckCircle2 className="w-4 h-4 text-green-600" />
										) : (
											<XCircle className="w-4 h-4 text-red-600" />
										)}
										<span
											className={cn(
												"text-sm font-medium",
												analysis.isCompatible
													? "text-green-700"
													: "text-red-700",
											)}
										>
											{analysis.isCompatible
												? "Compatible"
												: "Not Compatible"}
										</span>
									</div>

									{analysis.directMatch && (
										<p className="text-xs text-green-600">
											Direct type match with requirements
										</p>
									)}

									{analysis.compatibleProperties.length > 0 &&
										!analysis.directMatch && (
											<p className="text-xs text-green-600">
												{
													analysis
														.compatibleProperties
														.length
												}{" "}
												compatible properties found
											</p>
										)}

									{analysis.reason && (
										<p className="text-xs text-red-600">
											{analysis.reason}
										</p>
									)}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
				{/* Buffer Configuration */}
				<Card>
					<CardContent className="pt-6">
						<div className="space-y-2">
							<Label htmlFor="buffer-size">Buffer Size</Label>
							<Input
								id="buffer-size"
								type="number"
								min="1"
								max="1000"
								value={bufferSize}
								onChange={(e) =>
									onBufferSizeChange(
										parseInt(e.target.value) || 1,
									)
								}
								className="w-full"
							/>
							<p className="text-xs text-muted-foreground">
								Number of messages to keep in buffer for this
								topic
							</p>
						</div>
					</CardContent>
				</Card>
				{/* Property Trees */}
				{propertyTree &&
					tabInfo &&
					(propertyTree.hasWebappData || propertyTree.hasRawData) && (
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Settings className="w-5 h-5" />
									Properties
								</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col min-h-0">
								<Tabs
									value={activeTab}
									onValueChange={
										onTabChange as (value: string) => void
									}
									className="flex-1 flex flex-col"
								>
									<TabsList className="grid w-full grid-cols-2">
										<TabsTrigger
											value="webapp"
											disabled={!tabInfo.webapp.hasData}
											className="flex items-center gap-2"
										>
											{tabInfo.webapp.label}
										</TabsTrigger>
										<TabsTrigger
											value="raw"
											disabled={!tabInfo.raw.hasData}
											className="flex items-center gap-2"
										>
											{tabInfo.raw.label}
										</TabsTrigger>
									</TabsList>

									<TabsContent
										value="webapp"
										className="flex-1 mt-4"
									>
										<ScrollArea className="h-full">
											<PropertyTree
												nodes={propertyTree.webapp}
												selectedProperty={
													selectedPropertySource ===
													"webapp"
														? selectedProperty
														: null
												}
												onPropertySelect={(path) =>
													onPropertySelect(
														path,
														"webapp",
													)
												}
												requirements={requirements}
											/>
										</ScrollArea>
									</TabsContent>

									<TabsContent
										value="raw"
										className="flex-1 mt-4"
									>
										<ScrollArea className="h-full">
											<PropertyTree
												nodes={propertyTree.raw}
												selectedProperty={
													selectedPropertySource ===
													"raw"
														? selectedProperty
														: null
												}
												onPropertySelect={(path) =>
													onPropertySelect(
														path,
														"raw",
													)
												}
												requirements={requirements}
											/>
										</ScrollArea>
									</TabsContent>
								</Tabs>
							</CardContent>
						</Card>
					)}
			</div>
		</ScrollArea>
	);
};

interface PropertyTreeProps {
	nodes: PropertyTreeNode[];
	selectedProperty: string | null;
	onPropertySelect: (path: string) => void;
	requirements?: DataRequirements;
}

const PropertyTree: React.FC<PropertyTreeProps> = ({
	nodes,
	selectedProperty,
	onPropertySelect,
	requirements,
}) => {
	const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(
		new Set(),
	);

	const toggleExpanded = (path: string) => {
		const newExpanded = new Set(expandedNodes);
		if (newExpanded.has(path)) {
			newExpanded.delete(path);
		} else {
			newExpanded.add(path);
		}
		setExpandedNodes(newExpanded);
	};

	const renderNode = (node: PropertyTreeNode, depth: number = 0) => {
		const isExpanded = expandedNodes.has(node.path);
		const isSelected = selectedProperty === node.path;
		const hasChildren = node.children.length > 0;
		const canSelect = node.isLeaf && node.type;

		return (
			<div key={node.path} className="select-none">
				<div
					className={cn(
						"flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50",
						isSelected && "bg-primary/10 border border-primary",
						node.isCompatible && "text-green-700",
						depth > 0 && "ml-4",
					)}
					onClick={() => {
						if (hasChildren) {
							toggleExpanded(node.path);
						} else if (canSelect) {
							onPropertySelect(node.path);
						}
					}}
				>
					{hasChildren ? (
						isExpanded ? (
							<ChevronDown className="w-4 h-4 text-muted-foreground" />
						) : (
							<ChevronRight className="w-4 h-4 text-muted-foreground" />
						)
					) : (
						<span className="w-4" />
					)}

					<span className="flex-1 text-sm">{node.name}</span>

					{node.type && (
						<Badge
							variant={
								node.isCompatible ? "default" : "secondary"
							}
							className="text-xs"
						>
							{node.type}
						</Badge>
					)}

					{node.isCompatible && (
						<CheckCircle2 className="w-3 h-3 text-green-500" />
					)}
				</div>

				{hasChildren && isExpanded && (
					<div className="ml-2">
						{node.children.map((child) =>
							renderNode(child, depth + 1),
						)}
					</div>
				)}
			</div>
		);
	};

	if (nodes.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="text-center">
					<Info className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
					<p className="text-sm text-muted-foreground">
						No properties available
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-1">{nodes.map((node) => renderNode(node))}</div>
	);
};
