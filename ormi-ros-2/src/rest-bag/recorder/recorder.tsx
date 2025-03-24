import { InfoIcon, SquareIcon } from "lucide-react";
import { RecordingStatus } from "../recording-types";
import { Badge, Button, Card, CardHeader, CardTitle, Table, TableBody, TableRow, TableCell, Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "ormi-core/components"


export const Recorder = (recorder: RecordingStatus) => {

    const getDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${hours}h ${minutes}m ${secs}s`;
    }

    return (
        <Card className="flex items-center gap-2">

            <CardHeader className="py-3">
                <div className="flex flex-col">
                    <CardTitle className="text-lg font-medium">{recorder.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Duration: {getDuration(recorder.recording_time)}
                    </p>
                </div>
            </CardHeader>
            <div className="flex items-center justify-end gap-2 w-full p-3">

                <Badge variant={recorder.status === "running" ? "default" : recorder.status === "PAUSED" ? "outline" : "secondary"} className="ml-auto">
                    {recorder.status}
                </Badge>

                <Button size="sm" variant="destructive" onClick={() => { }}>
                    <SquareIcon />
                </Button>

                <Dialog>

                    <DialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                            <InfoIcon />
                        </Button>
                    </DialogTrigger>

                    <DialogContent>
                        <DialogTitle>{recorder.name}</DialogTitle>
                        <DialogDescription>
                            Recording duration: {getDuration(recorder.recording_time)}
                        </DialogDescription>
                        <Table>
                            <TableBody>
                                {Object.entries(recorder.message_counts).map(([topic, count]) => (
                                    <TableRow key={topic}>
                                        <TableCell>{topic}</TableCell>
                                        <TableCell>{count}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </DialogContent>

                </Dialog>
            </div>

        </Card>
    );

}