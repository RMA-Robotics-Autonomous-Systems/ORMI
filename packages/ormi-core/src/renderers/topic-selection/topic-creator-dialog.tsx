import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@workspace/ui/components/dialog';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@workspace/ui/components/select';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Loader2, AlertTriangle } from 'lucide-react';

import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { DatasourceDefinition, DatasourceProviderSettings, DatasourceTopic } from '../../datasources/datasource-interface';
import { DataRequirements } from '../../widgets/widget-interface';
import { useDashboardManager } from '../../dashboard/components/dashboard-provider';
import { WebTypes } from '../../types/jsonSchema';

interface TopicCreatorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onTopicCreated: (topic: DatasourceTopic) => void;
    requirements?: DataRequirements;
}

interface TopicCreationForm {
    datasourceId: string;
    topicName: string;
    webappType: string;
    rawType: string;
}

// Use the centralized WebTypes from the type system
// This ensures we stay decoupled from specific protocols like ROS

export const TopicCreatorDialog: React.FC<TopicCreatorDialogProps> = ({
    isOpen,
    onClose,
    onTopicCreated,
    requirements
}) => {
    const pluginsManager = usePluginsManager();
    const { datasources } = useDashboardManager();

    const [form, setForm] = useState<TopicCreationForm>({
        datasourceId: '',
        topicName: '',
        webappType: '',
        rawType: ''
    });

    const [availableRawTypes, setAvailableRawTypes] = useState<string[]>([]);
    const [isLoadingRawTypes, setIsLoadingRawTypes] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get available datasources
    const availableDatasources = Array.from(datasources.values());

    // Filter webapp types based on requirements
    const filteredWebappTypes = requirements?.accepts
        ? WebTypes.filter((type: string) => requirements.accepts.includes(type))
        : WebTypes;

    // Load compatible raw types when datasource or webapp type changes
    useEffect(() => {
        if (!form.datasourceId || !form.webappType) {
            setAvailableRawTypes([]);
            return;
        }

        const loadRawTypes = async () => {
            setIsLoadingRawTypes(true);
            setError(null);

            try {
                // Try to get raw types from the datasource via plugin hooks
                const rawTypes = await pluginsManager.applyFilterAsync<string[]>(
                    `${form.datasourceId}-available-types`,
                    [],
                    [form.webappType]
                );

                if (rawTypes && rawTypes.length > 0) {
                    setAvailableRawTypes(rawTypes);
                } else {
                    // No raw types available from this datasource
                    setAvailableRawTypes([]);
                }
            } catch (error) {
                console.warn('Failed to load raw types:', error);
                setAvailableRawTypes([]);
            } finally {
                setIsLoadingRawTypes(false);
            }
        };

        loadRawTypes();
    }, [form.datasourceId, form.webappType, pluginsManager]);

    const handleFormChange = (field: keyof TopicCreationForm, value: string) => {
        setForm(prev => ({
            ...prev,
            [field]: value,
            // Reset dependent fields
            ...(field === 'datasourceId' && { rawType: '' }),
            ...(field === 'webappType' && { rawType: '' })
        }));
        setError(null);
    };

    const validateForm = (): string | null => {
        if (!form.datasourceId) return 'Please select a datasource';
        if (!form.topicName.trim()) return 'Please enter a topic name';
        if (!form.webappType) return 'Please select a webapp type';

        // Only require raw type if there are available raw types
        if (availableRawTypes.length > 0 && !form.rawType) {
            return 'Please select a raw type';
        }

        // Validate topic name format
        if (!/^[a-zA-Z0-9_/]+$/.test(form.topicName)) {
            return 'Topic name can only contain letters, numbers, underscores, and forward slashes';
        }

        return null;
    };

    const handleCreate = async () => {
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const selectedDatasource = datasources.get(form.datasourceId);
            if (!selectedDatasource) {
                throw new Error('Selected datasource not found');
            }

            // Create the new topic
            const newTopic: DatasourceTopic = {
                topic: form.topicName,
                datasource_id: selectedDatasource.datasource_id,
                source: selectedDatasource.settings,
                type: form.webappType,
                rawType: form.rawType || 'unknown', // Use selected raw type or 'unknown' if none available
                bufferSize: 100 // Default buffer size
            };

            onTopicCreated(newTopic);
            onClose();

            // Reset form
            setForm({
                datasourceId: '',
                topicName: '',
                webappType: '',
                rawType: ''
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to create topic');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCancel = () => {
        setError(null);
        onClose();
    };

    const canCreate = form.datasourceId &&
        form.topicName.trim() &&
        form.webappType &&
        (availableRawTypes.length === 0 || form.rawType) &&
        !isCreating;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Topic</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Datasource Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="datasource">Datasource</Label>
                        <Select
                            value={form.datasourceId}
                            onValueChange={(value) => handleFormChange('datasourceId', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a datasource" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableDatasources.map((datasource) => (
                                    <SelectItem key={datasource.settings.id} value={datasource.settings.id}>
                                        {datasource.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Topic Name */}
                    <div className="space-y-2">
                        <Label htmlFor="topicName">Topic Name</Label>
                        <Input
                            id="topicName"
                            placeholder="/my_custom_topic"
                            value={form.topicName}
                            onChange={(e) => handleFormChange('topicName', e.target.value)}
                        />
                    </div>

                    {/* Webapp Type */}
                    <div className="space-y-2">
                        <Label htmlFor="webappType">Webapp Type</Label>
                        <Select
                            value={form.webappType}
                            onValueChange={(value) => handleFormChange('webappType', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select webapp type" />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredWebappTypes.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {requirements && (
                            <p className="text-xs text-muted-foreground">
                                Types filtered by widget requirements
                            </p>
                        )}
                    </div>

                    {/* Raw Type */}
                    {(availableRawTypes.length > 0 || isLoadingRawTypes) && (
                        <div className="space-y-2">
                            <Label htmlFor="rawType">Raw Type</Label>
                            <Select
                                value={form.rawType}
                                onValueChange={(value) => handleFormChange('rawType', value)}
                                disabled={!form.datasourceId || !form.webappType || isLoadingRawTypes || availableRawTypes.length === 0}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={
                                        isLoadingRawTypes ? "Loading..." :
                                            availableRawTypes.length === 0 ? "No raw types available" :
                                                "Select raw type"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableRawTypes.map((type: string) => (
                                        <SelectItem key={type} value={type}>
                                            {type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {isLoadingRawTypes && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Loading compatible types...
                                </div>
                            )}
                            {!isLoadingRawTypes && availableRawTypes.length === 0 && form.datasourceId && form.webappType && (
                                <p className="text-xs text-muted-foreground">
                                    This datasource doesn't provide raw type information
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Info about topic creation */}
                    <Alert>
                        <AlertDescription className="text-xs">
                            This will create a topic definition that can be selected in widgets.
                            The actual data flow depends on the datasource supporting this topic.
                        </AlertDescription>
                    </Alert>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel} disabled={isCreating}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!canCreate}>
                        {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Create Topic
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};