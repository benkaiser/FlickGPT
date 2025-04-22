class UpdateMoviesUniqueIndex < ActiveRecord::Migration[8.0]
  def change
    add_column :movies, :type, :string, null: false, default: 'movie'
    add_index :movies, [:tmdb_id, :type], name: "index_movies_on_tmdb_id_and_type", unique: true
  end
end
