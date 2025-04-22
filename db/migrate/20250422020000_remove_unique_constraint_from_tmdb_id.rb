class RemoveUniqueConstraintFromTmdbId < ActiveRecord::Migration[8.0]
  def change
    remove_index :movies, name: "index_movies_on_tmdb_id"
    add_index :movies, :tmdb_id
  end
end
