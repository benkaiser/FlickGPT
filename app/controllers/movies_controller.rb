class MoviesController < ApplicationController
  def search
    query = params[:q]
    @results = Movie.where("title ILIKE ?", "%#{query}%")
                    .order(popularity: :desc)
                    .limit(10)

    render json: @results.map { |m| {
        tmdb_id: m.tmdb_id,
        title: m.title,
        release_date: m.release_date&.strftime('%Y-%m-%d'),
        media_type: m.media_type || 'movie'
      }
    }
  end

  def match
    title = params[:title]
    year = params[:year].to_i # Ensure year is integer

    # Prioritize exact year match first
    movie = Movie.where("title ILIKE ?", title) # Use ILIKE for case-insensitivity
                 .where("EXTRACT(YEAR FROM release_date) = ?", year)
                 .order(popularity: :desc) # Prefer more popular match if multiple exist
                 .first

    # Fallback: No year match found, match by title only
    unless movie
      movie = Movie.where("title ILIKE ?", title)
                    .order(popularity: :desc)
                    .first
    end

    if movie
      render json: {
        title: movie.title,
        year: movie.release_date&.year, # Use safe navigation
        description: movie.overview,
        genres: movie.genres_array, # Use the model method to get genres as array
        imdb_id: movie.imdb_id,
        imdb_link: movie.imdb_id ? "https://www.imdb.com/title/#{movie.imdb_id}" : nil,
        imdb_rating: movie.vote_average, # Assuming vote_average is the rating
        poster_path: movie.poster_path ? "https://image.tmdb.org/t/p/w500#{movie.poster_path}" : nil,
        backdrop_path: movie.backdrop_path ? "https://image.tmdb.org/t/p/w1280#{movie.backdrop_path}" : nil # Larger backdrop
      }
    else
      render json: { error: "Movie not found" }, status: :not_found
    end
  end

  def im_feeling_lucky_youtube
    title = params[:title]
    year = params[:year]

    # Create a search query combining title and year
    search_query = year ? "#{title} #{year} trailer" : "#{title} trailer"

    # Get the first video ID from YouTube search
    video_id = YoutubeService.search(search_query)

    if video_id
      render json: { video_id: video_id }
    else
      render json: { error: "No YouTube videos found" }, status: :not_found
    end
  end
end
