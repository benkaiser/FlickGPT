class MoviesController < ApplicationController
  def search
    query = params[:q]
    @movies = Movie.where("title ILIKE ?", "%#{query}%")
                   .order(popularity: :desc)
                   .limit(20)

    render json: @movies
  end

  def match
    title = params[:title]
    year = params[:year]

    movie = Movie.where("title ILIKE ?", "%#{title}%")
                 .where("EXTRACT(YEAR FROM release_date) = ?", year)
                 .first

    # fallback to exact title match if no match found
    unless movie
      movie = Movie.where("title = ?", "#{title}").first
    end

    if movie
      render json: {
        title: movie.title,
        year: movie.release_date.year,
        description: movie.overview,
        imdb_id: movie.imdb_id,
        imdb_link: "https://www.imdb.com/title/#{movie.imdb_id}",
        imdb_rating: movie.vote_average,
        poster_path: movie.poster_path ? "https://image.tmdb.org/t/p/w500#{movie.poster_path}" : nil,
        backdrop_path: movie.backdrop_path ? "https://image.tmdb.org/t/p/w500#{movie.backdrop_path}" : nil
      }
    else
      render json: { error: "Movie not found" }, status: :not_found
    end
  end
end
