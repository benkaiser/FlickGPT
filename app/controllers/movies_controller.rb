class MoviesController < ApplicationController
  def search
    query = params[:q]
    @movies = Movie.where("title ILIKE ?", "%#{query}%")
                   .order(popularity: :desc)
                   .limit(20)

    render json: @movies
  end
end
