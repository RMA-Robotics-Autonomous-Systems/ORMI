import React, { useState } from "react";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { CheckCircle2, XCircle, Info, Plus, Wifi, WifiOff } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import { DataRequirements } from "../../widgets/widget-interface";
import { TopicCompatibilityResult } from "../../widgets/topic-compatibility";
import { TopicCreatorDialog } from "./topic-creator-dialog";

interface TopicBrowserProps {
  topics: DatasourceTopic[];
  selectedTopic: DatasourceTopic | null;
  onTopicSelect: (topic: DatasourceTopic) => void;
  compatibilityAnalysis: Map<string, TopicCompatibilityResult>;
  requirements?: DataRequirements;
  searchTerm: string;
  showOnlyCompatible: boolean;
  isLoading: boolean;
  onTopicCreated?: (topic: DatasourceTopic) => void;
}

export const TopicBrowser: React.FC<TopicBrowserProps> = ({
  topics,
  selectedTopic,
  onTopicSelect,
  compatibilityAnalysis,
  requirements,
  searchTerm,
  showOnlyCompatible,
  isLoading,
  onTopicCreated,
}) => {
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  const handleTopicCreated = (newTopic: DatasourceTopic) => {
    if (onTopicCreated) {
      onTopicCreated(newTopic);
    }
    setIsCreatorOpen(false);
  };

  const getCompatibilityStatus = (topic: DatasourceTopic) => {
    if (!requirements) return "unknown";

    const key = `${topic.topic}@${topic.source.id}`;
    const analysis = compatibilityAnalysis.get(key);

    if (!analysis) return "analyzing";
    if (analysis.isCompatible) return "compatible";
    return "incompatible";
  };

  const getCompatibilityIcon = (status: string) => {
    switch (status) {
      case "compatible":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "incompatible":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "analyzing":
        return <Spinner className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTypeDisplay = (topic: DatasourceTopic) => {
    if (topic.type) {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-xs">
            {topic.type}
          </Badge>
          {topic.rawType && topic.rawType !== topic.type && (
            <Badge variant="outline" className="text-xs">
              {topic.rawType}
            </Badge>
          )}
        </div>
      );
    }

    if (topic.rawType) {
      return (
        <Badge variant="outline" className="text-xs">
          {topic.rawType}*
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        unknown
      </Badge>
    );
  };

  const getConnectionStatus = (topic: DatasourceTopic) => {
    // This could be enhanced to show actual connection status
    // For now, assume all topics are connected if they're in the list
    return <Wifi className="w-3 h-3 text-green-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Topics</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="w-6 h-6" />
            <span className="text-sm text-muted-foreground">
              Loading topics...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Topics (0)</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => setIsCreatorOpen(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Create
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div className="text-center">
            <Info className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchTerm
                ? "No topics match your search"
                : "No topics available"}
            </p>
            {showOnlyCompatible && (
              <p className="text-xs text-muted-foreground mt-1">
                Try disabling the compatibility filter
              </p>
            )}
          </div>
        </div>
        {/* Topic Creator Dialog */}
        <TopicCreatorDialog
          isOpen={isCreatorOpen}
          onClose={() => setIsCreatorOpen(false)}
          onTopicCreated={handleTopicCreated}
          requirements={requirements}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Topics ({topics.length})</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => setIsCreatorOpen(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Create
          </Button>
        </div>
      </div>

      {/* Topic List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {topics.map((topic) => {
            const isSelected =
              selectedTopic?.topic === topic.topic &&
              selectedTopic?.source.id === topic.source.id;
            const compatibilityStatus = getCompatibilityStatus(topic);

            return (
              <div
                key={`${topic.topic}@${topic.source.id}`}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-colors",
                  "hover:bg-muted/50",
                  isSelected && "bg-primary/10 border-primary",
                )}
                onClick={() => onTopicSelect(topic)}
              >
                {/* Topic Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {topic.topic}
                      </span>
                      {getCompatibilityIcon(compatibilityStatus)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{topic.source.title}</span>
                      {getConnectionStatus(topic)}
                    </div>
                  </div>
                </div>

                {/* Topic Types */}
                <div className="flex flex-wrap gap-1">
                  {getTypeDisplay(topic)}
                </div>

                {/* Compatibility Info */}
                {requirements && compatibilityStatus === "compatible" && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-xs text-green-600">
                      ✓ Compatible with requirements
                    </div>
                  </div>
                )}

                {requirements && compatibilityStatus === "incompatible" && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-xs text-red-600">✗ Not compatible</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Topic Creator Dialog */}
      <TopicCreatorDialog
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onTopicCreated={handleTopicCreated}
        requirements={requirements}
      />
    </div>
  );
};
