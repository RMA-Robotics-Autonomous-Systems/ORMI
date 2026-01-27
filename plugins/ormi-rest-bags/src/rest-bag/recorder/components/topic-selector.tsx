import { useState } from "react";

import { ChevronsUpDown, CheckIcon, TrashIcon } from "lucide-react";
import { FieldType, TopicSelectorProps } from "../types";
import { Topic } from "../../recording-types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";

export const TopicSelector = ({
  topic,
  index,
  availableTopics,
  availableTypes,
  topicMap,
  onTopicChange,
  onRemoveTopic,
}: TopicSelectorProps) => {
  // State for popover visibility and search
  const [popoverOpenState, setPopoverOpenState] = useState<
    Record<FieldType, boolean>
  >({
    topic: false,
    type: false,
  });
  const [searchTerm, setSearchTerm] = useState<Record<FieldType, string>>({
    topic: "",
    type: "",
  });
  const [customInput, setCustomInput] = useState<Record<FieldType, string>>({
    topic: "",
    type: "",
  });

  // Utility for class names
  const cn = (...classes: (string | boolean | undefined)[]) =>
    classes.filter(Boolean).join(" ");

  // Field key mapping for consistency
  const fieldKeyMap = {
    topic: "name" as keyof Topic,
    type: "type" as keyof Topic,
  };

  const togglePopover = (fieldType: FieldType) => {
    setPopoverOpenState((prev) => ({
      ...prev,
      [fieldType]: !prev[fieldType],
    }));
  };

  const handleSearch = (fieldType: FieldType, value: string) => {
    setSearchTerm((prev) => ({
      ...prev,
      [fieldType]: value,
    }));
    setCustomInput((prev) => ({
      ...prev,
      [fieldType]: value,
    }));
  };

  const applyCustomInput = (fieldType: FieldType) => {
    const value = customInput[fieldType]?.trim();
    if (value) {
      onTopicChange(index, fieldKeyMap[fieldType], value);
      togglePopover(fieldType);
      setSearchTerm((prev) => ({
        ...prev,
        [fieldType]: "",
      }));
    }
  };

  // Filter available options based on search term
  const getFilteredTopics = () => {
    const term = searchTerm.topic?.toLowerCase() || "";
    if (!term) return availableTopics;
    return availableTopics.filter((t) => t.name.toLowerCase().includes(term));
  };

  const getFilteredTypes = () => {
    const term = searchTerm.type?.toLowerCase() || "";
    if (!term) return availableTypes;
    return availableTypes.filter((type) => type.toLowerCase().includes(term));
  };

  return (
    <div className="grid grid-cols-12 gap-2 p-3 border rounded-md bg-gray-50">
      {/* Topic Name Field with Autocomplete */}
      <div className="col-span-5">
        <Label htmlFor={`topic-name-${index}`} className="text-xs">
          Topic Name
        </Label>
        <Popover
          open={popoverOpenState.topic}
          onOpenChange={() => togglePopover("topic")}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={popoverOpenState.topic}
              className="w-full justify-between h-9 mt-1 text-xs"
            >
              <span className="truncate">
                {topic.name || "Select or type a topic..."}
              </span>
              <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[220px] p-0"
            align="start"
            side="bottom"
            sideOffset={5}
          >
            <div className="flex flex-col max-h-[300px]">
              <div className="flex items-center border-b p-2">
                <Input
                  value={customInput.topic || ""}
                  onChange={(e) => handleSearch("topic", e.target.value)}
                  placeholder="Search or type custom..."
                  className="flex-grow"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyCustomInput("topic")}
                  className="ml-2"
                >
                  <CheckIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-y-auto max-h-[200px] py-1" tabIndex={0}>
                {getFilteredTopics().length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-gray-500">No topics found</p>
                  </div>
                ) : (
                  getFilteredTopics().map((t) => (
                    <div
                      key={t.name}
                      className={cn(
                        "flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100",
                        topic.name === t.name ? "bg-gray-100" : "",
                      )}
                      onClick={() => {
                        onTopicChange(index, "name", t.name);
                        togglePopover("topic");
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          topic.name === t.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate text-xs">{t.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Topic Type Field with Autocomplete */}
      <div className="col-span-6">
        <Label htmlFor={`topic-type-${index}`} className="text-xs">
          Topic Type
        </Label>
        <Popover
          open={popoverOpenState.type}
          onOpenChange={() => togglePopover("type")}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={popoverOpenState.type}
              className="w-full justify-between h-9 mt-1 text-xs"
            >
              <span className="truncate">
                {topic.type || "Select or type a type..."}
              </span>
              <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[280px] p-0"
            align="start"
            side="bottom"
            sideOffset={5}
            avoidCollisions
          >
            <div className="flex flex-col max-h-[300px]">
              <div className="flex items-center border-b p-2">
                <Input
                  value={customInput.type || ""}
                  onChange={(e) => handleSearch("type", e.target.value)}
                  placeholder="Search or type custom..."
                  className="flex-grow text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyCustomInput("type")}
                  className="ml-2"
                >
                  <CheckIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-y-auto max-h-[200px] py-1" tabIndex={0}>
                {getFilteredTypes().length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-gray-500">No types found</p>
                  </div>
                ) : (
                  getFilteredTypes().map((type) => (
                    <div
                      key={type}
                      className={cn(
                        "flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100",
                        topic.type === type ? "bg-gray-100" : "",
                      )}
                      onClick={() => {
                        onTopicChange(index, "type", type);
                        togglePopover("type");
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          topic.type === type ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate text-xs">{type}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Remove Button */}
      <div className="col-span-1 flex items-end justify-center pb-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemoveTopic(index)}
          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
