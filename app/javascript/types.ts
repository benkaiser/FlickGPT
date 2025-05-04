export interface Movie {
  // From Recommendation/Search
  title: string;
  year: number;
  genres?: string[];
  description?: string;
  reason?: string; // Added by LLM
  // From Match Endpoint
  poster_path?: string;
  imdb_link?: string;
  imdb_id?: string;
  imdb_rating?: number;
  imdb_vote_count?: number;
  backdrop_path?: string;
  // From Search Input Component
  tmdb_id?: number; // Or relevant ID from your Movie model
  release_date?: string; // Or Date
  overview?: string;
  popularity?: number;
  vote_average?: number;
  media_type?: string;
}

export interface Rating {
  imdb_id: string;
  user_rating: number;
  date_rated: string;
  title: string;
  year: number;
  genres: string;
  // Other fields if needed
}
