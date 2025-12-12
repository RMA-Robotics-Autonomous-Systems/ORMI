"use client"

import React, { useEffect, useState, useMemo, useCallback } from "react"
import {
    DndContext,
    DragOverlay,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    defaultDropAnimationSideEffects,
    DropAnimation,
    UniqueIdentifier,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable"
import { Category } from "@prisma/client"
import { createPortal } from "react-dom"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceItem } from "../workspace-item"
import { KanbanColumn } from "./column"
import { WorkspaceWithCategory, WorkspaceUpdate } from "./types"

interface KanbanViewProps {
    onWorkspaceDeleted: () => void
    onWorkspaceUpdate: (updates: WorkspaceUpdate[]) => Promise<void>
}

export function KanbanView({ onWorkspaceDeleted, onWorkspaceUpdate }: KanbanViewProps) {
    const [workspaces, setWorkspaces] = useState<WorkspaceWithCategory[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
    const [activeColumn, setActiveColumn] = useState<Category | null>(null)
    const [originalActiveContainer, setOriginalActiveContainer] = useState<UniqueIdentifier | null>(null)

    // Category management state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState("")
    const [editingCategory, setEditingCategory] = useState<Category | null>(null)
    const [editCategoryName, setEditCategoryName] = useState("")

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const fetchData = useCallback(async () => {
        try {
            const [wsRes, catRes] = await Promise.all([
                fetch("/api/workspaces"),
                fetch("/api/categories"),
            ])

            if (wsRes.ok && catRes.ok) {
                const wsData = await wsRes.json()
                const catData = await catRes.json()
                setWorkspaces(wsData)
                setCategories(catData)
            }
        } catch (error) {
            console.error("Failed to fetch data", error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return

        try {
            const response = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newCategoryName }),
            })

            if (!response.ok) throw new Error("Failed to create category")

            const newCategory = await response.json()
            setCategories([...categories, newCategory])
            setNewCategoryName("")
            setIsCreateDialogOpen(false)
            toast("Category created")
        } catch (error) {
            console.error(error)
            toast("Failed to create category")
        }
    }

    const handleUpdateCategory = async () => {
        if (!editingCategory || !editCategoryName.trim()) return

        try {
            const response = await fetch(`/api/categories/${editingCategory.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editCategoryName }),
            })

            if (!response.ok) throw new Error("Failed to update category")

            const updatedCategory = await response.json()
            setCategories(categories.map(c => c.id === updatedCategory.id ? updatedCategory : c))
            setEditingCategory(null)
            setEditCategoryName("")
            toast("Category updated")
        } catch (error) {
            console.error(error)
            toast("Failed to update category")
        }
    }

    const handleDeleteCategory = async (categoryId: number) => {
        try {
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: "DELETE",
            })

            if (!response.ok) throw new Error("Failed to delete category")

            setCategories(categories.filter(c => c.id !== categoryId))
            // Move workspaces to uncategorized locally
            setWorkspaces(workspaces.map(w =>
                w.categoryId === categoryId ? { ...w, categoryId: null } : w
            ))
            toast("Category deleted")
        } catch (error) {
            console.error(error)
            toast("Failed to delete category")
        }
    }

    // Organize workspaces into columns
    const columns = useMemo(() => {
        const cols: Record<string, WorkspaceWithCategory[]> = {}

        // Initialize category columns
        categories.forEach(cat => {
            cols[`category-${cat.id}`] = []
        })

        // Initialize uncategorized column
        cols["category-uncategorized"] = []

        // Distribute workspaces
        workspaces.forEach(ws => {
            if (ws.categoryId) {
                const key = `category-${ws.categoryId}`
                if (cols[key]) {
                    cols[key].push(ws)
                } else {
                    // Fallback if category doesn't exist locally
                    cols["category-uncategorized"]?.push(ws)
                }
            } else {
                cols["category-uncategorized"]?.push(ws)
            }
        })

        return cols
    }, [workspaces, categories])

    const handleDragStart = (event: DragStartEvent) => {
        if (event.active.data.current?.type === "Column") {
            setActiveColumn(event.active.data.current.category)
            setActiveId(event.active.id)
            return
        }
        setActiveId(event.active.id)
        // Store the original container before any dragOver changes it
        const container = findContainer(event.active.id)
        setOriginalActiveContainer(container || null)
    }

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return

        // Ignore column drag over
        if (active.data.current?.type === "Column") return

        const activeId = active.id
        const overId = over.id

        // Find the containers
        const activeContainer = findContainer(activeId)
        const overContainer = findContainer(overId)

        if (
            !activeContainer ||
            !overContainer ||
            activeContainer === overContainer
        ) {
            return
        }

        setWorkspaces((prev) => {
            const activeWorkspace = prev.find(w => `workspace-${w.id}` === activeId)
            if (!activeWorkspace) return prev

            const overContainerStr = String(overContainer)
            const newCategoryId = overContainerStr === "category-uncategorized"
                ? null
                : parseInt(overContainerStr.replace("category-", ""))

            return prev.map(w => {
                if (w.id === activeWorkspace.id) {
                    return { ...w, categoryId: newCategoryId }
                }
                return w
            })
        })
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event

        if (!over) {
            setActiveId(null)
            setActiveColumn(null)
            return
        }

        // Handle Column Drag
        if (active.data.current?.type === "Column") {
            if (active.id !== over.id) {
                const oldIndex = categories.findIndex(c => `category-${c.id}` === active.id)
                const newIndex = categories.findIndex(c => `category-${c.id}` === over.id)

                if (oldIndex !== -1 && newIndex !== -1) {
                    const newCategories = arrayMove(categories, oldIndex, newIndex)
                    setCategories(newCategories)

                    // Persist order
                    try {
                        const updates = newCategories.map((cat, index) => ({
                            id: cat.id,
                            order: index
                        }))

                        await fetch("/api/categories", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ updates })
                        })
                    } catch (error) {
                        console.error("Failed to update category order", error)
                        toast("Failed to save category order")
                    }
                }
            }
            setActiveId(null)
            setActiveColumn(null)
            setOriginalActiveContainer(null)
            return
        }

        const activeId = active.id
        const overId = over ? over.id : null

        if (!overId) {
            setActiveId(null)
            setOriginalActiveContainer(null)
            return
        }

        // Use the ORIGINAL container (from dragStart), not the current one (which may have changed in dragOver)
        const activeContainer = originalActiveContainer
        const overContainer = findContainer(overId)

        if (activeContainer && overContainer) {
            const activeWorkspace = workspaces.find(w => `workspace-${w.id}` === activeId)
            if (!activeWorkspace) {
                setActiveId(null)
                return
            }

            const activeItems = columns[activeContainer] || []
            const overItems = columns[overContainer] || []
            const activeIndex = activeItems.findIndex(w => `workspace-${w.id}` === activeId)
            const overIndex = overItems.findIndex(w => `workspace-${w.id}` === overId)

            let updates: WorkspaceUpdate[] = []

            if (activeContainer === overContainer) {
                if (activeIndex !== overIndex) {
                    const newItems = arrayMove(activeItems, activeIndex, overIndex)

                    updates = newItems.map((w, index) => ({
                        id: w.id,
                        order: index,
                        categoryId: w.categoryId
                    }))
                }
            } else {
                const overContainerStr = String(overContainer)
                const newCategoryId = overContainerStr === "category-uncategorized"
                    ? null
                    : parseInt(overContainerStr.replace("category-", ""))

                let newIndex
                if (overId in columns) {
                    newIndex = overItems.length
                } else {
                    const isBelowOverItem =
                        over &&
                        active.rect.current.translated &&
                        active.rect.current.translated.top >
                        over.rect.top + over.rect.height

                    const modifier = isBelowOverItem ? 1 : 0
                    newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length
                }

                const newActiveItems = [...activeItems]
                newActiveItems.splice(activeIndex, 1)

                const newOverItems = [...overItems]
                // Clamp index
                const insertIndex = Math.max(0, Math.min(newIndex, newOverItems.length))

                const updatedWorkspace = { ...activeWorkspace, categoryId: newCategoryId }
                newOverItems.splice(insertIndex, 0, updatedWorkspace)

                const activeUpdates = newActiveItems.map((w, index) => ({
                    id: w.id,
                    order: index,
                    categoryId: w.categoryId
                }))

                const overUpdates = newOverItems.map((w, index) => ({
                    id: w.id,
                    order: index,
                    categoryId: w.categoryId
                }))

                updates = [...activeUpdates, ...overUpdates]
            }

            if (updates.length > 0) {
                // Optimistic update
                setWorkspaces(prev => {
                    const next = prev.map(w => {
                        const update = updates.find(u => u.id === w.id)
                        if (update) {
                            return {
                                ...w,
                                order: update.order,
                                categoryId: update.categoryId !== undefined ? update.categoryId : w.categoryId
                            }
                        }
                        return w
                    })
                    // Sort by order to ensure columns are rendered correctly
                    return next.sort((a, b) => (a.order || 0) - (b.order || 0))
                })

                try {
                    await onWorkspaceUpdate(updates)
                } catch (error) {
                    console.error("Failed to update workspaces", error)
                    toast("Failed to save changes")
                    // Revert? For now just show error
                }
            }
        }

        setActiveId(null)
        setOriginalActiveContainer(null)
    }

    const findContainer = (id: UniqueIdentifier) => {
        if (id in columns) {
            return id
        }

        return Object.keys(columns).find((key) =>
            columns[key]?.find((w) => `workspace-${w.id}` === id)
        )
    }

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: {
                    opacity: '0.5',
                },
            },
        }),
    }

    if (isLoading) {
        return <div>Loading...</div>
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-wrap gap-4 pb-4">
                <SortableContext
                    items={categories.map(c => `category-${c.id}`)}
                    strategy={rectSortingStrategy}
                >
                    {categories.map((category) => {
                        const colId = `category-${category.id}`
                        return (
                            <KanbanColumn
                                key={colId}
                                id={colId}
                                title={category.name}
                                items={columns[colId] || []}
                                onWorkspaceDeleted={onWorkspaceDeleted}
                                categoryId={category.id}
                                onEdit={(cat) => {
                                    setEditingCategory(categories.find(c => c.id === cat.id) || null)
                                    setEditCategoryName(cat.name)
                                }}
                                onDelete={handleDeleteCategory}
                            />
                        )
                    })}
                </SortableContext>

                {/* Uncategorized Column - Not Sortable */}
                {columns["category-uncategorized"] && columns["category-uncategorized"].length > 0 && (
                    <KanbanColumn
                        id="category-uncategorized"
                        title="Uncategorized"
                        items={columns["category-uncategorized"]}
                        onWorkspaceDeleted={onWorkspaceDeleted}
                        categoryId={-1}
                    />
                )}

                <div className="min-w-[350px]">
                    <Button
                        variant="outline"
                        className="h-[50px] w-full border-dashed"
                        onClick={() => setIsCreateDialogOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Category
                    </Button>
                </div>
            </div>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Category</DialogTitle>
                        <DialogDescription>
                            Add a new category to organize your workspaces.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateCategory()
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateCategory}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Category</DialogTitle>
                        <DialogDescription>
                            Change the name of this category.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Category name"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateCategory()
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingCategory(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateCategory}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeColumn ? (
                        <KanbanColumn
                            id={`category-${activeColumn.id}`}
                            title={activeColumn.name}
                            items={columns[`category-${activeColumn.id}`] || []}
                            onWorkspaceDeleted={onWorkspaceDeleted}
                            categoryId={activeColumn.id}
                        />
                    ) : activeId ? (
                        <div className="w-[300px]">
                            <WorkspaceItem
                                workspace={workspaces.find(w => `workspace-${w.id}` === activeId)!}
                            />
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    )
}
