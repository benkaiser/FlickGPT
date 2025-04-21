class Movie < ApplicationRecord
  validates :tmdb_id, presence: true, uniqueness: true

  # Convert genres from stored comma separated string to array
  def genres_array
    genres.present? ? genres.split(',').map(&:strip) : []
  end
end
