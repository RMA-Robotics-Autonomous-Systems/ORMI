/**
 * Identity of a rosbridge connection: the settings whose change warrants
 * tearing the socket down and building a new one. Everything else (title,
 * toasts, compression, transform-tree topics) is read live and never
 * reconnects. `enable` is core's: a disabled provider is never mounted.
 */
export function rosbridgeConnectionKey(s: {
	id: string;
	url: string;
	reconnectTimeout: number;
}): string {
	return JSON.stringify([s.id, s.url, s.reconnectTimeout]);
}
