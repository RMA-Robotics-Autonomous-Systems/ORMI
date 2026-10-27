/**
 * Identity of a rosbridge connection: the settings whose change warrants
 * tearing the socket down and building a new one. Everything else (title,
 * toasts, compression, transform-tree topics) is read live and never
 * reconnects.
 */
export function rosbridgeConnectionKey(s: {
	id: string;
	enable: boolean;
	url: string;
	reconnectTimeout: number;
}): string {
	return JSON.stringify([s.id, s.enable, s.url, s.reconnectTimeout]);
}
