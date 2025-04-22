class AddGistIndexToMoviesTitle < ActiveRecord::Migration[8.0]
  def change
    enable_extension 'pg_trgm' unless extension_enabled?('pg_trgm')

    add_index :movies, :title, using: :gist, opclass: { title: :gist_trgm_ops }, name: 'index_movies_on_title_gist_trgm'
  end
end
