import { InfoIcon, SquareIcon } from "lucide-react";
import { RecordingStatus } from "../recording-types";
import { RestBagClient } from "../rest-bag-client";
import { useEffect, useState, useRef } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import {
  TableBody,
  TableRow,
  TableCell,
  Table,
} from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";

interface RecorderProps {
  recorder: RecordingStatus;
  client: RestBagClient;
}

export const Recorder = (props: RecorderProps) => {
  const { client } = props;

  const [recorder, setRecorder] = useState<RecordingStatus>(props.recorder);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      if (recorder.status === "STOPPED") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const rec = await client.getRecording(recorder.recording_id);

      if ("error" in rec) {
        console.error("Failed to get recording status:", rec.error);
        return;
      }

      setRecorder(rec);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const getDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours}h ${minutes}m ${secs}s`;
  };

  const stopRecording = async () => {
    setIsStoppingRecording(true);
    setStopError(null);
    let hasError = false;

    try {
      const response = (await client.stopRecording(
        recorder.recording_id,
      )) as any;

      // Check for error in response
      if (response && response.error) {
        hasError = true;
        setStopError(response.error);
        console.error("Failed to stop recording:", response.error);
      }
    } catch (error) {
      hasError = true;
      setStopError(
        error instanceof Error ? error.message : "Failed to stop recording",
      );
      console.error("Error stopping recording:", error);
    } finally {
      setIsStoppingRecording(false);

      // if no error, update the recorder status, stop the update interval
      if (!hasError) {
        setRecorder({ ...recorder, status: "STOPPED" });
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }
  };

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
        <Badge
          variant={
            recorder.status === "running"
              ? "default"
              : recorder.status === "STOPPED"
                ? "outline"
                : "secondary"
          }
          className="ml-auto"
        >
          {recorder.status}
        </Badge>

        {recorder.status !== "STOPPED" && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              stopRecording();
            }}
            disabled={isStoppingRecording}
          >
            {isStoppingRecording ? (
              <span className="animate-pulse">Stopping...</span>
            ) : (
              <SquareIcon />
            )}
          </Button>
        )}

        {stopError && <div className="text-red-500 text-xs">{stopError}</div>}

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
                {Object.entries(recorder.message_counts).map(
                  ([topic, count]) => (
                    <TableRow key={topic}>
                      <TableCell>{topic}</TableCell>
                      <TableCell>{count}</TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
};
