
export interface PlayerPlayRequest {
  bag_name: string;
  rate?: number;
}

export interface PlayerPlayResponse {
  play_id: string;
  bag_name: string;
  rate: number;
  status: string;
}

export interface PlayerStatusResponse {
  play_id: string;
  status: string;
  [key: string]: any; // For any additional fields in the status
}

export interface PlayerActionResponse {
  play_id: string;
  status: string;
}

export interface PlayerListResponse {
  active_players: {
    play_id: string;
    status: string;
  }[];
  all_status: {
    [play_id: string]: PlayerStatusResponse;
  };
}
