class Movie < ApplicationRecord
  validates :tmdb_id, uniqueness: { scope: :media_type }

  # Convert genres from stored comma separated string to array
  def genres_array
    genres.present? ? genres.split(',').map(&:strip) : []
  end
end
