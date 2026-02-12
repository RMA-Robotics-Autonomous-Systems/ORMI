/**
 * Request to play a bag file.
 */
export interface PlayerPlayRequest {
	bag_name: string;
	rate?: number;
	use_system_time?: boolean;
}

/**
 * Response from player play request.
 */
export interface PlayerPlayResponse {
	play_id: string;
	bag_name: string;
	rate: number;
	status: string;
}

/**
 * Player status response.
 */
export interface PlayerStatusResponse {
	play_id: string;
	status: string;
	[key: string]: any;
}

/**
 * Response from player action.
 */
export interface PlayerActionResponse {
	play_id: string;
	status: string;
}

/**
 * Response listing all active players.
 */
export interface PlayerListResponse {
	active_players: {
		play_id: string;
		bag_name: string;
		status: string;
	}[];
	all_status: {
		[play_id: string]: PlayerStatusResponse;
	};
}
