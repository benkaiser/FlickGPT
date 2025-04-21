class CreateMovies < ActiveRecord::Migration[7.0]
  def change
    create_table :movies do |t|
      t.integer :tmdb_id, null: false
      t.string :imdb_id
      t.string :title
      t.string :original_title
      t.decimal :vote_average, precision: 3, scale: 1
      t.integer :vote_count
      t.date :release_date
      t.integer :runtime
      t.string :backdrop_path
      t.string :poster_path
      t.text :overview
      t.decimal :popularity, precision: 10, scale: 3
      t.string :tagline
      t.text :genres

      t.timestamps
    end

    add_index :movies, :tmdb_id, unique: true
    add_index :movies, :imdb_id
    add_index :movies, :title
    add_index :movies, :release_date
    add_index :movies, :vote_average
    add_index :movies, :popularity
  end
end
